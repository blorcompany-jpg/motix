import { and, count, desc, eq, gte, inArray, isNotNull, lt, ne, or } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  commentSchema,
  postSchema,
  reportSchema,
  type CommentView,
  type LeaderboardRow,
  type PostView,
  type ProfileView,
  type Role,
  type TrainerCard,
} from '@motix/shared';
import { requireRole } from '../auth';
import {
  mediaFiles,
  postComments,
  postLikes,
  posts,
  reports,
  structures,
  trainers,
  userBlocks,
  users,
  workoutSessions,
} from '../db/schema';
import { addDays, mondayOf, toDay } from '../lib/days';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/errors';
import { track } from '../services/events';
import { hasPremium } from '../services/subscription';
import { mediaUrl } from './media';

const idParam = z.object({ id: z.string().uuid() });
/** Dopo questo numero di segnalazioni un post viene nascosto in attesa della revisione di BTECH. */
const AUTO_HIDE_REPORTS = 3;

type UserRow = typeof users.$inferSelect;

/** Nome mostrato nella community: per intero solo se il profilo è pubblico o è un personal trainer. */
export const communityName = (u: Pick<UserRow, 'firstName' | 'lastName' | 'profileVisibility' | 'role'>) =>
  u.profileVisibility === 'public' || u.role === 'personal_trainer' ? `${u.firstName} ${u.lastName}` : `${u.firstName} ${u.lastName.charAt(0)}.`;

