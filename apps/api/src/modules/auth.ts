import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  REQUIRED_CONSENTS,
  acceptStaffInviteSchema,
  ageBand,
  loginSchema,
  refreshSchema,
  registerStructureSchema,
  registerTrainerSchema,
  registerUserSchema,
  type AcquisitionChannel,
} from '@motix/shared';
import type { AppCtx } from '../context';
import {
  clientLinks,
  instructors,
  parentalConsents,
  referrals,
  refreshTokens,
  staffInvites,
  structures,
  trainerStructures,
  trainers,
  users,
} from '../db/schema';
import { AppError, badRequest, conflict, forbidden, notFound, parse, unauthorized } from '../lib/errors';
import { hashPassword, verifyPassword } from '../lib/password';
import { hashToken, newCode, newOpaqueToken } from '../lib/tokens';
import { audit, track } from '../services/events';
import {
  consumeEmailToken,
  createEmailToken,
  findUserByEmail,
  issueSession,
  sendVerifyEmail,
  setConsents,
  startTrial,
  uniqueReferralCode,
} from '../services/users';

const PARENTAL_TTL_DAYS = 14;
const DAY_MS = 86_400_000;

async function approvedStructureByCode(ctx: AppCtx, code: string) {
  const [s] = await ctx.db
    .select()
    .from(structures)
    .where(and(eq(structures.code, code), eq(structures.status, 'approved')))
    .limit(1);
  return s ?? null;
}

async function approvedTrainerByCode(ctx: AppCtx, code: string) {
  const [t] = await ctx.db
    .select()
    .from(trainers)
    .where(and(eq(trainers.inviteCode, code), eq(trainers.status, 'approved')))
    .limit(1);
  return t ?? null;
}

async function uniqueTrainerCode(ctx: AppCtx) {
  for (;;) {
    const code = newCode('PT');
    const [hit] = await ctx.db.select({ id: trainers.id }).from(trainers).where(eq(trainers.inviteCode, code)).limit(1);
    if (!hit) return code;
  }
}

async function sendParentalConsentEmail(
  ctx: AppCtx,
  child: { id: string; firstName: string; lastName: string },
  parent: { name: string; email: string },
) {
  const { token, hash } = newOpaqueToken();
  const expiresAt = new Date(ctx.now().getTime() + PARENTAL_TTL_DAYS * DAY_MS);
  await ctx.db
    .insert(parentalConsents)
    .values({ userId: child.id, parentName: parent.name, parentEmail: parent.email, tokenHash: hash, expiresAt })
    .onConflictDoUpdate({
      target: parentalConsents.userId,
      set: { tokenHash: hash, expiresAt, status: 'pending', requestedAt: ctx.now(), parentName: parent.name, parentEmail: parent.email },
    });
  const link = `${ctx.config.publicWebUrl}/consenso-genitore?token=${token}`;
  await ctx.mailer.send({
    to: parent.email,
    kind: 'parental_consent',
    subject: `${child.firstName} chiede il tuo consenso per usare MOTIX`,
    text:
      `Gentile ${parent.name},\n${child.firstName} ${child.lastName} si è iscritto a MOTIX, l'app di allenamento e benessere di BTECH S.r.l., ` +
      `e ha indicato lei come genitore. Tra i 14 e i 17 anni serve il consenso di un genitore.\n\n` +
      `Per leggere le condizioni e dare o negare il consenso apra questo link:\n${link}\n\n` +
      `Il link vale ${PARENTAL_TTL_DAYS} giorni. Senza il suo consenso l'account resta bloccato.`,
    link,
  });
}

