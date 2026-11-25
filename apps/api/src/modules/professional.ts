/**
 * Strumenti in più per i professionisti, gratuiti: schede preimpostate, check-in, storico dei carichi,
 * dati delle app salute e messaggi automatici.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  applyTemplateSchema,
  automationSchema,
  checkInCommentSchema,
  checkInFrequencySchema,
  planTemplateSchema,
  type PlanTemplate,
} from '@motix/shared';
import { requireRole } from '../auth';
import { checkIns, clientLinks, exercises, planTemplates } from '../db/schema';
import { addDays, assertPlausibleDay } from '../lib/days';
import { badRequest, notFound, parse } from '../lib/errors';
import { clientOfTrainer, currentTrainer } from '../services/access';
import { automationsOf, runAutomations, saveAutomation } from '../services/automations';
import { audit, track } from '../services/events';
import { checkInsOf, exerciseHistory, exerciseRecords, healthOf } from '../services/tracking';
import { savePlan } from '../services/training';

const idParam = z.object({ id: z.string().uuid() });

export async function professionalRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { db } = ctx;

  /* ---------- Schede preimpostate (template) ---------- */

  const exerciseMap = async (ids: string[]) => {
    const rows = ids.length ? await db.select().from(exercises).where(inArray(exercises.id, ids)) : [];
    return new Map(rows.map((r) => [r.id, r]));
  };

  const describe = async (rows: Array<typeof planTemplates.$inferSelect>): Promise<PlanTemplate[]> => {
    const info = await exerciseMap([...new Set(rows.flatMap((r) => r.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId))))]);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      note: r.note,
      updatedAt: r.updatedAt.toISOString(),
      sessions: r.sessions.map((s) => ({
        title: s.title,
        dayOffset: s.dayOffset,
        exercises: s.exercises
          .filter((e) => info.has(e.exerciseId))
          .map((e) => {
            const ex = info.get(e.exerciseId)!;
            return {
              exerciseId: e.exerciseId,
              name: ex.name,
              unit: ex.unit as 'reps' | 'seconds' | 'minutes',
              loadable: ex.loadable,
              sets: e.sets,
              reps: e.reps,
              loadKg: ex.loadable ? (e.loadKg ?? null) : null,
              restSeconds: e.restSeconds,
            };
          }),
      })),
    }));
  };

  const validated = async (body: unknown) => {
    const input = parse(planTemplateSchema, body);
    const ids = [...new Set(input.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)))];
    const info = await exerciseMap(ids);
    if (ids.some((id) => info.get(id)?.reviewStatus !== 'approved')) throw badRequest('exercise_invalid', 'Uno degli esercizi non è disponibile nella libreria');
    return {
      name: input.name,
      note: input.note ?? null,
      sessions: [...input.sessions]
        .sort((a, b) => a.dayOffset - b.dayOffset)
        .map((s) => ({ ...s, exercises: s.exercises.map((e) => ({ ...e, loadKg: info.get(e.exerciseId)!.loadable ? (e.loadKg ?? null) : null })) })),
    };
  };

  const listTemplates = async (trainerId: string) =>
    describe(await db.select().from(planTemplates).where(eq(planTemplates.trainerId, trainerId)).orderBy(desc(planTemplates.updatedAt)));

  app.get('/trainer/templates', async (req) => {
    const { t } = await currentTrainer(ctx, req);
    return { templates: await listTemplates(t.id) };
  });

  app.post('/trainer/templates', async (req, reply) => {
    const { t } = await currentTrainer(ctx, req);
    const count = (await db.select({ id: planTemplates.id }).from(planTemplates).where(eq(planTemplates.trainerId, t.id))).length;
    if (count >= 200) throw badRequest('too_many_templates', 'Hai raggiunto il massimo di 200 template');
    await db.insert(planTemplates).values({ trainerId: t.id, ...(await validated(req.body)) });
    return reply.code(201).send({ templates: await listTemplates(t.id) });
  });

  app.put('/trainer/templates/:id', async (req) => {
    const { t } = await currentTrainer(ctx, req);
    const { id } = parse(idParam, req.params);
    const updated = await db
      .update(planTemplates)
      .set({ ...(await validated(req.body)), updatedAt: ctx.now() })
      .where(and(eq(planTemplates.id, id), eq(planTemplates.trainerId, t.id)))
      .returning({ id: planTemplates.id });
    if (!updated.length) throw notFound('Template non trovato');
    return { templates: await listTemplates(t.id) };
  });

  app.delete('/trainer/templates/:id', async (req) => {
    const { t } = await currentTrainer(ctx, req);
    const { id } = parse(idParam, req.params);
    await db.delete(planTemplates).where(and(eq(planTemplates.id, id), eq(planTemplates.trainerId, t.id)));
    return { templates: await listTemplates(t.id) };
  });

  /** Assegna un template a un cliente: diventa il suo piano, a partire dal giorno scelto. */
  app.post('/trainer/clients/:linkId/plan/template', async (req) => {
    const { auth, t, link, client } = await clientOfTrainer(ctx, req);
    const { templateId, startDay } = parse(applyTemplateSchema, req.body);
    assertPlausibleDay(startDay, ctx.now());
    const [tpl] = await db.select().from(planTemplates).where(and(eq(planTemplates.id, templateId), eq(planTemplates.trainerId, t.id))).limit(1);
    if (!tpl) throw notFound('Template non trovato');
    await savePlan(db, {
      userId: link.userId,
      author: 'trainer',
      trainerId: t.id,
      weekStart: startDay,
      rationale: tpl.note ? tpl.note.split('\n').map((l) => l.trim()).filter(Boolean) : [],
      sessions: tpl.sessions.map((s) => ({
        title: s.title,
        day: addDays(startDay, s.dayOffset),
        exercises: s.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets, reps: e.reps, restSeconds: e.restSeconds, loadKg: e.loadKg ?? null })),
      })),
    });
    await track(db, 'piano_pt_assegnato', { userId: link.userId, trainerId: t.id, structureId: client.structureId }, { sessions: tpl.sessions.length, template: true });
    await audit(db, 'client.plan_from_template', { actorUserId: auth.userId, entity: 'user', entityId: link.userId, ip: req.ip }, { templateId });
    return { ok: true };
  });

  /* ---------- Check-in ---------- */

  app.get('/trainer/clients/:linkId/check-ins', async (req) => {
    const { link } = await clientOfTrainer(ctx, req, { needsData: true });
    return { ...(await checkInsOf(ctx, link.userId)), myEveryDays: link.checkInEveryDays };
  });

  app.put('/trainer/clients/:linkId/check-in-frequency', async (req) => {
    const { link } = await clientOfTrainer(ctx, req);
    const { everyDays } = parse(checkInFrequencySchema, req.body);
    await db.update(clientLinks).set({ checkInEveryDays: everyDays || null }).where(eq(clientLinks.id, link.id));
    return { everyDays: everyDays || null };
  });

  app.post('/trainer/clients/:linkId/check-ins/:id/comment', async (req) => {
    const { t, link } = await clientOfTrainer(ctx, req, { needsData: true });
    const { id } = parse(idParam.passthrough(), req.params);
    const { comment } = parse(checkInCommentSchema, req.body);
    const updated = await db
      .update(checkIns)
      .set({ comment, commentByTrainerId: t.id, commentedAt: ctx.now() })
      .where(and(eq(checkIns.id, id), eq(checkIns.userId, link.userId)))
      .returning({ id: checkIns.id });
    if (!updated.length) throw notFound('Check-in non trovato');
    return checkInsOf(ctx, link.userId);
  });

  /* ---------- Carichi e app salute del cliente ---------- */

  app.get('/trainer/clients/:linkId/exercises', async (req) => {
    const { link } = await clientOfTrainer(ctx, req, { needsData: true });
    return exerciseRecords(ctx, link.userId);
  });

  app.get('/trainer/clients/:linkId/exercises/:exerciseId', async (req) => {
    const { link } = await clientOfTrainer(ctx, req, { needsData: true });
    const { exerciseId } = parse(z.object({ exerciseId: z.string().uuid() }).passthrough(), req.params);
    return exerciseHistory(ctx, link.userId, exerciseId);
  });

  app.get('/trainer/clients/:linkId/health', async (req) => {
    const { link } = await clientOfTrainer(ctx, req, { needsData: true });
    return { days: await healthOf(ctx, link.userId, 30) };
  });

  /* ---------- Messaggi automatici ---------- */

  app.get('/trainer/automations', async (req) => {
    const { t } = await currentTrainer(ctx, req);
    return { automations: await automationsOf(db, t.id) };
  });

  app.put('/trainer/automations', async (req) => {
    const { t } = await currentTrainer(ctx, req);
    await saveAutomation(db, t.id, parse(automationSchema, req.body));
    return { automations: await automationsOf(db, t.id) };
  });

  /** Esecuzione manuale delle automazioni (il server le esegue da solo ogni ora). */
  app.post('/admin/automations/run', async (req) => {
    requireRole(req, 'admin');
    return runAutomations(ctx);
  });
}
