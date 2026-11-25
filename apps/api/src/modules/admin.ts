import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { REGISTERED_PROFESSIONS, decisionSchema } from '@motix/shared';
import { requireRole } from '../auth';
import { structures, subscriptions, trainers, users } from '../db/schema';
import { conflict, notFound, parse } from '../lib/errors';
import { newCode } from '../lib/tokens';
import { audit, track } from '../services/events';

const statusQuery = z.object({ status: z.enum(['pending', 'approved', 'rejected', 'suspended']).optional() });
const actionParams = z.object({ id: z.string().uuid(), action: z.enum(['approve', 'reject', 'suspend']) });

export async function adminRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { db } = ctx;

  app.get('/admin/overview', async (req) => {
    requireRole(req, 'admin');
    const byStatus = async (table: typeof structures | typeof trainers) => {
      const rows = await db.select({ status: table.status, n: count() }).from(table).groupBy(table.status);
      return Object.fromEntries(rows.map((r) => [r.status, r.n]));
    };
    const [u] = await db.select({ n: count() }).from(users).where(eq(users.role, 'user'));
    const subs = await db.select({ status: subscriptions.status, n: count() }).from(subscriptions).groupBy(subscriptions.status);
    return {
      structures: await byStatus(structures),
      trainers: await byStatus(trainers),
      users: u?.n ?? 0,
      subscriptions: Object.fromEntries(subs.map((r) => [r.status, r.n])),
    };
  });

  /* ---------- Strutture ---------- */
  app.get('/admin/structures', async (req) => {
    requireRole(req, 'admin');
    const { status } = parse(statusQuery, req.query);
    const rows = await db
      .select({ s: structures, ownerFirstName: users.firstName, ownerLastName: users.lastName, ownerEmail: users.email })
      .from(structures)
      .innerJoin(users, eq(users.id, structures.ownerUserId))
      .where(status ? eq(structures.status, status) : undefined)
      .orderBy(desc(structures.createdAt));
    return {
      structures: rows.map(({ s, ...owner }) => ({
        id: s.id,
        legalName: s.legalName,
        displayName: s.displayName,
        type: s.type,
        vatNumber: s.vatNumber,
        city: s.city,
        province: s.province,
        phone: s.phone,
        membersEstimate: s.membersEstimate,
        status: s.status,
        statusReason: s.statusReason,
        code: s.code,
        pilot: s.pilot,
        createdAt: s.createdAt,
        owner: { firstName: owner.ownerFirstName, lastName: owner.ownerLastName, email: owner.ownerEmail },
      })),
    };
  });

  app.post('/admin/structures/:id/:action', async (req) => {
    const auth = requireRole(req, 'admin');
    const { id, action } = parse(actionParams, req.params);
    const { reason } = parse(decisionSchema, req.body);
    const [row] = await db
      .select({ s: structures, owner: users })
      .from(structures)
      .innerJoin(users, eq(users.id, structures.ownerUserId))
      .where(eq(structures.id, id))
      .limit(1);
    if (!row) throw notFound('Struttura non trovata');
    const { s, owner } = row;
    const now = ctx.now();
    if (action === 'approve') {
      if (s.status === 'approved') throw conflict('already_approved', 'Struttura già approvata');
      let code = s.code;
      while (!code) {
        const candidate = newCode('MX');
        const [hit] = await db.select({ id: structures.id }).from(structures).where(eq(structures.code, candidate)).limit(1);
        if (!hit) code = candidate;
      }
      await db
        .update(structures)
        .set({ status: 'approved', statusReason: null, code, affiliatedAt: s.affiliatedAt ?? now, updatedAt: now })
        .where(eq(structures.id, id));
      await track(db, 'struttura_approvata', { structureId: id, userId: owner.id });
      await ctx.mailer.send({
        to: owner.email,
        kind: 'structure_approved',
        subject: `${s.displayName} è affiliata a MOTIX`,
        text:
          `Ciao ${owner.firstName},\nl'affiliazione di ${s.displayName} è stata approvata. Il codice per i tuoi iscritti è ${code}.\n` +
          `Nella dashboard trovi il QR e il kit di lancio:\n${ctx.config.publicWebUrl}/app`,
        link: `${ctx.config.publicWebUrl}/app`,
      });
    } else {
      const status = action === 'reject' ? 'rejected' : 'suspended';
      await db.update(structures).set({ status, statusReason: reason ?? null, updatedAt: now }).where(eq(structures.id, id));
      if (action === 'reject')
        await ctx.mailer.send({
          to: owner.email,
          kind: 'structure_rejected',
          subject: 'Richiesta di affiliazione a MOTIX',
          text: `Ciao ${owner.firstName},\nal momento non possiamo approvare l'affiliazione di ${s.displayName}.${reason ? `\nMotivo: ${reason}` : ''}\nPer chiarimenti rispondi a questa email.`,
        });
    }
    await audit(db, `structure.${action}`, { actorUserId: auth.userId, entity: 'structure', entityId: id, ip: req.ip }, { reason });
    const [updated] = await db.select().from(structures).where(eq(structures.id, id)).limit(1);
    return { id, status: updated!.status, code: updated!.code };
  });

  /* ---------- Personal trainer ---------- */
  app.get('/admin/trainers', async (req) => {
    requireRole(req, 'admin');
    const { status } = parse(statusQuery, req.query);
    const rows = await db
      .select({ t: trainers, u: users })
      .from(trainers)
      .innerJoin(users, eq(users.id, trainers.userId))
      .where(status ? eq(trainers.status, status) : undefined)
      .orderBy(desc(trainers.createdAt));
    return {
      trainers: rows.map(({ t, u }) => ({
        id: t.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        specializations: t.specializations,
        bio: t.bio,
        status: t.status,
        statusReason: t.statusReason,
        inviteCode: t.inviteCode,
        pointsBalance: t.pointsBalance,
        profession: t.profession,
        city: t.city,
        registerName: t.registerName,
        registerNumber: t.registerNumber,
        registerVerified: Boolean(t.registerVerifiedAt),
        registerRequired: REGISTERED_PROFESSIONS.includes(t.profession),
        createdAt: t.createdAt,
      })),
    };
  });

  app.post('/admin/trainers/:id/:action', async (req) => {
    const auth = requireRole(req, 'admin');
    const { id, action } = parse(actionParams, req.params);
    const { reason } = parse(decisionSchema, req.body);
    const [row] = await db
      .select({ t: trainers, u: users })
      .from(trainers)
      .innerJoin(users, eq(users.id, trainers.userId))
      .where(eq(trainers.id, id))
      .limit(1);
    if (!row) throw notFound('Personal trainer non trovato');
    const { t, u } = row;
    const now = ctx.now();
    if (action === 'approve') {
      if (t.status === 'approved') throw conflict('already_approved', 'Personal trainer già approvato');
      await db.update(trainers).set({ status: 'approved', statusReason: null, approvedAt: t.approvedAt ?? now }).where(eq(trainers.id, id));
      await ctx.mailer.send({
        to: u.email,
        kind: 'trainer_approved',
        subject: 'Il tuo profilo personal trainer MOTIX è attivo',
        text: `Ciao ${u.firstName},\nil tuo profilo è stato approvato. Invita i tuoi clienti con il codice ${t.inviteCode}:\n${ctx.config.publicWebUrl}/pt/${t.inviteCode}`,
        link: `${ctx.config.publicWebUrl}/pt/${t.inviteCode}`,
      });
    } else {
      const status = action === 'reject' ? 'rejected' : 'suspended';
      await db.update(trainers).set({ status, statusReason: reason ?? null }).where(eq(trainers.id, id));
      if (action === 'reject')
        await ctx.mailer.send({
          to: u.email,
          kind: 'trainer_rejected',
          subject: 'Richiesta di profilo personal trainer MOTIX',
          text: `Ciao ${u.firstName},\nal momento non possiamo approvare il tuo profilo.${reason ? `\nMotivo: ${reason}` : ''}\nPer chiarimenti rispondi a questa email.`,
        });
    }
    await audit(db, `trainer.${action}`, { actorUserId: auth.userId, entity: 'trainer', entityId: id, ip: req.ip }, { reason });
    const [updated] = await db.select().from(trainers).where(eq(trainers.id, id)).limit(1);
    return { id, status: updated!.status };
  });

  /** Verifica dell'iscrizione all'albo (nutrizionisti e fisioterapisti), fatta da BTECH sul sito dell'ordine. */
  app.put('/admin/trainers/:id/register', async (req) => {
    const auth = requireRole(req, 'admin');
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { verified } = parse(z.object({ verified: z.boolean() }), req.body);
    const [t] = await db.select().from(trainers).where(eq(trainers.id, id)).limit(1);
    if (!t) throw notFound('Professionista non trovato');
    if (verified && (!t.registerName || !t.registerNumber))
      throw conflict('register_missing', 'Il professionista non ha indicato albo e numero di iscrizione');
    await db.update(trainers).set({ registerVerifiedAt: verified ? ctx.now() : null }).where(eq(trainers.id, id));
    await audit(db, verified ? 'trainer.register_verified' : 'trainer.register_unverified', { actorUserId: auth.userId, entity: 'trainer', entityId: id, ip: req.ip });
    return { id, registerVerified: verified };
  });

  /* ---------- Utenti e assistenza ---------- */
  app.get('/admin/users', async (req) => {
    const auth = requireRole(req, 'admin');
    const { q } = parse(z.object({ q: z.string().trim().min(2).max(80) }), req.query);
    const like = `%${q.replace(/[%_]/g, '')}%`;
    const rows = await db
      .select()
      .from(users)
      .where(or(ilike(users.email, like), ilike(users.firstName, like), ilike(users.lastName, like)))
      .orderBy(desc(users.createdAt))
      .limit(50);
    await audit(db, 'admin.user_search', { actorUserId: auth.userId, ip: req.ip }, { q });
    return {
      users: rows.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        status: u.status,
        structureId: u.structureId,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
      })),
    };
  });

  app.post('/admin/users/:id/:action', async (req) => {
    const auth = requireRole(req, 'admin');
    const { id, action } = parse(z.object({ id: z.string().uuid(), action: z.enum(['suspend', 'reactivate']) }), req.params);
    const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!u) throw notFound('Utente non trovato');
    if (u.role === 'admin') throw conflict('admin_account', 'Non puoi sospendere un amministratore');
    if (action === 'reactivate' && u.status !== 'suspended') throw conflict('invalid_state', 'L’utente non è sospeso');
    await db
      .update(users)
      .set({ status: action === 'suspend' ? 'suspended' : 'active', updatedAt: ctx.now() })
      .where(and(eq(users.id, id)));
    await audit(db, `user.${action}`, { actorUserId: auth.userId, entity: 'user', entityId: id, ip: req.ip });
    return { id, status: action === 'suspend' ? 'suspended' : 'active' };
  });
}