export async function communityRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { db } = ctx;

  const me = async (req: FastifyRequest) => {
    const auth = requireRole(req, 'user', 'personal_trainer');
    const [u] = await db.select().from(users).where(eq(users.id, auth.userId)).limit(1);
    return u!;
  };

  /** Utenti da non mostrare: quelli bloccati da me e quelli che mi hanno bloccato. */
  const hiddenUsers = async (userId: string) => {
    const rows = await db.select().from(userBlocks).where(or(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, userId)));
    return new Set(rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)));
  };

  const toViews = async (viewer: UserRow, rows: Array<typeof posts.$inferSelect>): Promise<PostView[]> => {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const authors = await db.select().from(users).where(inArray(users.id, [...new Set(rows.map((r) => r.authorId))]));
    const structureIds = [...new Set(authors.map((a) => a.structureId).filter((x): x is string => Boolean(x)))];
    const names = structureIds.length ? await db.select({ id: structures.id, name: structures.displayName }).from(structures).where(inArray(structures.id, structureIds)) : [];
    const likes = await db.select({ postId: postLikes.postId, n: count() }).from(postLikes).where(inArray(postLikes.postId, ids)).groupBy(postLikes.postId);
    const mine = await db.select({ postId: postLikes.postId }).from(postLikes).where(and(inArray(postLikes.postId, ids), eq(postLikes.userId, viewer.id)));
    const comments = await db.select({ postId: postComments.postId, n: count() }).from(postComments).where(inArray(postComments.postId, ids)).groupBy(postComments.postId);
    return rows.map((p) => {
      const a = authors.find((x) => x.id === p.authorId)!;
      return {
        id: p.id,
        author: { id: a.id, name: communityName(a), role: a.role as Role, structure: names.find((n) => n.id === a.structureId)?.name ?? null },
        text: p.text,
        media: p.mediaUrl && p.mediaType ? { url: p.mediaUrl, type: p.mediaType } : null,
        visibility: p.visibility,
        createdAt: p.createdAt.toISOString(),
        likes: likes.find((l) => l.postId === p.id)?.n ?? 0,
        liked: mine.some((l) => l.postId === p.id),
        comments: comments.find((c) => c.postId === p.id)?.n ?? 0,
        mine: p.authorId === viewer.id,
      };
    });
  };

  /** Un post è visibile se è approvato, non è di un utente nascosto e rientra nel feed di chi guarda. */
  const visiblePost = async (viewer: UserRow, id: string) => {
    const [p] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (!p) throw notFound('Post non trovato');
    if (p.authorId !== viewer.id) {
      const hidden = await hiddenUsers(viewer.id);
      const inScope = p.visibility === 'global' || (p.structureId !== null && p.structureId === viewer.structureId);
      if (p.moderationStatus !== 'approved' || hidden.has(p.authorId) || !inScope) throw notFound('Post non trovato');
    }
    return p;
  };

  /* ---------- Feed ---------- */
  app.get('/community/feed', async (req) => {
    const viewer = await me(req);
    const q = parse(z.object({ scope: z.enum(['structure', 'global']).default('global'), before: z.string().datetime().optional() }), req.query);
    if (q.scope === 'structure' && !viewer.structureId) return { posts: [], next: null };
    const hidden = await hiddenUsers(viewer.id);
    const rows = await db
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.moderationStatus, 'approved'),
          q.scope === 'structure' ? eq(posts.structureId, viewer.structureId!) : eq(posts.visibility, 'global'),
          q.before ? lt(posts.createdAt, new Date(q.before)) : undefined,
        ),
      )
      .orderBy(desc(posts.createdAt))
      .limit(60);
    const page = rows.filter((r) => !hidden.has(r.authorId)).slice(0, 20);
    return { posts: await toViews(viewer, page), next: rows.length === 60 || page.length === 20 ? (page.at(-1)?.createdAt.toISOString() ?? null) : null };
  });

  app.post('/community/posts', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const viewer = await me(req);
    const input = parse(postSchema, req.body);
    if (input.visibility === 'structure' && !viewer.structureId)
      throw badRequest('no_structure', 'Per pubblicare nella tua struttura collega prima la struttura dal profilo');
    // Chi ha il profilo privato pubblica solo nella propria struttura.
    if (input.visibility === 'global' && viewer.role === 'user' && viewer.profileVisibility !== 'public')
      throw badRequest('profile_private', 'Per pubblicare per tutti rendi visibile il tuo profilo, dal menu Profilo');
    let media: typeof mediaFiles.$inferSelect | undefined;
    if (input.mediaId) {
      [media] = await db.select().from(mediaFiles).where(and(eq(mediaFiles.id, input.mediaId), eq(mediaFiles.ownerId, viewer.id))).limit(1);
      if (!media) throw badRequest('media_invalid', 'File non trovato: caricalo di nuovo');
      // Pubblicare video è una funzione Premium per chi si allena (sezione 3.1).
      if (media.kind === 'video' && viewer.role === 'user' && !(await hasPremium(ctx, viewer.id)))
        throw forbidden('Pubblicare video è incluso in Premium', 'premium_required');
    }
    const [p] = await db
      .insert(posts)
      .values({
        authorId: viewer.id,
        text: input.text ?? null,
        mediaUrl: media ? mediaUrl(ctx, media.key) : null,
        mediaType: media?.kind ?? null,
        visibility: input.visibility,
        structureId: viewer.structureId,
        // Pubblicazione immediata; le segnalazioni portano il post nella coda di revisione di BTECH.
        moderationStatus: 'approved',
        createdAt: ctx.now(),
      })
      .returning();
    await track(db, 'post_pubblicato', { userId: viewer.id, structureId: viewer.structureId }, { media: media?.kind ?? 'none' });
    return reply.code(201).send((await toViews(viewer, [p!]))[0]);
  });

  app.delete('/community/posts/:id', async (req) => {
    const viewer = await me(req);
    const { id } = parse(idParam, req.params);
    const [p] = await db.select().from(posts).where(and(eq(posts.id, id), eq(posts.authorId, viewer.id))).limit(1);
    if (!p) throw notFound('Post non trovato');
    await db.delete(posts).where(eq(posts.id, id));
    return { ok: true };
  });

  app.put('/community/posts/:id/like', async (req) => {
    const viewer = await me(req);
    const p = await visiblePost(viewer, parse(idParam, req.params).id);
    await db.insert(postLikes).values({ postId: p.id, userId: viewer.id }).onConflictDoNothing();
    return (await toViews(viewer, [p]))[0];
  });

  app.delete('/community/posts/:id/like', async (req) => {
    const viewer = await me(req);
    const p = await visiblePost(viewer, parse(idParam, req.params).id);
    await db.delete(postLikes).where(and(eq(postLikes.postId, p.id), eq(postLikes.userId, viewer.id)));
    return (await toViews(viewer, [p]))[0];
  });

  /* ---------- Commenti ---------- */
  const commentsOf = async (viewer: UserRow, postId: string): Promise<CommentView[]> => {
    const hidden = await hiddenUsers(viewer.id);
    const rows = await db
      .select({ c: postComments, u: users })
      .from(postComments)
      .innerJoin(users, eq(users.id, postComments.authorId))
      .where(eq(postComments.postId, postId))
      .orderBy(postComments.createdAt)
      .limit(200);
    return rows
      .filter((r) => !hidden.has(r.u.id))
      .map(({ c, u }) => ({ id: c.id, author: { id: u.id, name: communityName(u) }, text: c.text, createdAt: c.createdAt.toISOString(), mine: u.id === viewer.id }));
  };

  app.get('/community/posts/:id/comments', async (req) => {
    const viewer = await me(req);
    const p = await visiblePost(viewer, parse(idParam, req.params).id);
    return { post: (await toViews(viewer, [p]))[0], comments: await commentsOf(viewer, p.id) };
  });

  app.post('/community/posts/:id/comments', { config: { rateLimit: { max: 40, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const viewer = await me(req);
    const p = await visiblePost(viewer, parse(idParam, req.params).id);
    const { text } = parse(commentSchema, req.body);
    await db.insert(postComments).values({ postId: p.id, authorId: viewer.id, text, createdAt: ctx.now() });
    return reply.code(201).send({ comments: await commentsOf(viewer, p.id) });
  });

  app.delete('/community/comments/:id', async (req) => {
    const viewer = await me(req);
    const { id } = parse(idParam, req.params);
    const [c] = await db.select().from(postComments).where(and(eq(postComments.id, id), eq(postComments.authorId, viewer.id))).limit(1);
    if (!c) throw notFound('Commento non trovato');
    await db.delete(postComments).where(eq(postComments.id, id));
    return { ok: true };
  });

  /* ---------- Segnalazioni e blocchi ---------- */
  app.post('/community/reports', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const viewer = await me(req);
    const input = parse(reportSchema, req.body);
    const [dup] = await db
      .select({ id: reports.id })
      .from(reports)
      .where(and(eq(reports.reporterId, viewer.id), eq(reports.targetId, input.targetId), eq(reports.outcome, 'pending')))
      .limit(1);
    if (!dup) await db.insert(reports).values({ reporterId: viewer.id, targetType: input.targetType, targetId: input.targetId, reason: input.reason });
    if (input.targetType === 'post') {
      const [n] = await db.select({ n: count() }).from(reports).where(and(eq(reports.targetId, input.targetId), eq(reports.outcome, 'pending')));
      if ((n?.n ?? 0) >= AUTO_HIDE_REPORTS) await db.update(posts).set({ moderationStatus: 'pending' }).where(eq(posts.id, input.targetId));
    }
    return reply.code(201).send({ ok: true });
  });

  app.put('/community/blocks/:id', async (req) => {
    const viewer = await me(req);
    const { id } = parse(idParam, req.params);
    if (id === viewer.id) throw conflict('self', 'Non puoi bloccare te stesso');
    await db.insert(userBlocks).values({ blockerId: viewer.id, blockedId: id }).onConflictDoNothing();
    return { ok: true };
  });

  app.delete('/community/blocks/:id', async (req) => {
    const viewer = await me(req);
    const { id } = parse(idParam, req.params);
    await db.delete(userBlocks).where(and(eq(userBlocks.blockerId, viewer.id), eq(userBlocks.blockedId, id)));
    return { ok: true };
  });

  app.get('/community/blocks', async (req) => {
    const viewer = await me(req);
    const rows = await db
      .select({ u: users })
      .from(userBlocks)
      .innerJoin(users, eq(users.id, userBlocks.blockedId))
      .where(eq(userBlocks.blockerId, viewer.id));
    return { blocked: rows.map(({ u }) => ({ id: u.id, name: communityName(u) })) };
  });

  /* ---------- Profili ---------- */
  app.get('/community/profiles/:id', async (req): Promise<ProfileView> => {
    const viewer = await me(req);
    const { id } = parse(idParam, req.params);
    const [u] = await db.select().from(users).where(and(eq(users.id, id), eq(users.status, 'active'))).limit(1);
    if (!u || !['user', 'personal_trainer'].includes(u.role)) throw notFound('Profilo non trovato');
    const blocks = await db.select().from(userBlocks).where(or(and(eq(userBlocks.blockerId, viewer.id), eq(userBlocks.blockedId, id)), and(eq(userBlocks.blockerId, id), eq(userBlocks.blockedId, viewer.id))));
    if (blocks.some((b) => b.blockerId === id)) throw notFound('Profilo non trovato');
    const blocked = blocks.some((b) => b.blockerId === viewer.id);
    const self = id === viewer.id;
    const isPrivate = !self && u.role === 'user' && u.profileVisibility !== 'public';
    const [s] = u.structureId ? await db.select({ name: structures.displayName }).from(structures).where(eq(structures.id, u.structureId)).limit(1) : [];
    const base = { id: u.id, name: communityName(u), role: u.role as Role, structure: s?.name ?? null, private: isPrivate, blocked };
    // Un profilo privato mostra solo il nome abbreviato.
    if (isPrivate || blocked) return { ...base, trainer: null, stats: null, posts: [] };
    const [t] = u.role === 'personal_trainer' ? await db.select().from(trainers).where(and(eq(trainers.userId, u.id), eq(trainers.status, 'approved'))).limit(1) : [];
    const [done] = await db.select({ n: count() }).from(workoutSessions).where(and(eq(workoutSessions.userId, u.id), isNotNull(workoutSessions.completedAt)));
    const mine = await db
      .select()
      .from(posts)
      .where(and(eq(posts.authorId, u.id), self ? undefined : eq(posts.moderationStatus, 'approved'), self ? undefined : or(eq(posts.visibility, 'global'), viewer.structureId ? eq(posts.structureId, viewer.structureId) : undefined)))
      .orderBy(desc(posts.createdAt))
      .limit(30);
    return {
      ...base,
      trainer: t && t.publicProfile ? { id: t.id, specializations: t.specializations, bio: t.bio } : null,
      stats: { sessions: done?.n ?? 0, posts: mine.length },
      posts: await toViews(viewer, mine),
    };
  });

  /** Personal trainer con profilo pubblico, da contattare. */
  app.get('/community/trainers', async (req) => {
    const viewer = await me(req);
    const { q } = parse(z.object({ q: z.string().trim().max(60).optional() }), req.query);
    const hidden = await hiddenUsers(viewer.id);
    const term = q?.toLowerCase();
    const rows = await db
      .select({ t: trainers, u: users })
      .from(trainers)
      .innerJoin(users, eq(users.id, trainers.userId))
      .where(and(eq(trainers.status, 'approved'), eq(trainers.publicProfile, true), eq(users.status, 'active'), ne(users.id, viewer.id)))
      .limit(500);
    const list: TrainerCard[] = rows
      .filter((r) => !hidden.has(r.u.id))
      .filter((r) => !term || `${r.u.firstName} ${r.u.lastName}`.toLowerCase().includes(term) || r.t.specializations.some((x) => x.toLowerCase().includes(term)))
      .slice(0, 100)
      .map(({ t, u }) => ({ trainerId: t.id, userId: u.id, name: `${u.firstName} ${u.lastName}`, specializations: t.specializations, bio: t.bio }));
    return { trainers: list };
  });

  /* ---------- Classifica della struttura ---------- */
  app.get('/community/leaderboard', async (req) => {
    const viewer = await me(req);
    const { period } = parse(z.object({ period: z.enum(['week', 'month']).default('week') }), req.query);
    if (!viewer.structureId) return { period, rows: [] as LeaderboardRow[], structure: null };
    const day = toDay(ctx.now());
    const from = period === 'week' ? mondayOf(day) : addDays(day, -29);
    // In classifica compaiono solo gli iscritti con profilo pubblico, più chi sta guardando.
    const members = await db
      .select()
      .from(users)
      .where(and(eq(users.structureId, viewer.structureId), eq(users.role, 'user'), eq(users.status, 'active'), or(eq(users.profileVisibility, 'public'), eq(users.id, viewer.id))));
    const ids = members.map((m) => m.id);
    const done = ids.length
      ? await db
          .select({ userId: workoutSessions.userId, n: count() })
          .from(workoutSessions)
          .where(and(inArray(workoutSessions.userId, ids), isNotNull(workoutSessions.completedAt), gte(workoutSessions.scheduledDate, from)))
          .groupBy(workoutSessions.userId)
      : [];
    const [s] = await db.select({ name: structures.displayName }).from(structures).where(eq(structures.id, viewer.structureId)).limit(1);
    const ranked = members
      .map((m) => ({ userId: m.id, name: communityName(m), sessions: done.find((d) => d.userId === m.id)?.n ?? 0, me: m.id === viewer.id }))
      .filter((r) => r.sessions > 0 || r.me)
      .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
    const rows: LeaderboardRow[] = ranked.map((r, i) => ({ ...r, rank: ranked.findIndex((x) => x.sessions === r.sessions) + 1 || i + 1 })).slice(0, 50);
    return { period, structure: s?.name ?? null, rows };
  });
}
