import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { REQUIRED_CONSENTS, codeSchema, updateConsentsSchema } from '@motix/shared';
import { requireAuth, requireRole } from '../auth';
import { clientLinks, mediaFiles, refreshTokens, structures, trainers, users } from '../db/schema';
import { badRequest, conflict, notFound, parse } from '../lib/errors';
import { audit, track } from '../services/events';
import { buildMe, getConsents, setConsents } from '../services/users';

export async function meRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { db } = ctx;

  app.get('/me', async (req) => buildMe(ctx, requireAuth(req).userId));

  app.patch('/me', async (req) => {
    const auth = requireAuth(req);
    const input = parse(
      z.object({
        firstName: z.string().trim().min(1).max(80).optional(),
        lastName: z.string().trim().min(1).max(80).optional(),
        profileVisibility: z.enum(['private', 'public']).optional(),
      }),
      req.body,
    );
    await db.update(users).set({ ...input, updatedAt: ctx.now() }).where(eq(users.id, auth.userId));
    return buildMe(ctx, auth.userId);
  });

  /* ---------- Consensi ---------- */
  app.patch('/me/consents', async (req) => {
    const auth = requireAuth(req);
    const input = parse(updateConsentsSchema, req.body);
    for (const type of REQUIRED_CONSENTS)
      if (input[type] === false)
        throw badRequest('consent_required', 'Questo consenso è necessario per usare MOTIX: per revocarlo cancella l’account');
    await setConsents(db, auth.userId, input, ctx.now());
    // Revocare la condivisione con il personal trainer toglie subito l'accesso ai dati.
    if (input.share_trainer !== undefined)
      await db
        .update(clientLinks)
        .set({ dataConsent: input.share_trainer })
        .where(and(eq(clientLinks.userId, auth.userId), eq(clientLinks.status, 'active')));
    await audit(db, 'consents.updated', { actorUserId: auth.userId, entity: 'user', entityId: auth.userId, ip: req.ip }, input);
    return { consents: await getConsents(db, auth.userId) };
  });

  /* ---------- Struttura: al massimo una alla volta ---------- */
  app.put('/me/structure', async (req) => {
    const auth = requireRole(req, 'user');
    const { code } = parse(codeSchema, req.body);
    const [s] = await db
      .select()
      .from(structures)
      .where(and(eq(structures.code, code), eq(structures.status, 'approved')))
      .limit(1);
    if (!s) throw badRequest('structure_code_invalid', 'Codice della struttura non valido', { code: 'Codice non valido' });
    const [u] = await db.select().from(users).where(eq(users.id, auth.userId)).limit(1);
    await db.update(users).set({ structureId: s.id, structureJoinedAt: ctx.now(), updatedAt: ctx.now() }).where(eq(users.id, auth.userId));
    await track(db, 'registrazione_con_codice', { userId: auth.userId, structureId: s.id, channel: u?.acquisitionChannel });
    return buildMe(ctx, auth.userId);
  });

  app.delete('/me/structure', async (req) => {
    const auth = requireRole(req, 'user');
    await db.update(users).set({ structureId: null, structureJoinedAt: null, updatedAt: ctx.now() }).where(eq(users.id, auth.userId));
    return buildMe(ctx, auth.userId);
  });

  /* ---------- Il mio personal trainer ---------- */
  const myLinks = async (userId: string) =>
    db
      .select({
        id: clientLinks.id,
        status: clientLinks.status,
        dataConsent: clientLinks.dataConsent,
        startedAt: clientLinks.startedAt,
        trainerId: trainers.id,
        trainerUserId: trainers.userId,
        firstName: users.firstName,
        lastName: users.lastName,
        specializations: trainers.specializations,
      })
      .from(clientLinks)
      .innerJoin(trainers, eq(trainers.id, clientLinks.trainerId))
      .innerJoin(users, eq(users.id, trainers.userId))
      .where(and(eq(clientLinks.userId, userId), inArray(clientLinks.status, ['active', 'requested_by_user', 'requested_by_trainer'])));

  const hasActiveLink = async (userId: string) => {
    const [row] = await db
      .select({ id: clientLinks.id })
      .from(clientLinks)
      .where(and(eq(clientLinks.userId, userId), eq(clientLinks.status, 'active')))
      .limit(1);
    return Boolean(row);
  };

  app.get('/me/trainer-links', async (req) => ({ links: await myLinks(requireRole(req, 'user').userId) }));

  /** Collegamento con il codice del personal trainer: il codice è il suo invito, quindi è subito attivo. */
  app.post('/me/trainer-links', async (req, reply) => {
    const auth = requireRole(req, 'user');
    const { code } = parse(codeSchema, req.body);
    const [t] = await db
      .select()
      .from(trainers)
      .where(and(eq(trainers.inviteCode, code), eq(trainers.status, 'approved')))
      .limit(1);
    if (!t) throw badRequest('trainer_code_invalid', 'Codice del personal trainer non valido', { code: 'Codice non valido' });
    if (await hasActiveLink(auth.userId))
      throw conflict('trainer_already_linked', 'Hai già un personal trainer collegato: chiudi prima quel collegamento');
    const consents = await getConsents(db, auth.userId);
    // Un'eventuale richiesta in sospeso con lo stesso personal trainer viene sostituita.
    await db
      .update(clientLinks)
      .set({ status: 'closed', closedAt: ctx.now() })
      .where(
        and(
          eq(clientLinks.userId, auth.userId),
          eq(clientLinks.trainerId, t.id),
          inArray(clientLinks.status, ['requested_by_user', 'requested_by_trainer']),
        ),
      );
    await db.insert(clientLinks).values({
      userId: auth.userId,
      trainerId: t.id,
      status: 'active',
      dataConsent: consents.share_trainer,
      startedAt: ctx.now(),
    });
    await track(db, 'cliente_collegato', { userId: auth.userId, trainerId: t.id });
    return reply.code(201).send({ links: await myLinks(auth.userId) });
  });

  /** Richiesta a un personal trainer trovato nella community: parte quando lui accetta. */
  app.post('/me/trainer-links/request', async (req, reply) => {
    const auth = requireRole(req, 'user');
    const { trainerId } = parse(z.object({ trainerId: z.string().uuid() }), req.body);
    const [t] = await db
      .select()
      .from(trainers)
      .where(and(eq(trainers.id, trainerId), eq(trainers.status, 'approved')))
      .limit(1);
    if (!t) throw notFound('Personal trainer non trovato');
    if (await hasActiveLink(auth.userId))
      throw conflict('trainer_already_linked', 'Hai già un personal trainer collegato: chiudi prima quel collegamento');
    const [pending] = await db
      .select({ id: clientLinks.id })
      .from(clientLinks)
      .where(
        and(
          eq(clientLinks.userId, auth.userId),
          eq(clientLinks.trainerId, t.id),
          inArray(clientLinks.status, ['requested_by_user', 'requested_by_trainer']),
        ),
      )
      .limit(1);
    if (pending) throw conflict('request_pending', 'C’è già una richiesta in sospeso con questo personal trainer');
    await db.insert(clientLinks).values({ userId: auth.userId, trainerId: t.id, status: 'requested_by_user' });
    return reply.code(201).send({ links: await myLinks(auth.userId) });
  });

  app.post('/me/trainer-links/:id/:action', async (req) => {
    const auth = requireRole(req, 'user');
    const { id, action } = parse(
      z.object({ id: z.string().uuid(), action: z.enum(['accept', 'decline', 'close']) }),
      req.params,
    );
    const [link] = await db
      .select()
      .from(clientLinks)
      .where(and(eq(clientLinks.id, id), eq(clientLinks.userId, auth.userId)))
      .limit(1);
    if (!link) throw notFound('Collegamento non trovato');
    const now = ctx.now();
    if (action === 'accept') {
      if (link.status !== 'requested_by_trainer') throw conflict('invalid_state', 'Non c’è un invito da accettare');
      if (await hasActiveLink(auth.userId))
        throw conflict('trainer_already_linked', 'Hai già un personal trainer collegato: chiudi prima quel collegamento');
      const consents = await getConsents(db, auth.userId);
      await db
        .update(clientLinks)
        .set({ status: 'active', startedAt: now, dataConsent: consents.share_trainer })
        .where(eq(clientLinks.id, id));
      await track(db, 'cliente_collegato', { userId: auth.userId, trainerId: link.trainerId });
    } else if (action === 'decline') {
      if (link.status !== 'requested_by_trainer') throw conflict('invalid_state', 'Non c’è un invito da rifiutare');
      await db.update(clientLinks).set({ status: 'declined', closedAt: now }).where(eq(clientLinks.id, id));
    } else {
      if (!['active', 'requested_by_user'].includes(link.status)) throw conflict('invalid_state', 'Collegamento già chiuso');
      // Alla chiusura il personal trainer perde l'accesso ai dati.
      await db.update(clientLinks).set({ status: 'closed', closedAt: now, dataConsent: false }).where(eq(clientLinks.id, id));
      if (link.status === 'active') await track(db, 'cliente_scollegato', { userId: auth.userId, trainerId: link.trainerId });
    }
    return { links: await myLinks(auth.userId) };
  });

  /* ---------- Cancellazione dell'account ---------- */
  app.delete('/me', async (req) => {
    const auth = requireAuth(req);
    if (auth.role === 'owner') {
      const [s] = await db.select({ id: structures.id }).from(structures).where(eq(structures.ownerUserId, auth.userId)).limit(1);
      if (s)
        throw conflict('owner_has_structure', 'Sei titolare di una struttura affiliata: contatta l’assistenza BTECH per chiudere l’affiliazione');
    }
    if (auth.role === 'admin') throw conflict('admin_account', 'Un account amministratore si rimuove dal pannello BTECH');
    await db.update(refreshTokens).set({ revokedAt: ctx.now() }).where(and(eq(refreshTokens.userId, auth.userId), isNull(refreshTokens.revokedAt)));
    // Anche foto e video caricati vengono cancellati dall'archivio.
    const files = await db.select({ key: mediaFiles.key }).from(mediaFiles).where(eq(mediaFiles.ownerId, auth.userId));
    for (const f of files) await ctx.storage.remove(f.key);
    await db.delete(users).where(eq(users.id, auth.userId));
    await audit(db, 'user.deleted', { entity: 'user', entityId: auth.userId, ip: req.ip });
    return { ok: true };
  });
}
