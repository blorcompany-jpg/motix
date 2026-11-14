import { and, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { codeSchema, inviteClientSchema } from '@motix/shared';
import { requireRole } from '../auth';
import { clientLinks, structures, subscriptions, trainerStructures, trainers, users } from '../db/schema';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/errors';
import { track } from '../services/events';
import { riskFor } from '../services/risk';
import { findUserByEmail } from '../services/users';

export async function trainerRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { db } = ctx;

  /** Il personal trainer che fa la richiesta; molte azioni richiedono l'approvazione di BTECH. */
  const me = async (req: FastifyRequest, mustBeApproved = true) => {
    const auth = requireRole(req, 'personal_trainer');
    const [row] = await db
      .select({ t: trainers, u: users })
      .from(trainers)
      .innerJoin(users, eq(users.id, trainers.userId))
      .where(eq(trainers.userId, auth.userId))
      .limit(1);
    if (!row) throw notFound('Profilo personal trainer non trovato');
    if (mustBeApproved && row.t.status !== 'approved')
      throw forbidden('Il tuo profilo è in attesa di approvazione da parte di BTECH', 'trainer_not_approved');
    return row;
  };

  app.get('/trainer', async (req) => {
    const { t } = await me(req, false);
    return {
      id: t.id,
      status: t.status,
      statusReason: t.statusReason,
      inviteCode: t.inviteCode,
      inviteLink: `${ctx.config.publicWebUrl}/pt/${t.inviteCode}`,
      specializations: t.specializations,
      bio: t.bio,
      publicProfile: t.publicProfile,
      pointsBalance: t.pointsBalance,
    };
  });

  app.patch('/trainer', async (req) => {
    const { t } = await me(req, false);
    const input = parse(
      z.object({
        specializations: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
        bio: z.string().trim().max(600).optional(),
        publicProfile: z.boolean().optional(),
      }),
      req.body,
    );
    await db.update(trainers).set(input).where(eq(trainers.id, t.id));
    return { ok: true };
  });

  /* ---------- Clienti ---------- */
  const listClients = async (trainerId: string) => {
    const rows = await db
      .select({ link: clientLinks, u: users })
      .from(clientLinks)
      .innerJoin(users, eq(users.id, clientLinks.userId))
      .where(and(eq(clientLinks.trainerId, trainerId), inArray(clientLinks.status, ['active', 'requested_by_user', 'requested_by_trainer'])))
      .orderBy(desc(clientLinks.createdAt));
    const ids = rows.map((r) => r.u.id);
    const subs = ids.length ? await db.select().from(subscriptions).where(inArray(subscriptions.userId, ids)) : [];
    // Il rischio abbandono si calcola solo per i clienti attivi che condividono i dati.
    const sharing = rows.filter((r) => r.link.status === 'active' && r.link.dataConsent).map((r) => r.u.id);
    const risks = await riskFor(db, sharing, ctx.now());
    return rows.map(({ link, u }) => ({
      risk: risks.get(u.id) ?? null,
      linkId: link.id,
      status: link.status,
      startedAt: link.startedAt,
      dataConsent: link.dataConsent,
      // Senza consenso alla condivisione il personal trainer vede solo il nome.
      client: {
        id: u.id,
        firstName: u.firstName,
        lastName: link.dataConsent ? u.lastName : `${u.lastName.charAt(0)}.`,
        email: link.dataConsent ? u.email : null,
      },
      subscriptionStatus: subs.find((s) => s.userId === u.id)?.status ?? null,
    }));
  };

  app.get('/trainer/clients', async (req) => {
    const { t } = await me(req);
    return { clients: await listClients(t.id) };
  });

  /** Invito per email: se la persona ha già l'app riceve una richiesta da accettare, altrimenti il link con il codice. */
  app.post('/trainer/clients/invite', async (req, reply) => {
    const { t, u: trainerUser } = await me(req);
    const { email } = parse(inviteClientSchema, req.body);
    const target = await findUserByEmail(db, email);
    const link = `${ctx.config.publicWebUrl}/pt/${t.inviteCode}`;
    if (target && target.role === 'user' && target.status === 'active') {
      const [existing] = await db
        .select()
        .from(clientLinks)
        .where(
          and(
            eq(clientLinks.userId, target.id),
            eq(clientLinks.trainerId, t.id),
            inArray(clientLinks.status, ['active', 'requested_by_user', 'requested_by_trainer']),
          ),
        )
        .limit(1);
      if (existing?.status === 'active') throw conflict('already_client', 'Questa persona è già tua cliente');
      if (!existing) await db.insert(clientLinks).values({ userId: target.id, trainerId: t.id, status: 'requested_by_trainer' });
    }
    await ctx.mailer.send({
      to: email,
      kind: 'client_invite',
      subject: `${trainerUser.firstName} ${trainerUser.lastName} ti invita su MOTIX`,
      text:
        `${trainerUser.firstName} ${trainerUser.lastName} vuole seguirti come personal trainer su MOTIX.\n` +
        `Apri l'app e accetta l'invito, oppure registrati con il codice ${t.inviteCode}:\n${link}`,
      link,
    });
    return reply.code(202).send({ ok: true });
  });

  app.post('/trainer/clients/:linkId/:action', async (req) => {
    const { t } = await me(req);
    const { linkId, action } = parse(
      z.object({ linkId: z.string().uuid(), action: z.enum(['accept', 'decline', 'close']) }),
      req.params,
    );
    const [link] = await db
      .select()
      .from(clientLinks)
      .where(and(eq(clientLinks.id, linkId), eq(clientLinks.trainerId, t.id)))
      .limit(1);
    if (!link) throw notFound('Collegamento non trovato');
    const now = ctx.now();
    if (action === 'accept') {
      if (link.status !== 'requested_by_user') throw conflict('invalid_state', 'Non c’è una richiesta da accettare');
      const [other] = await db
        .select({ id: clientLinks.id })
        .from(clientLinks)
        .where(and(eq(clientLinks.userId, link.userId), eq(clientLinks.status, 'active')))
        .limit(1);
      if (other) throw conflict('trainer_already_linked', 'Questa persona ha già un personal trainer collegato');
      await db.update(clientLinks).set({ status: 'active', startedAt: now }).where(eq(clientLinks.id, linkId));
      await track(db, 'cliente_collegato', { userId: link.userId, trainerId: t.id });
    } else if (action === 'decline') {
      if (link.status !== 'requested_by_user') throw conflict('invalid_state', 'Non c’è una richiesta da rifiutare');
      await db.update(clientLinks).set({ status: 'declined', closedAt: now }).where(eq(clientLinks.id, linkId));
    } else {
      if (!['active', 'requested_by_trainer'].includes(link.status)) throw conflict('invalid_state', 'Collegamento già chiuso');
      await db.update(clientLinks).set({ status: 'closed', closedAt: now, dataConsent: false }).where(eq(clientLinks.id, linkId));
      if (link.status === 'active') await track(db, 'cliente_scollegato', { userId: link.userId, trainerId: t.id });
    }
    return { clients: await listClients(t.id) };
  });

  /* ---------- Strutture: un personal trainer può lavorare con più strutture ---------- */
  const listStructures = async (trainerId: string) =>
    db
      .select({
        structureId: structures.id,
        displayName: structures.displayName,
        city: structures.city,
        status: trainerStructures.status,
      })
      .from(trainerStructures)
      .innerJoin(structures, eq(structures.id, trainerStructures.structureId))
      .where(and(eq(trainerStructures.trainerId, trainerId), inArray(trainerStructures.status, ['active', 'invited_by_structure', 'requested_by_trainer'])));

  app.get('/trainer/structures', async (req) => {
    const { t } = await me(req, false);
    return { structures: await listStructures(t.id) };
  });

  app.post('/trainer/structures', async (req, reply) => {
    const { t } = await me(req);
    const { code } = parse(codeSchema, req.body);
    const [s] = await db
      .select()
      .from(structures)
      .where(and(eq(structures.code, code), eq(structures.status, 'approved')))
      .limit(1);
    if (!s) throw badRequest('structure_code_invalid', 'Codice della struttura non valido', { code: 'Codice non valido' });
    const [existing] = await db
      .select()
      .from(trainerStructures)
      .where(and(eq(trainerStructures.trainerId, t.id), eq(trainerStructures.structureId, s.id)))
      .limit(1);
    if (existing?.status === 'active') throw conflict('already_linked', 'Sei già collegato a questa struttura');
    // Se la struttura aveva già invitato il personal trainer, la richiesta vale come accettazione.
    const status = existing?.status === 'invited_by_structure' ? 'active' : 'requested_by_trainer';
    await db
      .insert(trainerStructures)
      .values({ trainerId: t.id, structureId: s.id, status })
      .onConflictDoUpdate({
        target: [trainerStructures.trainerId, trainerStructures.structureId],
        set: { status, updatedAt: ctx.now() },
      });
    if (status === 'active') await track(db, 'pt_collegato_struttura', { trainerId: t.id, structureId: s.id });
    return reply.code(201).send({ structures: await listStructures(t.id) });
  });

  app.post('/trainer/structures/:structureId/:action', async (req) => {
    const { t } = await me(req);
    const { structureId, action } = parse(
      z.object({ structureId: z.string().uuid(), action: z.enum(['accept', 'leave']) }),
      req.params,
    );
    const where = and(eq(trainerStructures.trainerId, t.id), eq(trainerStructures.structureId, structureId));
    const [row] = await db.select().from(trainerStructures).where(where).limit(1);
    if (!row || row.status === 'closed') throw notFound('Collegamento non trovato');
    if (action === 'accept') {
      if (row.status !== 'invited_by_structure') throw conflict('invalid_state', 'Non c’è un invito da accettare');
      await db.update(trainerStructures).set({ status: 'active', updatedAt: ctx.now() }).where(where);
      await track(db, 'pt_collegato_struttura', { trainerId: t.id, structureId });
    } else {
      await db.update(trainerStructures).set({ status: 'closed', updatedAt: ctx.now() }).where(where);
    }
    return { structures: await listStructures(t.id) };
  });
}