export async function authRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { db } = ctx;
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  /* ---------- Registrazione di chi si allena ---------- */
  app.post('/auth/register', strict, async (req, reply) => {
    const input = parse(registerUserSchema, req.body);
    const now = ctx.now();

    const band = ageBand(input.birthDate, now);
    if (band === 'too_young')
      throw badRequest('age_too_young', 'Per usare MOTIX devi avere almeno 14 anni', { birthDate: 'Età minima 14 anni' });
    if (band === 'minor' && !input.parent)
      throw badRequest('parent_required', 'Tra 14 e 17 anni serve il consenso di un genitore', {
        parent: 'Indica nome ed email di un genitore',
      });
    if (band === 'minor' && input.parent!.email === input.email)
      throw badRequest('parent_email_same', "L'email del genitore deve essere diversa dalla tua", {
        'parent.email': "Usa l'email di un genitore",
      });
    for (const type of REQUIRED_CONSENTS)
      if (!input.consents[type])
        throw badRequest('consent_required', 'Per creare l’account servono i consensi obbligatori', {
          [`consents.${type}`]: 'Consenso obbligatorio',
        });

    if (await findUserByEmail(db, input.email)) throw conflict('email_taken', 'Esiste già un account con questa email');

    const structure = input.structureCode ? await approvedStructureByCode(ctx, input.structureCode) : null;
    if (input.structureCode && !structure)
      throw badRequest('structure_code_invalid', 'Codice della struttura non valido', { structureCode: 'Codice non valido' });

    const trainer = input.trainerCode ? await approvedTrainerByCode(ctx, input.trainerCode) : null;
    if (input.trainerCode && !trainer)
      throw badRequest('trainer_code_invalid', 'Codice del personal trainer non valido', { trainerCode: 'Codice non valido' });

    let referrer: { id: string } | null = null;
    if (input.referralCode) {
      const [r] = await db.select({ id: users.id }).from(users).where(eq(users.referralCode, input.referralCode)).limit(1);
      if (!r) throw badRequest('referral_code_invalid', 'Codice amico non valido', { referralCode: 'Codice non valido' });
      referrer = r;
    }

    const channel: AcquisitionChannel = structure ? 'structure' : trainer ? 'trainer' : input.channel === 'ads' ? 'ads' : 'organic';
    const passwordHash = await hashPassword(input.password);
    const referralCode = await uniqueReferralCode(db);
    const minor = band === 'minor';

    const user = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          birthDate: input.birthDate,
          role: 'user',
          status: minor ? 'pending_parental_consent' : 'active',
          structureId: structure?.id,
          structureJoinedAt: structure ? now : null,
          acquisitionChannel: channel,
          acquisitionCampaign: input.campaign,
          referralCode,
        })
        .returning();
      if (!u) throw new Error('insert user failed');
      await setConsents(tx, u.id, input.consents, now);
      if (trainer)
        // Il codice è l'invito del personal trainer: inserirlo equivale ad accettarlo.
        await tx.insert(clientLinks).values({
          userId: u.id,
          trainerId: trainer.id,
          status: 'active',
          dataConsent: input.consents.share_trainer,
          startedAt: now,
        });
      if (referrer) await tx.insert(referrals).values({ referrerUserId: referrer.id, referredUserId: u.id });
      await track(tx, 'registrazione', { userId: u.id, structureId: structure?.id, trainerId: trainer?.id, channel });
      if (structure) await track(tx, 'registrazione_con_codice', { userId: u.id, structureId: structure.id, channel });
      if (trainer) await track(tx, 'cliente_collegato', { userId: u.id, trainerId: trainer.id, channel });
      if (!minor) await startTrial(tx, u.id, now);
      return u;
    });

    await audit(db, 'user.registered', { actorUserId: user.id, entity: 'user', entityId: user.id, ip: req.ip }, { channel, minor });

    if (minor) {
      await sendParentalConsentEmail(ctx, user, input.parent!);
      return reply.code(201).send({
        pendingParentalConsent: true,
        message: `Abbiamo scritto a ${input.parent!.email}: l'account si attiva appena il genitore dà il consenso.`,
      });
    }
    await sendVerifyEmail(ctx, user);
    return reply.code(201).send(await issueSession(ctx, user, req.headers['user-agent']));
  });

  /* ---------- Consenso del genitore ---------- */
  const loadParental = async (token: string) => {
    const [row] = await db
      .select({ pc: parentalConsents, u: users })
      .from(parentalConsents)
      .innerJoin(users, eq(users.id, parentalConsents.userId))
      .where(eq(parentalConsents.tokenHash, hashToken(token)))
      .limit(1);
    if (!row) throw notFound('Link non valido');
    if (row.pc.status !== 'pending') throw conflict('already_decided', 'Questa richiesta è già stata gestita');
    if (row.pc.expiresAt < ctx.now()) throw new AppError(410, 'expired', 'Il link è scaduto: chiedi un nuovo invio dall’app');
    return row;
  };

  app.get('/auth/parental-consent/:token', async (req) => {
    const { token } = req.params as { token: string };
    const { pc, u } = await loadParental(token);
    return { childFirstName: u.firstName, childLastName: u.lastName, parentName: pc.parentName, birthDate: u.birthDate };
  });

  app.post('/auth/parental-consent/:token', strict, async (req) => {
    const { token } = req.params as { token: string };
    const { decision } = parse(z.object({ decision: z.enum(['confirm', 'reject']) }), req.body);
    const { pc, u } = await loadParental(token);
    const now = ctx.now();
    if (decision === 'reject') {
      // Senza consenso i dati del minore vengono cancellati.
      await db.delete(users).where(eq(users.id, u.id));
      await audit(db, 'parental_consent.rejected', { entity: 'user', entityId: u.id, ip: req.ip });
      return { status: 'rejected' };
    }
    await db.transaction(async (tx) => {
      await tx
        .update(parentalConsents)
        .set({ status: 'confirmed', decidedAt: now, decidedIp: req.ip })
        .where(eq(parentalConsents.id, pc.id));
      await tx.update(users).set({ status: 'active', updatedAt: now }).where(eq(users.id, u.id));
      await startTrial(tx, u.id, now);
    });
    await audit(db, 'parental_consent.confirmed', { entity: 'user', entityId: u.id, ip: req.ip });
    return { status: 'confirmed' };
  });

  app.post('/auth/parental-consent/resend', strict, async (req) => {
    const input = parse(loginSchema, req.body);
    const u = await findUserByEmail(db, input.email);
    if (!(await verifyPassword(input.password, u?.passwordHash ?? null)) || !u) throw unauthorized('Email o password non corretti');
    if (u.status !== 'pending_parental_consent') throw conflict('not_pending', 'Il consenso non è in attesa');
    const [pc] = await db.select().from(parentalConsents).where(eq(parentalConsents.userId, u.id)).limit(1);
    if (!pc) throw notFound();
    await sendParentalConsentEmail(ctx, u, { name: pc.parentName, email: pc.parentEmail });
    return { ok: true };
  });

  /* ---------- Registrazione del personal trainer ---------- */
  app.post('/auth/register/trainer', strict, async (req, reply) => {
    const input = parse(registerTrainerSchema, req.body);
    const now = ctx.now();
    if (ageBand(input.birthDate, now) !== 'adult')
      throw badRequest('trainer_must_be_adult', 'Per registrarti come personal trainer devi essere maggiorenne', {
        birthDate: 'Devi avere almeno 18 anni',
      });
    if (await findUserByEmail(db, input.email)) throw conflict('email_taken', 'Esiste già un account con questa email');
    const structure = input.structureCode ? await approvedStructureByCode(ctx, input.structureCode) : null;
    if (input.structureCode && !structure)
      throw badRequest('structure_code_invalid', 'Codice della struttura non valido', { structureCode: 'Codice non valido' });

    const passwordHash = await hashPassword(input.password);
    const inviteCode = await uniqueTrainerCode(ctx);
    const user = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          birthDate: input.birthDate,
          role: 'personal_trainer',
          profileVisibility: 'public',
        })
        .returning();
      if (!u) throw new Error('insert user failed');
      await setConsents(tx, u.id, { terms: true }, now);
      const [t] = await tx
        .insert(trainers)
        .values({
          userId: u.id,
          specializations: input.specializations,
          bio: input.bio,
          inviteCode,
          profession: input.profession,
          city: input.city,
          registerName: input.registerName,
          registerNumber: input.registerNumber,
        })
        .returning();
      if (structure && t) {
        // Se la struttura aveva già invitato questa email, il collegamento è subito attivo.
        const [invite] = await tx
          .select()
          .from(staffInvites)
          .where(
            and(
              eq(staffInvites.structureId, structure.id),
              eq(staffInvites.email, input.email),
              eq(staffInvites.role, 'personal_trainer'),
              eq(staffInvites.status, 'pending'),
            ),
          )
          .limit(1);
        await tx
          .insert(trainerStructures)
          .values({ trainerId: t.id, structureId: structure.id, status: invite ? 'active' : 'requested_by_trainer' });
        if (invite) await tx.update(staffInvites).set({ status: 'accepted' }).where(eq(staffInvites.id, invite.id));
      }
      await track(tx, 'pt_registrato', { userId: u.id, trainerId: t?.id, structureId: structure?.id });
      return u;
    });
    await audit(db, 'trainer.registered', { actorUserId: user.id, entity: 'user', entityId: user.id, ip: req.ip });
    await sendVerifyEmail(ctx, user);
    return reply.code(201).send(await issueSession(ctx, user, req.headers['user-agent']));
  });

  /* ---------- Affiliazione di una struttura ---------- */
  app.post('/auth/register/structure', strict, async (req, reply) => {
    const input = parse(registerStructureSchema, req.body);
    const now = ctx.now();
    if (await findUserByEmail(db, input.owner.email)) throw conflict('email_taken', 'Esiste già un account con questa email');
    const passwordHash = await hashPassword(input.owner.password);
    const user = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({
          email: input.owner.email,
          passwordHash,
          firstName: input.owner.firstName,
          lastName: input.owner.lastName,
          role: 'owner',
        })
        .returning();
      if (!u) throw new Error('insert user failed');
      await setConsents(tx, u.id, { terms: true }, now);
      const [s] = await tx
        .insert(structures)
        .values({ ...input.structure, ownerUserId: u.id })
        .returning();
      await track(tx, 'struttura_registrata', { userId: u.id, structureId: s?.id });
      return u;
    });
    await audit(db, 'structure.registered', { actorUserId: user.id, entity: 'user', entityId: user.id, ip: req.ip });
    await sendVerifyEmail(ctx, user);
    return reply.code(201).send(await issueSession(ctx, user, req.headers['user-agent']));
  });

  /* ---------- Invito dello staff (istruttori) ---------- */
  const loadInvite = async (token: string) => {
    const [row] = await db
      .select({ i: staffInvites, s: structures })
      .from(staffInvites)
      .innerJoin(structures, eq(structures.id, staffInvites.structureId))
      .where(eq(staffInvites.tokenHash, hashToken(token)))
      .limit(1);
    if (!row || row.i.status !== 'pending') throw notFound('Invito non valido o già usato');
    if (row.i.expiresAt < ctx.now()) throw new AppError(410, 'expired', 'L’invito è scaduto: chiedine uno nuovo alla struttura');
    return row;
  };

  app.get('/auth/staff-invite/:token', async (req) => {
    const { token } = req.params as { token: string };
    const { i, s } = await loadInvite(token);
    return { email: i.email, role: i.role, structure: { displayName: s.displayName, city: s.city, code: s.code } };
  });

  app.post('/auth/staff-invite/accept', strict, async (req, reply) => {
    const input = parse(acceptStaffInviteSchema, req.body);
    const { i, s } = await loadInvite(input.token);
    if (i.role !== 'instructor')
      throw badRequest('wrong_invite', 'Questo invito è per un personal trainer: registrati dalla pagina dedicata');
    if (await findUserByEmail(db, i.email)) throw conflict('email_taken', 'Esiste già un account con questa email');
    const passwordHash = await hashPassword(input.password);
    const user = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({
          email: i.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          role: 'instructor',
          emailVerifiedAt: ctx.now(), // l'invito è arrivato a questa email
        })
        .returning();
      if (!u) throw new Error('insert user failed');
      await setConsents(tx, u.id, { terms: true }, ctx.now());
      await tx.insert(instructors).values({ userId: u.id, structureId: s.id });
      await tx.update(staffInvites).set({ status: 'accepted' }).where(eq(staffInvites.id, i.id));
      return u;
    });
    await audit(db, 'instructor.joined', { actorUserId: user.id, entity: 'structure', entityId: s.id, ip: req.ip });
    return reply.code(201).send(await issueSession(ctx, user, req.headers['user-agent']));
  });

  /* ---------- Accesso ---------- */
  app.post('/auth/login', strict, async (req) => {
    const input = parse(loginSchema, req.body);
    const u = await findUserByEmail(db, input.email);
    const ok = await verifyPassword(input.password, u?.passwordHash ?? null);
    if (!u || !ok) throw unauthorized('Email o password non corretti');
    if (u.status === 'pending_parental_consent')
      throw forbidden('L’account è in attesa del consenso di un genitore', 'parental_consent_pending');
    if (u.status !== 'active') throw forbidden('Account sospeso: contatta l’assistenza', 'account_suspended');
    return issueSession(ctx, u, req.headers['user-agent']);
  });

  app.post('/auth/refresh', async (req) => {
    const { refreshToken } = parse(refreshSchema, req.body);
    const [row] = await db
      .select({ rt: refreshTokens, u: users })
      .from(refreshTokens)
      .innerJoin(users, eq(users.id, refreshTokens.userId))
      .where(eq(refreshTokens.tokenHash, hashToken(refreshToken)))
      .limit(1);
    if (!row) throw unauthorized('Sessione scaduta: accedi di nuovo');
    if (row.rt.revokedAt) {
      // Un token già usato che ricompare indica un possibile furto: si chiudono tutte le sessioni.
      await db.update(refreshTokens).set({ revokedAt: ctx.now() }).where(and(eq(refreshTokens.userId, row.u.id), isNull(refreshTokens.revokedAt)));
      throw unauthorized('Sessione scaduta: accedi di nuovo');
    }
    if (row.rt.expiresAt < ctx.now() || row.u.status !== 'active') throw unauthorized('Sessione scaduta: accedi di nuovo');
    await db.update(refreshTokens).set({ revokedAt: ctx.now() }).where(eq(refreshTokens.id, row.rt.id));
    return issueSession(ctx, row.u, req.headers['user-agent']);
  });

  app.post('/auth/logout', async (req) => {
    const { refreshToken } = parse(refreshSchema, req.body);
    await db.update(refreshTokens).set({ revokedAt: ctx.now() }).where(eq(refreshTokens.tokenHash, hashToken(refreshToken)));
    return { ok: true };
  });

  /* ---------- Email e password ---------- */
  app.post('/auth/email/verify', async (req) => {
    const { token } = parse(z.object({ token: z.string().min(20) }), req.body);
    const userId = await consumeEmailToken(ctx, token, 'verify_email');
    if (!userId) throw badRequest('token_invalid', 'Link non valido o scaduto');
    await db.update(users).set({ emailVerifiedAt: ctx.now() }).where(eq(users.id, userId));
    return { ok: true };
  });

  app.post('/auth/password/forgot', strict, async (req) => {
    const { email } = parse(z.object({ email: z.string().trim().toLowerCase().email() }), req.body);
    const u = await findUserByEmail(db, email);
    if (u && u.status === 'active') {
      const token = await createEmailToken(ctx, u.id, 'reset_password', 2);
      const link = `${ctx.config.publicWebUrl}/nuova-password?token=${token}`;
      await ctx.mailer.send({
        to: u.email,
        kind: 'reset_password',
        subject: 'Imposta una nuova password MOTIX',
        text: `Ciao ${u.firstName},\nper scegliere una nuova password apri questo link entro 2 ore:\n${link}\n\nSe non l'hai chiesto tu, ignora questa email.`,
        link,
      });
    }
    // Stessa risposta in ogni caso, per non rivelare quali email sono registrate.
    return { ok: true };
  });

  app.post('/auth/password/reset', strict, async (req) => {
    const input = parse(z.object({ token: z.string().min(20), password: z.string().min(8).max(128) }), req.body);
    const userId = await consumeEmailToken(ctx, input.token, 'reset_password');
    if (!userId) throw badRequest('token_invalid', 'Link non valido o scaduto');
    await db.update(users).set({ passwordHash: await hashPassword(input.password), updatedAt: ctx.now() }).where(eq(users.id, userId));
    await db.update(refreshTokens).set({ revokedAt: ctx.now() }).where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
    await audit(db, 'password.reset', { actorUserId: userId, entity: 'user', entityId: userId, ip: req.ip });
    return { ok: true };
  });
}
