import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { trainerVideoSchema, type PointsResponse, type ShopCategory, type ShopProduct, type TrainerVideoView } from '@motix/shared';
import { requireAuth, requireRole } from '../auth';
import { clientLinks, exercises, mediaFiles, pointMovements, rewardRedemptions, rewards, shopProducts, structures, trainerVideos, trainers, users } from '../db/schema';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/errors';
import { track } from '../services/events';
import { describePointRules, getPointRules, movePoints } from '../services/points';
import { mediaUrl } from './media';

const idParam = z.object({ id: z.string().uuid() });

/** Shop by BLOR, video dei personal trainer, punti e premi. */
export async function commerceRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { db } = ctx;

  /* ---------- Shop: il catalogo rimanda allo shop di BLOR Company, dove avviene l'acquisto ---------- */
  app.get('/shop/products', async (req) => {
    requireAuth(req);
    const rows = await db.select().from(shopProducts).where(eq(shopProducts.visible, true)).orderBy(asc(shopProducts.position), asc(shopProducts.name));
    const products: ShopProduct[] = rows.map((r) => ({ id: r.id, name: r.name, category: r.category as ShopCategory, imageUrl: r.imageUrl }));
    return { products };
  });

  /** Registra il clic e restituisce il link a BLOR, con il codice della struttura o del personal trainer. */
  app.post('/shop/products/:id/open', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const [p] = await db.select().from(shopProducts).where(and(eq(shopProducts.id, id), eq(shopProducts.visible, true))).limit(1);
    if (!p) throw notFound('Prodotto non trovato');
    const [u] = await db.select().from(users).where(eq(users.id, auth.userId)).limit(1);
    let ref: string | null = null;
    let trainerId: string | null = null;
    if (auth.role === 'personal_trainer') {
      const [t] = await db.select().from(trainers).where(eq(trainers.userId, auth.userId)).limit(1);
      ref = t?.inviteCode ?? null;
      trainerId = t?.id ?? null;
    } else if (u?.structureId) {
      const [s] = await db.select({ code: structures.code }).from(structures).where(eq(structures.id, u.structureId)).limit(1);
      ref = s?.code ?? null;
    }
    const url = new URL(p.blorUrl);
    url.searchParams.set('utm_source', 'motix');
    url.searchParams.set('utm_medium', 'app');
    if (ref) url.searchParams.set('ref', ref);
    await track(db, 'shop_clic', { userId: auth.userId, structureId: u?.structureId, trainerId }, { productId: p.id, category: p.category });
    return { url: url.toString() };
  });

  /* ---------- Video dei personal trainer ---------- */
  const myTrainer = async (req: FastifyRequest) => {
    const auth = requireRole(req, 'personal_trainer');
    const [t] = await db.select().from(trainers).where(eq(trainers.userId, auth.userId)).limit(1);
    if (!t) throw notFound('Profilo personal trainer non trovato');
    if (t.status !== 'approved') throw forbidden('Il tuo profilo è in attesa di approvazione da parte di BTECH', 'trainer_not_approved');
    return { auth, t };
  };

  const videoViews = async (where: SQL | undefined): Promise<TrainerVideoView[]> => {
    const rows = await db
      .select({ v: trainerVideos, firstName: users.firstName, lastName: users.lastName, exercise: exercises.name })
      .from(trainerVideos)
      .innerJoin(trainers, eq(trainers.id, trainerVideos.trainerId))
      .innerJoin(users, eq(users.id, trainers.userId))
      .leftJoin(exercises, eq(exercises.id, trainerVideos.exerciseId))
      .where(where)
      .orderBy(desc(trainerVideos.createdAt))
      .limit(200);
    return rows.map((r) => ({
      id: r.v.id,
      title: r.v.title,
      url: r.v.videoUrl,
      visibility: r.v.visibility,
      reviewStatus: r.v.reviewStatus,
      exercise: r.exercise,
      trainerName: `${r.firstName} ${r.lastName}`,
      createdAt: r.v.createdAt.toISOString(),
    }));
  };

  app.get('/trainer/videos', async (req) => {
    const { t } = await myTrainer(req);
    return { videos: await videoViews(eq(trainerVideos.trainerId, t.id)) };
  });

  app.post('/trainer/videos', async (req, reply) => {
    const { auth, t } = await myTrainer(req);
    const input = parse(trainerVideoSchema, req.body);
    const [media] = await db.select().from(mediaFiles).where(and(eq(mediaFiles.id, input.mediaId), eq(mediaFiles.ownerId, auth.userId))).limit(1);
    if (!media || media.kind !== 'video') throw badRequest('media_invalid', 'Carica un file video (MP4 o MOV)');
    if (input.exerciseId) {
      const [ex] = await db.select({ id: exercises.id }).from(exercises).where(eq(exercises.id, input.exerciseId)).limit(1);
      if (!ex) throw badRequest('exercise_invalid', 'Esercizio non trovato');
    }
    await db.insert(trainerVideos).values({
      trainerId: t.id,
      exerciseId: input.exerciseId,
      title: input.title,
      videoUrl: mediaUrl(ctx, media.key),
      visibility: input.visibility,
      // I video per i propri clienti sono subito visibili; quelli per tutta la community passano dalla revisione di BTECH.
      reviewStatus: input.visibility === 'community' ? 'pending' : 'approved',
    });
    return reply.code(201).send({ videos: await videoViews(eq(trainerVideos.trainerId, t.id)) });
  });

  app.delete('/trainer/videos/:id', async (req) => {
    const { t } = await myTrainer(req);
    const { id } = parse(idParam, req.params);
    await db.delete(trainerVideos).where(and(eq(trainerVideos.id, id), eq(trainerVideos.trainerId, t.id)));
    return { videos: await videoViews(eq(trainerVideos.trainerId, t.id)) };
  });

  /** Video del proprio personal trainer (per il cliente). */
  app.get('/me/trainer-videos', async (req) => {
    const auth = requireRole(req, 'user');
    const links = await db.select({ trainerId: clientLinks.trainerId }).from(clientLinks).where(and(eq(clientLinks.userId, auth.userId), eq(clientLinks.status, 'active')));
    if (!links.length) return { videos: [] };
    return { videos: await videoViews(and(inArray(trainerVideos.trainerId, links.map((l) => l.trainerId)), eq(trainerVideos.reviewStatus, 'approved'))) };
  });

  /** Video dei personal trainer visibili a tutta la community, dopo l'approvazione di BTECH. */
  app.get('/community/trainer-videos', async (req) => {
    requireRole(req, 'user', 'personal_trainer');
    return { videos: await videoViews(and(eq(trainerVideos.visibility, 'community'), eq(trainerVideos.reviewStatus, 'approved'))) };
  });

  /* ---------- Punti e premi ---------- */
  const pointsOf = async (trainerId: string): Promise<PointsResponse> => {
    const [t] = await db.select({ balance: trainers.pointsBalance }).from(trainers).where(eq(trainers.id, trainerId)).limit(1);
    const movements = await db.select().from(pointMovements).where(eq(pointMovements.trainerId, trainerId)).orderBy(desc(pointMovements.createdAt)).limit(100);
    const catalog = await db.select().from(rewards).where(eq(rewards.active, true)).orderBy(asc(rewards.pointsRequired));
    const mine = await db
      .select({ r: rewardRedemptions, name: rewards.name })
      .from(rewardRedemptions)
      .innerJoin(rewards, eq(rewards.id, rewardRedemptions.rewardId))
      .where(eq(rewardRedemptions.trainerId, trainerId))
      .orderBy(desc(rewardRedemptions.createdAt))
      .limit(50);
    return {
      balance: t?.balance ?? 0,
      rules: describePointRules(await getPointRules(db)),
      movements: movements.map((m) => ({ id: m.id, reason: m.reason, points: m.points, balanceAfter: m.balanceAfter, note: m.note, at: m.createdAt.toISOString() })),
      rewards: catalog.map((r) => ({ id: r.id, name: r.name, description: r.description, pointsRequired: r.pointsRequired, available: r.stock === null || r.stock > 0 })),
      redemptions: mine.map(({ r, name }) => ({ id: r.id, reward: name, points: r.points, status: r.status, at: r.createdAt.toISOString() })),
    };
  };

  app.get('/trainer/points', async (req) => pointsOf((await myTrainer(req)).t.id));

  /** Riscatto di un premio: i punti vengono scalati subito e tornano indietro se BTECH rifiuta la richiesta. */
  app.post('/trainer/rewards/:id/redeem', async (req, reply) => {
    const { t } = await myTrainer(req);
    const { id } = parse(idParam, req.params);
    const [r] = await db.select().from(rewards).where(and(eq(rewards.id, id), eq(rewards.active, true))).limit(1);
    if (!r) throw notFound('Premio non trovato');
    if (r.stock !== null && r.stock <= 0) throw conflict('out_of_stock', 'Premio esaurito');
    if (t.pointsBalance < r.pointsRequired) throw conflict('points_insufficient', `Ti servono ${r.pointsRequired} punti: ne hai ${t.pointsBalance}`);
    await movePoints(db, t.id, 'redemption', -r.pointsRequired, { note: `Premio: ${r.name}` });
    if (r.stock !== null) await db.update(rewards).set({ stock: r.stock - 1 }).where(eq(rewards.id, r.id));
    await db.insert(rewardRedemptions).values({ rewardId: r.id, trainerId: t.id, points: r.pointsRequired });
    await track(db, 'premio_richiesto', { trainerId: t.id }, { rewardId: r.id });
    return reply.code(201).send(await pointsOf(t.id));
  });
}
