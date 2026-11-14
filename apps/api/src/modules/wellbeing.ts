import { and, asc, desc, eq, gt, gte, isNotNull, isNull, lte } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  CONTAINER_ML,
  DEFAULT_HYDRATION_GOAL_ML,
  FREE_HISTORY_DAYS,
  daySchema,
  hydrationLogSchema,
  measurementSchema,
  type HomeResponse,
  type HydrationDay,
  type Muscle,
  type ProgressResponse,
} from '@motix/shared';
import { requireRole } from '../auth';
import { hydrationGoals, hydrationLogs, measurements, plans, sportProfiles, subscriptions, workoutSessions } from '../db/schema';
import { addDays, assertPlausibleDay, mondayOf } from '../lib/days';
import { conflict, notFound, parse } from '../lib/errors';
import { audit, track } from '../services/events';
import { currentSubscription, describeSubscription, hasPremium, isPremium } from '../services/subscription';
import { sessionSummaries, userSets, volumeOf } from '../services/training';

const TIPS = [
  'Cinque minuti di riscaldamento prima della seduta riducono il rischio di infortuni.',
  'La tecnica viene prima del carico: se la forma peggiora, scala il peso.',
  'Dormire almeno sette ore è parte dell’allenamento: è lì che il corpo recupera.',
  'Bevi un bicchiere d’acqua appena sveglio: parti già con un pezzo dell’obiettivo.',
  'Meglio tre sedute regolari che una settimana perfetta seguita da due di pausa.',
  'Respira: espira nella fase di sforzo, inspira nel ritorno.',
  'Registra ogni serie: i progressi si vedono solo se li misuri.',
  'Nei giorni di allenamento ti serve più acqua: tieni la borraccia a portata di mano.',
  'Un recupero rispettato rende più efficace la serie successiva.',
  'Se salti una seduta, riparti dalla prossima: non provare a recuperarla tutta insieme.',
];

