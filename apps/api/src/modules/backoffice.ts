import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { activationSchema, pointRulesSchema, rewardSchema, shopProductSchema } from '@motix/shared';
import { requireRole } from '../auth';
import { postComments, posts, reports, rewardRedemptions, rewards, shopProducts, trainerVideos, trainers, users } from '../db/schema';
import { conflict, notFound, parse } from '../lib/errors';
import { audit } from '../services/events';
import { activateSubscription, describePointRules, getPointRules, movePoints, setPointRules } from '../services/points';

const idParam = z.object({ id: z.string().uuid() });

/** Strumenti BTECH: moderazione, video dei personal trainer, shop, premi e punti. */
export async function backofficeRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { db } = ctx;

  /* ---------- Moderazione della community ---------- */
  app.get('/admin/reports', async (req) => {
    requireRole(req, 'admin');
    const { outcome } = parse(z.object({ outcome: z.enum(['pending', 'dismissed', 'removed', 'suspended']).default('pending') }), req.query);
    const rows = await db
      .select({ r: reports, reporterFirst: users.firstName, reporterLast: users.lastName })
      .from(reports)
      .innerJoin(users, eq(users.id, reports.reporterId))
      .where(eq(reports.outcome, outcome))
      .orderBy(desc(reports.createdAt))
      .limit(200);
    const postIds = rows.filter((x) => x.r.targetType === 'post').map((x) => x.r.targetId);
    const commentIds = rows.filter((x) => x.r.targetType === 'comment').map((x) => x.r.targetId);
    const postRows = postIds.length ? await db.select({ p: posts, u: users }).from(posts).innerJoin(users, eq(users.id, posts.authorId)).where(inArray(posts.id, postIds)) : [];
    const commentRows = commentIds.length
      ? await db.select({ c: postComments, u: users }).from(postComments).innerJoin(users, eq(users.id, postComments.authorId)).where(inArray(postComments.id, commentIds))
      : [];
    const userIds = rows.filter((x) => x.r.targetType === 'user').map((x) => x.r.targetId);
    const userRows = userIds.length ? await db.select().from(users).where(inArray(users.id, userIds)) : [];
    return {
      reports: rows.map(({ r, reporterFirst, reporterLast }) => {
        const p = postRows.find((x) => x.p.id === r.targetId);
        const c = commentRows.find((x) => x.c.id === r.targetId);
        const u = userRows.find((x) => x.id === r.targetId);
        const author = p?.u ?? c?.u ?? u;
        return {
          id: r.id,
          targetType: r.targetType,
          reason: r.reason,
          at: r.createdAt.toISOString(),
          reporter: `${reporterFirst} ${reporterLast}`,
          author: author ? { id: author.id, name: `${author.firstName} ${author.lastName}`, email: author.email } : null,
          content: p ? { text: p.p.text, mediaUrl: p.p.mediaUrl, mediaType: p.p.mediaType } : c ? { text: c.c.text, mediaUrl: null, mediaType: null } : null,
        };
      }),
    };
  });

  /** Esito della segnalazione: archiviata, contenuto rimosso, oppure contenuto rimosso e autore sospeso. */
  app.post('/admin/reports/:id/:action', async (req) => {
    const auth = requireRole(req, 'admin');
    const { id, action } = parse(idParam.extend({ action: z.enum(['dismiss', 'remove', 'suspend']) }), req.params);
    const [r] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
    if (!r) throw notFound('Segnalazione non trovata');
    const now = ctx.now();
    let authorId: string | null = r.targetType === 'user' ? r.targetId : null;
    if (r.targetType === 'post') {
      const [p] = await db.select().from(posts).where(eq(posts.id, r.targetId)).limit(1);
      authorId = p?.authorId ?? null;
      // Archiviare la segnalazione rimette in pubblico un post nascosto in automatico.
      if (p) await db.update(posts).set({ moderationStatus: action === 'dismiss' ? 'approved' : 'removed' }).where(eq(posts.id, p.id));
    }
    if (r.targetType === 'comment') {
      const [c] = await db.select().from(postComments).where(eq(postComments.id, r.targetId)).limit(1);
      authorId = c?.authorId ?? null;
      if (c && action !== 'dismiss') await db.delete(postComments).where(eq(postComments.id, c.id));
    }
    if (r.targetType === 'trainer_video' && action !== 'dismiss') await db.update(trainerVideos).set({ reviewStatus: 'rejected' }).where(eq(trainerVideos.id, r.targetId));
    if (action === 'suspend' && authorId) {
      const [u] = await db.select().from(users).where(eq(users.id, authorId)).limit(1);
      if (u?.role === 'admin') throw conflict('admin_account', 'Non puoi sospendere un amministratore');
      await db.update(users).set({ status: 'suspended', updatedAt: now }).where(eq(users.id, authorId));
    }
    const outcome = action === 'dismiss' ? 'dismissed' : action === 'remove' ? 'removed' : 'suspended';
    // Tutte le segnalazioni aperte sullo stesso contenuto si chiudono insieme.
    await db
      .update(reports)
      .set({ outcome, handledBy: auth.userId, handledAt: now })
      .where(and(eq(reports.targetId, r.targetId), eq(reports.outcome, 'pending')));
    await audit(db, `report.${action}`, { actorUserId: auth.userId, entity: r.targetType, entityId: r.targetId, ip: req.ip });
    return { id, outcome };
  });

  /* ---------- Video dei personal trainer per la community ---------- */
  app.get('/admin/trainer-videos', async (req) => {
    requireRole(req, 'admin');
    const { status } = parse(z.object({ status: z.enum(['pending', 'approved', 'rejected']).default('pending') }), req.query);
    const rows = await db
      .select({ v: trainerVideos, firstName: users.firstName, lastName: users.lastName })
      .from(trainerVideos)
      .innerJoin(trainers, eq(trainers.id, trainerVideos.trainerId))
      .innerJoin(users, eq(users.id, trainers.userId))
      .where(and(eq(trainerVideos.visibility, 'community'), eq(trainerVideos.reviewStatus, status)))
      .orderBy(desc(trainerVideos.createdAt));
    return { videos: rows.map((r) => ({ id: r.v.id, title: r.v.title, url: r.v.videoUrl, trainerName: `${r.firstName} ${r.lastName}`, createdAt: r.v.createdAt.toISOString() })) };
  });

  app.post('/admin/trainer-videos/:id/:action', async (req) => {
    const auth = requireRole(req, 'admin');
    const { id, action } = parse(idParam.extend({ action: z.enum(['approve', 'reject']) }), req.params);
    const [v] = await db.update(trainerVideos).set({ reviewStatus: action === 'approve' ? 'approved' : 'rejected' }).where(eq(trainerVideos.id, id)).returning();
    if (!v) throw notFound('Video non trovato');
    await audit(db, `trainer_video.${action}`, { actorUserId: auth.userId, entity: 'trainer_video', entityId: id, ip: req.ip });
    return { id, reviewStatus: v.reviewStatus };
  });

  /* ---------- Catalogo dello shop ---------- */
  const catalog = async () => ({ products: await db.select().from(shopProducts).orderBy(asc(shopProducts.position), asc(shopProducts.name)) });

  app.get('/admin/shop/products', async (req) => {
    requireRole(req, 'admin');
    return catalog();
  });
  app.post('/admin/shop/products', async (req, reply) => {
    requireRole(req, 'admin');
    await db.insert(shopProducts).values(parse(shopProductSchema, req.body));
    return reply.code(201).send(await catalog());
  });
  app.put('/admin/shop/products/:id', async (req) => {
    requireRole(req, 'admin');
    const { id } = parse(idParam, req.params);
    const [p] = await db.update(shopProducts).set(parse(shopProductSchema, req.body)).where(eq(shopProducts.id, id)).returning();
    if (!p) throw notFound('Prodotto non trovato');
    return catalog();
  });
  app.delete('/admin/shop/products/:id', async (req) => {
    requireRole(req, 'admin');
    await db.delete(shopProducts).where(eq(shopProducts.id, parse(idParam, req.params).id));
    return catalog();
  });

  /* ---------- Punti e premi ---------- */
  const rewardsState = async () => {
    const pending = await db
      .select({ r: rewardRedemptions, reward: rewards.name, firstName: users.firstName, lastName: users.lastName, email: users.email })
      .from(rewardRedemptions)
      .innerJoin(rewards, eq(rewards.id, rewardRedemptions.rewardId))
      .innerJoin(trainers, eq(trainers.id, rewardRedemptions.trainerId))
      .innerJoin(users, eq(users.id, trainers.userId))
      .orderBy(desc(rewardRedemptions.createdAt))
      .limit(200);
    return {
      rules: describePointRules(await getPointRules(db)),
      rewards: await db.select().from(rewards).orderBy(asc(rewards.pointsRequired)),
      redemptions: pending.map((x) => ({ id: x.r.id, reward: x.reward, points: x.r.points, status: x.r.status, at: x.r.createdAt.toISOString(), trainer: `${x.firstName} ${x.lastName}`, email: x.email })),
    };
  };

  app.get('/admin/rewards', async (req) => {
    requireRole(req, 'admin');
    return rewardsState();
  });
  app.put('/admin/points/rules', async (req) => {
    const auth = requireRole(req, 'admin');
    const rules = parse(pointRulesSchema, req.body);
    await setPointRules(db, rules);
    await audit(db, 'points.rules_updated', { actorUserId: auth.userId, ip: req.ip }, rules);
    return rewardsState();
  });
  app.post('/admin/rewards', async (req, reply) => {
    requireRole(req, 'admin');
    await db.insert(rewards).values(parse(rewardSchema, req.body));
    return reply.code(201).send(await rewardsState());
  });
  app.put('/admin/rewards/:id', async (req) => {
    requireRole(req, 'admin');
    const [r] = await db.update(rewards).set(parse(rewardSchema, req.body)).where(eq(rewards.id, parse(idParam, req.params).id)).returning();
    if (!r) throw notFound('Premio non trovato');
    return rewardsState();
  });

  /** Richiesta di premio: approvata, consegnata, oppure rifiutata con restituzione dei punti. */
  app.post('/admin/redemptions/:id/:action', async (req) => {
    const auth = requireRole(req, 'admin');
    const { id, action } = parse(idParam.extend({ action: z.enum(['approve', 'deliver', 'reject']) }), req.params);
    const [row] = await db.select({ r: rewardRedemptions, reward: rewards }).from(rewardRedemptions).innerJoin(rewards, eq(rewards.id, rewardRedemptions.rewardId)).where(eq(rewardRedemptions.id, id)).limit(1);
    if (!row) throw notFound('Richiesta non trovata');
    const { r, reward } = row;
    if (r.status === 'rejected' || r.status === 'delivered') throw conflict('already_closed', 'Questa richiesta è già chiusa');
    if (action === 'reject') {
      await movePoints(db, r.trainerId, 'adjustment', r.points, { note: `Premio non assegnato: ${reward.name}` });
      if (reward.stock !== null) await db.update(rewards).set({ stock: reward.stock + 1 }).where(eq(rewards.id, reward.id));
    }
    const status = action === 'approve' ? 'approved' : action === 'deliver' ? 'delivered' : 'rejected';
    await db.update(rewardRedemptions).set({ status, handledBy: auth.userId, handledAt: ctx.now() }).where(eq(rewardRedemptions.id, id));
    await audit(db, `redemption.${action}`, { actorUserId: auth.userId, entity: 'redemption', entityId: id, ip: req.ip });
    return rewardsState();
  });

  /** Correzione manuale dei punti di un personal trainer (bonus o rettifica). */
  app.post('/admin/trainers/:id/points', async (req) => {
    const auth = requireRole(req, 'admin');
    const { id } = parse(idParam, req.params);
    const input = parse(z.object({ points: z.number().int().min(-100000).max(100000).refine((n) => n !== 0, 'Indica i punti'), note: z.string().trim().min(3, 'Indica il motivo').max(200) }), req.body);
    const balance = await movePoints(db, id, input.points > 0 ? 'bonus' : 'adjustment', input.points, { note: input.note });
    await audit(db, 'points.adjusted', { actorUserId: auth.userId, entity: 'trainer', entityId: id, ip: req.ip }, input);
    return { balance };
  });

  /**
   * Attivazione o rinnovo manuale di un abbonamento (pilot e assistenza). Assegna i punti al professionista del cliente.
   * Indica dove è stato pagato (store, sito). Con le conferme automatiche di store e sito arriverà da sola.
   */
  app.post('/admin/users/:id/subscription/:kind', async (req) => {
    const auth = requireRole(req, 'admin');
    const { id, kind } = parse(idParam.extend({ kind: z.enum(['activate', 'renew']) }), req.params);
    const pay = parse(activationSchema, req.body ?? {});
    const result = await activateSubscription(ctx, id, kind === 'activate' ? 'subscription' : 'renewal', pay);
    await audit(db, `subscription.${kind}`, { actorUserId: auth.userId, entity: 'user', entityId: id, ip: req.ip }, result);
    return result;
  });
}
