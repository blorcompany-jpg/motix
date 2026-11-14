import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { trainerPlanSchema, type PlanEditorResponse, type PlanEditorSession } from '@motix/shared';
import { requireRole } from '../auth';
import { clientLinks, exercises, plans, sessionExercises, trainers, users, workoutSessions } from '../db/schema';
import { addDays, assertPlausibleDay, diffDays, toDay } from '../lib/days';
import { badRequest, forbidden, notFound, parse } from '../lib/errors';
import { audit, track } from '../services/events';
import { clientReport } from '../services/report';
import { draftPlan, savePlan } from '../services/training';

const linkParam = z.object({ linkId: z.string().uuid() });

/** Strumenti del personal trainer sui propri clienti: report e piano. */
export async function coachingRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { db } = ctx;

  /** Collegamento attivo tra il personal trainer che chiama e il cliente. */
  const activeLink = async (req: FastifyRequest, opts: { needsData?: boolean } = {}) => {
    const auth = requireRole(req, 'personal_trainer');
    const { linkId } = parse(linkParam, req.params);
    const [row] = await db
      .select({ link: clientLinks, t: trainers, client: users })
      .from(clientLinks)
      .innerJoin(trainers, eq(trainers.id, clientLinks.trainerId))
      .innerJoin(users, eq(users.id, clientLinks.userId))
      .where(and(eq(clientLinks.id, linkId), eq(trainers.userId, auth.userId)))
      .limit(1);
    if (!row || row.link.status !== 'active') throw notFound('Cliente non trovato');
    if (row.t.status !== 'approved') throw forbidden('Il tuo profilo è in attesa di approvazione da parte di BTECH', 'trainer_not_approved');
    // Senza il consenso del cliente il personal trainer non vede i suoi dati (sezione 6.2).
    if (opts.needsData && !row.link.dataConsent)
      throw forbidden('Il cliente non ha dato il consenso a condividere i suoi dati con te', 'consent_required');
    return { auth, ...row };
  };

  app.get('/trainer/clients/:linkId/report', async (req) => {
    const { auth, link } = await activeLink(req, { needsData: true });
    await audit(db, 'client.report_viewed', { actorUserId: auth.userId, entity: 'user', entityId: link.userId, ip: req.ip });
    return clientReport(ctx, link.userId);
  });

  const exerciseInfo = async (ids: string[]) => {
    const rows = ids.length ? await db.select().from(exercises).where(inArray(exercises.id, ids)) : [];
    return new Map(rows.map((r) => [r.id, r]));
  };

  /** Piano attivo del cliente, nel formato dell'editor. */
  app.get('/trainer/clients/:linkId/plan', async (req): Promise<PlanEditorResponse> => {
    const { link } = await activeLink(req);
    const [plan] = await db
      .select()
      .from(plans)
      .where(and(eq(plans.userId, link.userId), eq(plans.status, 'active')))
      .orderBy(desc(plans.createdAt))
      .limit(1);
    if (!plan) return { author: null, note: '', sessions: [] };
    const sessions = await db.select().from(workoutSessions).where(eq(workoutSessions.planId, plan.id)).orderBy(asc(workoutSessions.scheduledDate));
    const items = sessions.length
      ? await db
          .select()
          .from(sessionExercises)
          .where(inArray(sessionExercises.sessionId, sessions.map((s) => s.id)))
          .orderBy(asc(sessionExercises.position))
      : [];
    const info = await exerciseInfo([...new Set(items.map((i) => i.exerciseId))]);
    let note = '';
    try {
      const lines = JSON.parse(plan.rationale ?? '[]') as string[];
      note = plan.author === 'trainer' ? lines.join('\n') : '';
    } catch {
      note = '';
    }
    return {
      author: plan.author,
      note,
      sessions: sessions.map((s) => ({
        title: s.title ?? 'Allenamento',
        day: s.scheduledDate,
        exercises: items
          .filter((i) => i.sessionId === s.id)
          .map((i) => {
            const ex = info.get(i.exerciseId)!;
            return {
              exerciseId: i.exerciseId,
              name: ex.name,
              unit: ex.unit as PlanEditorSession['exercises'][number]['unit'],
              loadable: ex.loadable,
              sets: i.targetSets,
              reps: i.targetReps,
              loadKg: i.targetLoadKg === null ? null : Number(i.targetLoadKg),
              restSeconds: i.restSeconds ?? 60,
            };
          }),
      })),
    };
  });

  /** Proposta automatica dal questionario del cliente, da modificare prima di salvare. */
  app.post('/trainer/clients/:linkId/plan/draft', async (req): Promise<PlanEditorResponse> => {
    const { link } = await activeLink(req, { needsData: true });
    const { day } = parse(z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.body);
    assertPlausibleDay(day, ctx.now());
    const { built, library } = await draftPlan(ctx, link.userId, day);
    const byId = new Map(library.map((l) => [l.id, l]));
    return {
      author: 'ai',
      note: '',
      sessions: built.sessions.map((s) => ({
        title: s.title,
        day: addDays(day, s.dayOffset),
        exercises: s.exercises.map((x) => {
          const ex = byId.get(x.exerciseId)!;
          return {
            exerciseId: x.exerciseId,
            name: ex.name,
            unit: ex.unit as PlanEditorSession['exercises'][number]['unit'],
            loadable: ex.loadable,
            sets: x.sets,
            reps: x.reps,
            loadKg: x.loadKg,
            restSeconds: x.restSeconds,
          };
        }),
      })),
    };
  });

  /** Il personal trainer salva il piano del cliente: sostituisce quello attivo. */
  app.put('/trainer/clients/:linkId/plan', async (req) => {
    const { auth, link, t, client } = await activeLink(req);
    const input = parse(trainerPlanSchema, req.body);
    const today = toDay(ctx.now());
    for (const s of input.sessions)
      if (diffDays(s.day, today) < -1 || diffDays(s.day, today) > 60)
        throw badRequest('day_invalid', 'Le sedute vanno programmate da oggi ai prossimi 60 giorni');
    const ids = [...new Set(input.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)))];
    const info = await exerciseInfo(ids);
    if (ids.some((id) => info.get(id)?.reviewStatus !== 'approved')) throw badRequest('exercise_invalid', 'Uno degli esercizi non è disponibile nella libreria');

    const sessions = [...input.sessions].sort((a, b) => a.day.localeCompare(b.day));
    await savePlan(db, {
      userId: link.userId,
      author: 'trainer',
      trainerId: t.id,
      weekStart: sessions[0]!.day,
      rationale: input.note ? input.note.split('\n').map((l) => l.trim()).filter(Boolean) : [],
      sessions: sessions.map((s) => ({
        title: s.title,
        day: s.day,
        exercises: s.exercises.map((e) => ({
          exerciseId: e.exerciseId,
          sets: e.sets,
          reps: e.reps,
          restSeconds: e.restSeconds,
          loadKg: info.get(e.exerciseId)!.loadable ? (e.loadKg ?? null) : null,
        })),
      })),
    });
    await track(db, 'piano_pt_assegnato', { userId: link.userId, trainerId: t.id, structureId: client.structureId }, { sessions: sessions.length });
    await audit(db, 'client.plan_saved', { actorUserId: auth.userId, entity: 'user', entityId: link.userId, ip: req.ip });
    return { ok: true };
  });
}
