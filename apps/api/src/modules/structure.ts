import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import QRCode from 'qrcode';
import { z } from 'zod';
import { inviteStaffSchema } from '@motix/shared';
import { requireRole } from '../auth';
import {
  clientLinks,
  instructorAssignments,
  instructors,
  staffInvites,
  structures,
  subscriptions,
  trainerStructures,
  trainers,
  userConsents,
  users,
} from '../db/schema';
import { conflict, forbidden, notFound, parse } from '../lib/errors';
import { newOpaqueToken } from '../lib/tokens';
import { audit, track } from '../services/events';
import { structureScope, type ScopeOptions } from '../services/scope';
import { findUserByEmail } from '../services/users';

const INVITE_TTL_DAYS = 14;

export async function structureRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { db } = ctx;

  const scope = (req: FastifyRequest, opts: ScopeOptions = {}) => structureScope(ctx, req, opts);

  const joinLink = (code: string) => `${ctx.config.publicWebUrl}/j/${code}`;

  app.get('/structure', async (req) => {
    const { structure: s } = await scope(req, { mustBeApproved: false });
    return {
      id: s.id,
      legalName: s.legalName,
      displayName: s.displayName,
      type: s.type,
      city: s.city,
      province: s.province,
      address: s.address,
      phone: s.phone,
      status: s.status,
      statusReason: s.statusReason,
      code: s.code,
      joinLink: s.code ? joinLink(s.code) : null,
      affiliatedAt: s.affiliatedAt,
    };
  });

  /** QR da stampare su locandine e kit di lancio: apre il link di iscrizione con il codice della struttura. */
  app.get('/structure/qr', async (req) => {
    const { structure: s } = await scope(req);
    const link = joinLink(s.code!);
    return {
      code: s.code,
      link,
      svg: await QRCode.toString(link, { type: 'svg', margin: 1, color: { dark: '#0B1220', light: '#FFFFFF' } }),
    };
  });

  /* ---------- Staff: personal trainer e istruttori ---------- */
  const staff = async (structureId: string) => {
    const pts = await db
      .select({
        trainerId: trainers.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        specializations: trainers.specializations,
        status: trainerStructures.status,
      })
      .from(trainerStructures)
      .innerJoin(trainers, eq(trainers.id, trainerStructures.trainerId))
      .innerJoin(users, eq(users.id, trainers.userId))
      .where(
        and(
          eq(trainerStructures.structureId, structureId),
          inArray(trainerStructures.status, ['active', 'invited_by_structure', 'requested_by_trainer']),
        ),
      );
    const ins = await db
      .select({ instructorId: instructors.id, firstName: users.firstName, lastName: users.lastName, email: users.email, active: instructors.active })
      .from(instructors)
      .innerJoin(users, eq(users.id, instructors.userId))
      .where(eq(instructors.structureId, structureId));
    const invites = await db
      .select({ id: staffInvites.id, email: staffInvites.email, role: staffInvites.role, expiresAt: staffInvites.expiresAt })
      .from(staffInvites)
      .where(and(eq(staffInvites.structureId, structureId), eq(staffInvites.status, 'pending')));
    return { trainers: pts, instructors: ins, invites };
  };

  app.get('/structure/staff', async (req) => {
    const { structure: s } = await scope(req, { ownerOnly: true });
    return staff(s.id);
  });

  app.post('/structure/staff/invite', async (req, reply) => {
    const { auth, structure: s } = await scope(req, { ownerOnly: true });
    const input = parse(inviteStaffSchema, req.body);
    const existing = await findUserByEmail(db, input.email);

    if (input.role === 'personal_trainer' && existing?.role === 'personal_trainer') {
      // Personal trainer già registrato: riceve un invito da accettare nella sua area.
      const [t] = await db.select().from(trainers).where(eq(trainers.userId, existing.id)).limit(1);
      if (!t) throw notFound('Personal trainer non trovato');
      const [link] = await db
        .select()
        .from(trainerStructures)
        .where(and(eq(trainerStructures.trainerId, t.id), eq(trainerStructures.structureId, s.id)))
        .limit(1);
      if (link?.status === 'active') throw conflict('already_linked', 'Questo personal trainer è già collegato alla struttura');
      const status = link?.status === 'requested_by_trainer' ? 'active' : 'invited_by_structure';
      await db
        .insert(trainerStructures)
        .values({ trainerId: t.id, structureId: s.id, status })
        .onConflictDoUpdate({
          target: [trainerStructures.trainerId, trainerStructures.structureId],
          set: { status, updatedAt: ctx.now() },
        });
      if (status === 'active') await track(db, 'pt_collegato_struttura', { trainerId: t.id, structureId: s.id });
      await ctx.mailer.send({
        to: input.email,
        kind: 'trainer_structure_invite',
        subject: `${s.displayName} ti invita a collaborare su MOTIX`,
        text: `${s.displayName} ti ha aggiunto come personal trainer su MOTIX. Apri la tua area personal trainer per accettare l'invito.`,
        link: `${ctx.config.publicWebUrl}/app`,
      });
      return reply.code(201).send(await staff(s.id));
    }

    if (existing) throw conflict('email_taken', 'Questa email è già registrata su MOTIX con un altro ruolo');

    const { token, hash } = newOpaqueToken();
    await db
      .update(staffInvites)
      .set({ status: 'cancelled' })
      .where(and(eq(staffInvites.structureId, s.id), eq(staffInvites.email, input.email), eq(staffInvites.status, 'pending')));
    await db.insert(staffInvites).values({
      structureId: s.id,
      email: input.email,
      role: input.role,
      tokenHash: hash,
      invitedBy: auth.userId,
      expiresAt: new Date(ctx.now().getTime() + INVITE_TTL_DAYS * 86_400_000),
    });
    const link =
      input.role === 'instructor'
        ? `${ctx.config.publicWebUrl}/invito-staff?token=${token}`
        : `${ctx.config.publicWebUrl}/pt/registrazione?struttura=${s.code}`;
    await ctx.mailer.send({
      to: input.email,
      kind: 'staff_invite',
      subject: `${s.displayName} ti invita su MOTIX`,
      text:
        input.role === 'instructor'
          ? `${s.displayName} ti ha invitato come istruttore su MOTIX. Crea il tuo accesso da questo link (vale ${INVITE_TTL_DAYS} giorni):\n${link}`
          : `${s.displayName} ti ha invitato come personal trainer su MOTIX. Registrati gratis da questo link:\n${link}`,
      link,
    });
    await audit(db, 'staff.invited', { actorUserId: auth.userId, entity: 'structure', entityId: s.id, ip: req.ip }, { role: input.role });
    return reply.code(201).send(await staff(s.id));
  });

  app.post('/structure/trainers/:trainerId/:action', async (req) => {
    const { structure: s } = await scope(req, { ownerOnly: true });
    const { trainerId, action } = parse(
      z.object({ trainerId: z.string().uuid(), action: z.enum(['accept', 'remove']) }),
      req.params,
    );
    const where = and(eq(trainerStructures.trainerId, trainerId), eq(trainerStructures.structureId, s.id));
    const [row] = await db.select().from(trainerStructures).where(where).limit(1);
    if (!row || row.status === 'closed') throw notFound('Personal trainer non collegato alla struttura');
    if (action === 'accept') {
      if (row.status !== 'requested_by_trainer') throw conflict('invalid_state', 'Non c’è una richiesta da accettare');
      await db.update(trainerStructures).set({ status: 'active', updatedAt: ctx.now() }).where(where);
      await track(db, 'pt_collegato_struttura', { trainerId, structureId: s.id });
    } else {
      await db.update(trainerStructures).set({ status: 'closed', updatedAt: ctx.now() }).where(where);
    }
    return staff(s.id);
  });

  app.delete('/structure/invites/:id', async (req) => {
    const { structure: s } = await scope(req, { ownerOnly: true });
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    await db.update(staffInvites).set({ status: 'cancelled' }).where(and(eq(staffInvites.id, id), eq(staffInvites.structureId, s.id)));
    return staff(s.id);
  });

  app.delete('/structure/instructors/:id', async (req) => {
    const { structure: s } = await scope(req, { ownerOnly: true });
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const [i] = await db
      .select()
      .from(instructors)
      .where(and(eq(instructors.id, id), eq(instructors.structureId, s.id)))
      .limit(1);
    if (!i) throw notFound('Istruttore non trovato');
    await db.update(instructors).set({ active: false }).where(eq(instructors.id, id));
    await db.update(users).set({ status: 'suspended' }).where(eq(users.id, i.userId));
    return staff(s.id);
  });

  /** Assegna a un istruttore gli iscritti che deve seguire (sostituisce l'elenco precedente). */
  app.put('/structure/instructors/:id/members', async (req) => {
    const { structure: s } = await scope(req, { ownerOnly: true });
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { userIds } = parse(z.object({ userIds: z.array(z.string().uuid()).max(2000) }), req.body);
    const [i] = await db
      .select()
      .from(instructors)
      .where(and(eq(instructors.id, id), eq(instructors.structureId, s.id)))
      .limit(1);
    if (!i) throw notFound('Istruttore non trovato');
    const valid = userIds.length
      ? await db
          .select({ id: users.id })
          .from(users)
          .where(and(inArray(users.id, userIds), eq(users.structureId, s.id), eq(users.role, 'user')))
      : [];
    await db.transaction(async (tx) => {
      await tx.delete(instructorAssignments).where(eq(instructorAssignments.instructorId, id));
      if (valid.length) await tx.insert(instructorAssignments).values(valid.map((v) => ({ instructorId: id, userId: v.id })));
    });
    return { assigned: valid.length };
  });
}
