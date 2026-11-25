/** Strumenti dell'utente legati ai professionisti: check-in, storico dei carichi, app salute. */
import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { checkInSchema, healthSyncSchema } from '@motix/shared';
import { requireRole } from '../auth';
import { checkIns, healthDays, mediaFiles } from '../db/schema';
import { assertPlausibleDay, diffDays, toDay } from '../lib/days';
import { badRequest, forbidden, parse } from '../lib/errors';
import { track } from '../services/events';
import { hasPremium } from '../services/subscription';
import { checkInsOf, exerciseHistory, exerciseRecords, healthOf } from '../services/tracking';

export async function clientRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { db } = ctx;
  const me = (req: FastifyRequest) => requireRole(req, 'user').userId;
  const premiumOnly = async (userId: string, what: string) => {
    if (!(await hasPremium(ctx, userId))) throw forbidden(`${what} è incluso in Premium`, 'premium_required');
  };

  /* ---------- Check-in ---------- */

  app.get('/me/check-ins', async (req) => checkInsOf(ctx, me(req)));

  /** Un check-in al giorno: se si rimanda lo stesso giorno, si aggiorna. */
  app.post('/me/check-ins', async (req, reply) => {
    const userId = me(req);
    await premiumOnly(userId, 'Il check-in con il professionista');
    const input = parse(checkInSchema, req.body);
    assertPlausibleDay(input.day, ctx.now());
    const photos = input.photoIds.length
      ? await db.select().from(mediaFiles).where(and(inArray(mediaFiles.id, input.photoIds), eq(mediaFiles.ownerId, userId)))
      : [];
    if (photos.length !== input.photoIds.length || photos.some((p) => p.kind !== 'image'))
      throw badRequest('photo_invalid', 'Una delle foto non è valida: caricala di nuovo');
    const values = {
      weightKg: input.weightKg === undefined ? null : String(input.weightKg),
      waistCm: input.waistCm === undefined ? null : String(input.waistCm),
      energy: input.energy ?? null,
      sleep: input.sleep ?? null,
      stress: input.stress ?? null,
      training: input.training ?? null,
      nutrition: input.nutrition ?? null,
      notes: input.notes ?? null,
      photoKeys: input.photoIds.map((id) => photos.find((p) => p.id === id)!.key),
    };
    await db
      .insert(checkIns)
      .values({ userId, day: input.day, ...values })
      .onConflictDoUpdate({ target: [checkIns.userId, checkIns.day], set: values });
    await track(db, 'check_in_inviato', { userId });
    return reply.code(201).send(await checkInsOf(ctx, userId));
  });

  /* ---------- Storico dei carichi ---------- */

  app.get('/me/exercises/records', async (req) => exerciseRecords(ctx, me(req)));

  app.get('/me/exercises/:id/history', async (req) => {
    const userId = me(req);
    await premiumOnly(userId, 'Lo storico completo dei carichi');
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    return exerciseHistory(ctx, userId, id);
  });

  /* ---------- Apple Salute e Health Connect ---------- */

  app.get('/me/health', async (req) => ({ days: await healthOf(ctx, me(req), 14) }));

  /** L'app invia gli ultimi giorni letti da Apple Salute o Health Connect; i giorni già presenti si aggiornano. */
  app.post('/me/health', async (req) => {
    const userId = me(req);
    await premiumOnly(userId, 'Il collegamento con le app salute');
    const input = parse(healthSyncSchema, req.body);
    const today = toDay(ctx.now());
    for (const d of input.days) {
      if (diffDays(today, d.day) < -1 || diffDays(today, d.day) > 31) throw badRequest('day_invalid', 'Si possono inviare solo gli ultimi 31 giorni');
      const values = {
        steps: d.steps ?? null,
        sleepMinutes: d.sleepMinutes ?? null,
        restingHr: d.restingHr ?? null,
        activeKcal: d.activeKcal ?? null,
        source: input.source,
        updatedAt: ctx.now(),
      };
      await db.insert(healthDays).values({ userId, day: d.day, ...values }).onConflictDoUpdate({ target: [healthDays.userId, healthDays.day], set: values });
    }
    return { days: await healthOf(ctx, userId, 14) };
  });
}
