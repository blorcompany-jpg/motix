import { and, asc, desc, eq, ilike, inArray, isNotNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  completeSessionSchema,
  daySchema,
  freeSessionSchema,
  logSetSchema,
  sensorSetSchema,
  sportProfileSchema,
  type Limitation,
  type Muscle,
  type PlanResponse,
  type SensorSetResponse,
  type SportProfile,
} from '@motix/shared';
import { requireRole } from '../auth';
import { exercises, measurements, plans, sensorReadings, sensors, sessionExercises, setLogs, sportProfiles, trainers, users, workoutSessions } from '../db/schema';
import { AiUnavailable } from '../lib/ai';
import { assertPlausibleDay, toDay } from '../lib/days';
import { AppError, badRequest, conflict, forbidden, notFound, parse } from '../lib/errors';
import { rolloverPlan } from '../services/adaptation';
import { track } from '../services/events';
import { usableSensors } from '../services/sensors';
import { hasPremium } from '../services/subscription';
import { generatePlan, ownSession, sessionDetail, sessionSummaries, sessionSummary } from '../services/training';

const idParam = z.object({ id: z.string().uuid() });

export async function trainingRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { db } = ctx;
  const me = (req: FastifyRequest) => requireRole(req, 'user').userId;

  /* ---------- Questionario iniziale ---------- */
  const readProfile = async (userId: string): Promise<SportProfile> => {
    const [row] = await db
      .select({ p: sportProfiles, sex: users.sex })
      .from(users)
      .leftJoin(sportProfiles, eq(sportProfiles.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);
    const p = row?.p;
    return {
      sex: row?.sex ?? null,
      weightKg: p?.weightKg ? Number(p.weightKg) : null,
      heightCm: p?.heightCm ?? null,
      goal: p?.goal ?? null,
      level: p?.level ?? null,
      daysPerWeek: p?.daysPerWeek ?? null,
      equipment: p?.equipment ?? [],
      limitations: (p?.limitations ?? []) as Limitation[],
    };
  };

  app.get('/me/profile', async (req) => readProfile(me(req)));

  app.put('/me/profile', async (req) => {
    const userId = me(req);
    const input = parse(sportProfileSchema, req.body);
    const now = ctx.now();
    const values = {
      weightKg: String(input.weightKg),
      heightCm: input.heightCm,
      goal: input.goal,
      level: input.level,
      daysPerWeek: input.daysPerWeek,
      equipment: input.equipment as string[],
      limitations: input.limitations as string[],
      updatedAt: now,
    };
    await db.transaction(async (tx) => {
      await tx.update(users).set({ sex: input.sex, updatedAt: now }).where(eq(users.id, userId));
      await tx.insert(sportProfiles).values({ userId, ...values }).onConflictDoUpdate({ target: sportProfiles.userId, set: values });
      // Il peso del questionario è anche la prima misura nei progressi.
      const [first] = await tx.select({ id: measurements.id }).from(measurements).where(eq(measurements.userId, userId)).limit(1);
      if (!first) await tx.insert(measurements).values({ userId, day: toDay(now), weightKg: String(input.weightKg) });
    });
    await track(db, 'questionario_completato', { userId });
    return readProfile(userId);
  });

  /* ---------- Libreria esercizi ---------- */
  app.get('/exercises', async (req) => {
    requireRole(req, 'user', 'personal_trainer', 'admin');
    const { q } = parse(z.object({ q: z.string().trim().max(60).optional() }), req.query);
    const rows = await db
      .select()
      .from(exercises)
      .where(and(eq(exercises.reviewStatus, 'approved'), q ? ilike(exercises.name, `%${q.replace(/[%_]/g, '')}%`) : undefined))
      .orderBy(asc(exercises.name))
      .limit(200);
    return {
      exercises: rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        muscles: r.muscles as Muscle[],
        equipment: r.equipment,
        level: r.level,
        loadable: r.loadable,
        unit: r.unit,
      })),
    };
  });

  /* ---------- Piano ---------- */
  const readPlan = async (userId: string): Promise<PlanResponse> => {
    // Se la settimana è finita, il piano si aggiorna prima di essere mostrato.
    await rolloverPlan(ctx, userId);
    const [plan] = await db
      .select()
      .from(plans)
      .where(and(eq(plans.userId, userId), eq(plans.status, 'active')))
      .orderBy(desc(plans.createdAt))
      .limit(1);
    if (!plan) return { plan: null };
    const sessions = await db
      .select({ id: workoutSessions.id })
      .from(workoutSessions)
      .where(eq(workoutSessions.planId, plan.id))
      .orderBy(asc(workoutSessions.scheduledDate));
    const summaries = await sessionSummaries(db, sessions.map((s) => s.id));
    let rationale: string[] = [];
    try {
      rationale = JSON.parse(plan.rationale ?? '[]');
    } catch {
      rationale = plan.rationale ? [plan.rationale] : [];
    }
    let trainerName: string | null = null;
    if (plan.authorTrainerId) {
      const [t] = await db
        .select({ firstName: users.firstName, lastName: users.lastName })
        .from(trainers)
        .innerJoin(users, eq(users.id, trainers.userId))
        .where(eq(trainers.id, plan.authorTrainerId))
        .limit(1);
      if (t) trainerName = `${t.firstName} ${t.lastName}`;
    }
    return {
      plan: {
        id: plan.id,
        author: plan.author,
        trainerName,
        weekStart: plan.weekStart,
        version: plan.version,
        rationale,
        changes: plan.changes ?? [],
        sessions: sessions.map((s) => summaries.get(s.id)!).filter(Boolean),
      },
    };
  };

  app.get('/me/plan', async (req) => readPlan(me(req)));

  /** Il piano personalizzato è una funzione Premium (sezione 3.1). */
  app.post('/me/plan/generate', async (req, reply) => {
    const userId = me(req);
    const { day } = parse(daySchema, req.body);
    assertPlausibleDay(day, ctx.now());
    if (!(await hasPremium(ctx, userId)))
      throw forbidden('Il piano personalizzato è incluso in Premium: attiva l’abbonamento per generarne uno nuovo', 'premium_required');
    await generatePlan(ctx, userId, day);
    return reply.code(201).send(await readPlan(userId));
  });

  /* ---------- Sedute ---------- */

  /** Diario degli allenamenti: le sedute completate, dalla più recente. */
  app.get('/me/sessions', async (req) => {
    const userId = me(req);
    const rows = await db
      .select({ id: workoutSessions.id })
      .from(workoutSessions)
      .where(and(eq(workoutSessions.userId, userId), isNotNull(workoutSessions.completedAt)))
      .orderBy(desc(workoutSessions.scheduledDate))
      .limit(60);
    const summaries = await sessionSummaries(db, rows.map((r) => r.id));
    return { sessions: rows.map((r) => summaries.get(r.id)!).filter(Boolean) };
  });

  /** Allenamento libero: l'utente sceglie gli esercizi dalla libreria (disponibile anche nella versione gratuita). */
  app.post('/me/sessions', async (req, reply) => {
    const userId = me(req);
    const input = parse(freeSessionSchema, req.body);
    assertPlausibleDay(input.day, ctx.now());
    const ids = [...new Set(input.exerciseIds)];
    const found = await db
      .select({ id: exercises.id, unit: exercises.unit })
      .from(exercises)
      .where(and(inArray(exercises.id, ids), eq(exercises.reviewStatus, 'approved')));
    if (found.length !== ids.length) throw notFound('Uno degli esercizi non è disponibile');
    const sessionId = await db.transaction(async (tx) => {
      const [s] = await tx
        .insert(workoutSessions)
        .values({ userId, title: input.title ?? 'Allenamento libero', scheduledDate: input.day })
        .returning();
      await tx.insert(sessionExercises).values(
        ids.map((exerciseId, i) => {
          const unit = found.find((f) => f.id === exerciseId)!.unit;
          return {
            sessionId: s!.id,
            exerciseId,
            position: i + 1,
            targetSets: unit === 'minutes' ? 1 : 3,
            targetReps: unit === 'minutes' ? 10 : unit === 'seconds' ? 30 : 10,
            restSeconds: unit === 'minutes' ? 0 : 60,
          };
        }),
      );
      return s!.id;
    });
    return reply.code(201).send(await sessionDetail(db, userId, sessionId));
  });

  app.get('/me/sessions/:id', async (req) => sessionDetail(db, me(req), parse(idParam, req.params).id));

  app.post('/me/sessions/:id/start', async (req) => {
    const userId = me(req);
    const { id } = parse(idParam, req.params);
    const s = await ownSession(db, userId, id);
    if (s.completedAt) throw conflict('session_completed', 'Questa seduta è già stata completata');
    if (!s.startedAt) {
      await db.update(workoutSessions).set({ startedAt: ctx.now() }).where(eq(workoutSessions.id, id));
      await track(db, 'seduta_iniziata', { userId });
    }
    return sessionDetail(db, userId, id);
  });

  /**
   * Registra una serie letta dal sensore motix pod: l'app manda le accelerazioni, il motore AI conta le
   * ripetizioni e misura velocità e regolarità. Il sensore è una funzione Premium (sezione 3.1).
   */
  app.post('/me/sessions/:id/sets/sensor', { bodyLimit: 6 * 1024 * 1024 }, async (req): Promise<SensorSetResponse> => {
    const userId = me(req);
    const { id } = parse(idParam, req.params);
    const input = parse(sensorSetSchema, req.body);
    if (!(await hasPremium(ctx, userId))) throw forbidden('Il sensore motix pod è incluso in Premium', 'premium_required');
    const s = await ownSession(db, userId, id);
    if (s.completedAt) throw conflict('session_completed', 'Questa seduta è già stata completata');
    const [se] = await db
      .select({ id: sessionExercises.id, unit: exercises.unit, loadable: exercises.loadable })
      .from(sessionExercises)
      .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
      .where(and(eq(sessionExercises.id, input.sessionExerciseId), eq(sessionExercises.sessionId, id)))
      .limit(1);
    if (!se) throw notFound('Esercizio non trovato in questa seduta');
    if (se.unit !== 'reps') throw badRequest('not_countable', 'Il sensore conta le ripetizioni: per gli esercizi a tempo registra la serie a mano');
    const sensor = (await usableSensors(db, userId)).find((x) => x.id === input.sensorId);
    if (!sensor) throw forbidden('Questo sensore non è abbinato al tuo account', 'sensor_not_paired');

    let analysis;
    try {
      analysis = await ctx.ai.analyzeSet({ sampleRateHz: input.sampleRateHz, ax: input.ax, ay: input.ay, az: input.az });
    } catch (e) {
      if (!(e instanceof AiUnavailable)) throw e;
      req.log.warn(e.message);
      throw new AppError(503, 'analysis_unavailable', 'L’analisi del sensore non è disponibile in questo momento: registra la serie a mano');
    }
    if (analysis.quality !== 'ok' || analysis.reps < 1)
      throw badRequest('no_reps', 'Il sensore non ha rilevato ripetizioni: controlla che sia fissato bene e riprova, oppure registra la serie a mano');

    const now = ctx.now();
    const loadKg = !se.loadable || input.loadKg === undefined || input.loadKg === null ? null : String(input.loadKg);
    const fixed = (n: number | null, digits: number) => (n === null ? null : n.toFixed(digits));
    await db.transaction(async (tx) => {
      if (!s.startedAt) await tx.update(workoutSessions).set({ startedAt: now }).where(eq(workoutSessions.id, id));
      const [log] = await tx
        .insert(setLogs)
        .values({ sessionExerciseId: se.id, setNumber: input.setNumber, reps: analysis.reps, loadKg, source: 'sensor', recordedAt: now })
        .onConflictDoUpdate({ target: [setLogs.sessionExerciseId, setLogs.setNumber], set: { reps: analysis.reps, loadKg, source: 'sensor', recordedAt: now } })
        .returning({ id: setLogs.id });
      const reading = {
        sensorId: sensor.id,
        reps: analysis.reps,
        avgVelocity: fixed(analysis.avgVelocity, 3),
        peakVelocity: fixed(analysis.peakVelocity, 3),
        regularity: fixed(analysis.regularity, 2),
        timeUnderTensionMs: analysis.timeUnderTensionMs,
        velocityLossPct: fixed(analysis.velocityLossPct, 2),
        rangeM: fixed(analysis.rangeM, 3),
        perRep: analysis.perRep.slice(0, 200).map((r) => ({ velocity: r.velocity, durationMs: r.durationMs, rangeM: r.rangeM })),
      };
      await tx.insert(sensorReadings).values({ setLogId: log!.id, ...reading }).onConflictDoUpdate({ target: sensorReadings.setLogId, set: reading });
      await tx
        .update(sensors)
        .set({ lastSeenAt: now, ...(input.batteryPct !== undefined ? { batteryPct: input.batteryPct } : {}), ...(input.firmware ? { firmware: input.firmware } : {}) })
        .where(eq(sensors.id, sensor.id));
    });
    await track(db, 'serie_registrata_sensore', { userId, structureId: sensor.ownerStructureId }, { reps: analysis.reps });
    return {
      session: await sessionDetail(db, userId, id),
      analysis: {
        reps: analysis.reps,
        avgVelocity: analysis.avgVelocity,
        peakVelocity: analysis.peakVelocity,
        regularity: analysis.regularity,
        timeUnderTensionMs: analysis.timeUnderTensionMs,
        velocityLossPct: analysis.velocityLossPct,
        rangeM: analysis.rangeM,
      },
    };
  });

  /** Registra o corregge una serie a mano. */
  app.put('/me/sessions/:id/sets', async (req) => {
    const userId = me(req);
    const { id } = parse(idParam, req.params);
    const input = parse(logSetSchema, req.body);
    const s = await ownSession(db, userId, id);
    if (s.completedAt) throw conflict('session_completed', 'Questa seduta è già stata completata');
    const [se] = await db
      .select({ id: sessionExercises.id })
      .from(sessionExercises)
      .where(and(eq(sessionExercises.id, input.sessionExerciseId), eq(sessionExercises.sessionId, id)))
      .limit(1);
    if (!se) throw notFound('Esercizio non trovato in questa seduta');
    if (!s.startedAt) await db.update(workoutSessions).set({ startedAt: ctx.now() }).where(eq(workoutSessions.id, id));
    const loadKg = input.loadKg === undefined || input.loadKg === null ? null : String(input.loadKg);
    await db
      .insert(setLogs)
      .values({ sessionExerciseId: se.id, setNumber: input.setNumber, reps: input.reps, loadKg, recordedAt: ctx.now() })
      .onConflictDoUpdate({
        target: [setLogs.sessionExerciseId, setLogs.setNumber],
        set: { reps: input.reps, loadKg, recordedAt: ctx.now() },
      });
    return sessionDetail(db, userId, id);
  });

  app.delete('/me/sessions/:id/sets/:setId', async (req) => {
    const userId = me(req);
    const { id, setId } = parse(idParam.extend({ setId: z.string().uuid() }), req.params);
    const s = await ownSession(db, userId, id);
    if (s.completedAt) throw conflict('session_completed', 'Questa seduta è già stata completata');
    const mine = await db.select({ id: sessionExercises.id }).from(sessionExercises).where(eq(sessionExercises.sessionId, id));
    if (mine.length) await db.delete(setLogs).where(and(eq(setLogs.id, setId), inArray(setLogs.sessionExerciseId, mine.map((m) => m.id))));
    return sessionDetail(db, userId, id);
  });

  app.post('/me/sessions/:id/complete', async (req) => {
    const userId = me(req);
    const { id } = parse(idParam, req.params);
    const input = parse(completeSessionSchema, req.body);
    const s = await ownSession(db, userId, id);
    if (s.completedAt) throw conflict('session_completed', 'Questa seduta è già stata completata');
    const now = ctx.now();
    await db
      .update(workoutSessions)
      .set({ completedAt: now, startedAt: s.startedAt ?? now, perceivedEffort: input.perceivedEffort, notes: input.notes })
      .where(eq(workoutSessions.id, id));
    await track(db, 'seduta_completata', { userId }, { effort: input.perceivedEffort });
    return sessionSummary(db, userId, id);
  });

  app.get('/me/sessions/:id/summary', async (req) => {
    const userId = me(req);
    const { id } = parse(idParam, req.params);
    const s = await ownSession(db, userId, id);
    if (!s.completedAt) throw conflict('session_not_completed', 'La seduta non è ancora stata completata');
    return sessionSummary(db, userId, id);
  });

  /** Elimina una seduta libera non ancora completata. */
  app.delete('/me/sessions/:id', async (req) => {
    const userId = me(req);
    const { id } = parse(idParam, req.params);
    const s = await ownSession(db, userId, id);
    if (s.planId) throw conflict('plan_session', 'Le sedute del piano non si eliminano: genera un nuovo piano');
    if (s.completedAt) throw conflict('session_completed', 'Una seduta completata resta nel diario');
    await db.delete(workoutSessions).where(eq(workoutSessions.id, id));
    return { ok: true };
  });
}