export async function wellbeingRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { db } = ctx;
  const me = (req: FastifyRequest) => requireRole(req, 'user').userId;
  const dayOf = (req: FastifyRequest) => assertPlausibleDay(parse(daySchema, req.query).day, ctx.now());

  /* ---------- Idratazione ---------- */

  /** Obiettivo del giorno: personalizzato su peso e attività in Premium, standard nella versione gratuita. */
  const hydrationGoal = async (userId: string, day: string, premium: boolean) => {
    let goalMl = DEFAULT_HYDRATION_GOAL_ML;
    let personalized = false;
    if (premium) {
      const [p] = await db.select({ w: sportProfiles.weightKg }).from(sportProfiles).where(eq(sportProfiles.userId, userId)).limit(1);
      if (p?.w) {
        // 35 ml per kg di peso, più mezzo litro nei giorni di allenamento.
        goalMl = Math.min(4000, Math.max(1500, Math.round((Number(p.w) * 35) / 50) * 50));
        const [training] = await db
          .select({ id: workoutSessions.id })
          .from(workoutSessions)
          .where(and(eq(workoutSessions.userId, userId), eq(workoutSessions.scheduledDate, day)))
          .limit(1);
        if (training) goalMl += 500;
        personalized = true;
      }
    }
    await db
      .insert(hydrationGoals)
      .values({ userId, day, goalMl })
      .onConflictDoUpdate({ target: [hydrationGoals.userId, hydrationGoals.day], set: { goalMl } });
    return { goalMl, personalized };
  };

  const hydrationDay = async (userId: string, day: string): Promise<HydrationDay> => {
    const { goalMl, personalized } = await hydrationGoal(userId, day, await hasPremium(ctx, userId));
    const logs = await db
      .select()
      .from(hydrationLogs)
      .where(and(eq(hydrationLogs.userId, userId), eq(hydrationLogs.day, day)))
      .orderBy(desc(hydrationLogs.loggedAt));
    return {
      day,
      goalMl,
      personalized,
      totalMl: logs.reduce((n, l) => n + l.amountMl, 0),
      logs: logs.map((l) => ({ id: l.id, container: l.container as HydrationDay['logs'][number]['container'], amountMl: l.amountMl, loggedAt: l.loggedAt.toISOString() })),
    };
  };

  app.get('/me/hydration', async (req) => hydrationDay(me(req), dayOf(req)));

  app.post('/me/hydration', async (req, reply) => {
    const userId = me(req);
    const input = parse(hydrationLogSchema, req.body);
    assertPlausibleDay(input.day, ctx.now());
    await db.insert(hydrationLogs).values({ userId, day: input.day, container: input.container, amountMl: CONTAINER_ML[input.container], loggedAt: ctx.now() });
    return reply.code(201).send(await hydrationDay(userId, input.day));
  });

  app.delete('/me/hydration/:id', async (req) => {
    const userId = me(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const [log] = await db
      .select()
      .from(hydrationLogs)
      .where(and(eq(hydrationLogs.id, id), eq(hydrationLogs.userId, userId)))
      .limit(1);
    if (!log) throw notFound('Registrazione non trovata');
    await db.delete(hydrationLogs).where(eq(hydrationLogs.id, id));
    return hydrationDay(userId, log.day);
  });

  /* ---------- Misure ---------- */
  app.post('/me/measurements', async (req, reply) => {
    const userId = me(req);
    const input = parse(measurementSchema, req.body);
    assertPlausibleDay(input.day, ctx.now());
    if (input.weightKg === undefined && !input.circumferences) throw conflict('empty', 'Inserisci almeno una misura');
    const [same] = await db
      .select()
      .from(measurements)
      .where(and(eq(measurements.userId, userId), eq(measurements.day, input.day)))
      .limit(1);
    const values = {
      weightKg: input.weightKg !== undefined ? String(input.weightKg) : (same?.weightKg ?? null),
      circumferences: input.circumferences ?? same?.circumferences ?? null,
    };
    if (same) await db.update(measurements).set(values).where(eq(measurements.id, same.id));
    else await db.insert(measurements).values({ userId, day: input.day, ...values });
    // Il peso più recente aggiorna il profilo, da cui dipende l'obiettivo di idratazione.
    if (input.weightKg !== undefined)
      await db.update(sportProfiles).set({ weightKg: String(input.weightKg), updatedAt: ctx.now() }).where(eq(sportProfiles.userId, userId));
    return reply.code(201).send({ ok: true });
  });

  /* ---------- Giorni consecutivi ---------- */
  const streak = async (userId: string, day: string) => {
    const from = addDays(day, -120);
    const sessions = await db
      .select({ day: workoutSessions.scheduledDate })
      .from(workoutSessions)
      .where(and(eq(workoutSessions.userId, userId), isNotNull(workoutSessions.completedAt), gte(workoutSessions.scheduledDate, from)));
    const water = await db
      .select({ day: hydrationLogs.day })
      .from(hydrationLogs)
      .where(and(eq(hydrationLogs.userId, userId), gte(hydrationLogs.day, from)));
    const active = new Set([...sessions, ...water].map((r) => r.day));
    // Se oggi non c'è ancora attività, la serie di ieri resta valida.
    let cursor = active.has(day) ? day : addDays(day, -1);
    let n = 0;
    while (active.has(cursor)) {
      n += 1;
      cursor = addDays(cursor, -1);
    }
    return n;
  };

  /* ---------- Home ---------- */
  app.get('/me/home', async (req): Promise<HomeResponse> => {
    const userId = me(req);
    const day = dayOf(req);
    const sub = await currentSubscription(ctx, userId);
    const premium = isPremium(sub);
    const open = and(eq(workoutSessions.userId, userId), isNull(workoutSessions.completedAt));
    const [today] = await db.select({ id: workoutSessions.id }).from(workoutSessions).where(and(open, eq(workoutSessions.scheduledDate, day))).limit(1);
    const [next] = today
      ? [undefined]
      : await db
          .select({ id: workoutSessions.id })
          .from(workoutSessions)
          .where(and(open, gt(workoutSessions.scheduledDate, day)))
          .orderBy(asc(workoutSessions.scheduledDate))
          .limit(1);
    const pick = today ?? next;
    const session = pick ? ((await sessionSummaries(db, [pick.id])).get(pick.id) ?? null) : null;
    const water = await hydrationDay(userId, day);
    const [plan] = await db.select({ id: plans.id }).from(plans).where(and(eq(plans.userId, userId), eq(plans.status, 'active'))).limit(1);
    const dayNumber = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
    return {
      premium,
      trialDaysLeft: sub ? describeSubscription(ctx, sub).trialDaysLeft : null,
      session,
      sessionIsToday: Boolean(today),
      hydration: { goalMl: water.goalMl, totalMl: water.totalMl },
      streakDays: await streak(userId, day),
      tip: TIPS[dayNumber % TIPS.length]!,
      hasPlan: Boolean(plan),
    };
  });

  /* ---------- Progressi ---------- */
  app.get('/me/progress', async (req): Promise<ProgressResponse> => {
    const userId = me(req);
    const q = parse(daySchema.extend({ days: z.coerce.number().int().min(7).max(180).default(30) }), req.query);
    const day = assertPlausibleDay(q.day, ctx.now());
    const premium = await hasPremium(ctx, userId);
    // Versione gratuita: solo gli ultimi 7 giorni (sezione 3.1).
    const days = premium ? q.days : FREE_HISTORY_DAYS;
    const from = addDays(day, -(days - 1));

    const sets = await userSets(db, userId, { from, to: day });
    const completed = await db
      .select({ day: workoutSessions.scheduledDate })
      .from(workoutSessions)
      .where(and(eq(workoutSessions.userId, userId), isNotNull(workoutSessions.completedAt), gte(workoutSessions.scheduledDate, from), lte(workoutSessions.scheduledDate, day)));

    const weeks: ProgressResponse['weeks'] = [];
    for (let w = mondayOf(from); w <= day; w = addDays(w, 7)) {
      const end = addDays(w, 6);
      weeks.push({
        weekStart: w,
        sessions: completed.filter((c) => c.day >= w && c.day <= end).length,
        volumeKg: volumeOf(sets.filter((s) => s.day >= w && s.day <= end)),
      });
    }

    const perMuscle = new Map<Muscle, number>();
    for (const s of sets) {
      const m = s.muscles[0];
      if (m) perMuscle.set(m, (perMuscle.get(m) ?? 0) + 1);
    }

    // Andamento della forza: carico migliore per giorno, sugli esercizi più frequenti.
    const perExercise = new Map<string, Map<string, number>>();
    for (const s of sets) {
      if (!s.loadable || s.loadKg === null || s.loadKg <= 0) continue;
      const byDay = perExercise.get(s.exercise) ?? new Map<string, number>();
      byDay.set(s.day, Math.max(byDay.get(s.day) ?? 0, s.loadKg));
      perExercise.set(s.exercise, byDay);
    }
    const strength = [...perExercise.entries()]
      .filter(([, byDay]) => byDay.size >= 2)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 4)
      .map(([exercise, byDay]) => ({ exercise, points: [...byDay.entries()].map(([d, bestLoadKg]) => ({ day: d, bestLoadKg })) }));

    const weight = (
      await db
        .select({ day: measurements.day, weightKg: measurements.weightKg })
        .from(measurements)
        .where(and(eq(measurements.userId, userId), gte(measurements.day, from), lte(measurements.day, day)))
        .orderBy(asc(measurements.day))
    )
      .filter((m) => m.weightKg !== null)
      .map((m) => ({ day: m.day, weightKg: Number(m.weightKg) }));

    const waterLogs = await db
      .select({ day: hydrationLogs.day, amountMl: hydrationLogs.amountMl })
      .from(hydrationLogs)
      .where(and(eq(hydrationLogs.userId, userId), gte(hydrationLogs.day, from), lte(hydrationLogs.day, day)));
    const goals = await db
      .select()
      .from(hydrationGoals)
      .where(and(eq(hydrationGoals.userId, userId), gte(hydrationGoals.day, from), lte(hydrationGoals.day, day)));
    const waterDays: ProgressResponse['hydration']['days'] = [];
    for (let d = from; d <= day; d = addDays(d, 1))
      waterDays.push({
        day: d,
        totalMl: waterLogs.filter((l) => l.day === d).reduce((n, l) => n + l.amountMl, 0),
        goalMl: goals.find((g) => g.day === d)?.goalMl ?? DEFAULT_HYDRATION_GOAL_ML,
      });

    return {
      days,
      limited: !premium,
      streakDays: await streak(userId, day),
      weeks,
      muscles: [...perMuscle.entries()].map(([muscle, n]) => ({ muscle, sets: n })).sort((a, b) => b.sets - a.sets),
      strength,
      weight,
      hydration: {
        averageMl: Math.round(waterDays.reduce((n, d) => n + d.totalMl, 0) / waterDays.length),
        daysOnTarget: waterDays.filter((d) => d.totalMl >= d.goalMl).length,
        days: waterDays,
      },
    };
  });

  /* ---------- Abbonamento ---------- */
  const mySubscription = async (userId: string) => {
    const sub = await currentSubscription(ctx, userId);
    if (!sub) throw notFound('Abbonamento non trovato');
    return sub;
  };

  app.get('/me/subscription', async (req) => describeSubscription(ctx, await mySubscription(me(req))));

  /** Disdetta durante la prova: nessun addebito, Premium fino alla fine della prova e poi versione gratuita. */
  app.post('/me/subscription/cancel', async (req) => {
    const userId = me(req);
    const sub = await mySubscription(userId);
    if (sub.status !== 'trial') throw conflict('not_in_trial', 'La disdetta dall’app vale durante la prova; un abbonamento attivo si gestisce dallo store');
    if (!sub.cancelledAt) {
      await db.update(subscriptions).set({ cancelledAt: ctx.now(), updatedAt: ctx.now() }).where(eq(subscriptions.id, sub.id));
      await track(db, 'prova_disdetta', { userId });
      await audit(db, 'subscription.trial_cancelled', { actorUserId: userId, entity: 'subscription', entityId: sub.id, ip: req.ip });
    }
    return describeSubscription(ctx, await mySubscription(userId));
  });

  app.post('/me/subscription/resume', async (req) => {
    const userId = me(req);
    const sub = await mySubscription(userId);
    if (sub.status !== 'trial' || !sub.cancelledAt) throw conflict('nothing_to_resume', 'Non c’è una disdetta da annullare');
    await db.update(subscriptions).set({ cancelledAt: null, updatedAt: ctx.now() }).where(eq(subscriptions.id, sub.id));
    return describeSubscription(ctx, await mySubscription(userId));
  });
}
