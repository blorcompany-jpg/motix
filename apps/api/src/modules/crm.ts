import { and, count, desc, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  campaignSchema,
  noteSchema,
  type Goal,
  type MemberRow,
  type RiskInfo,
  type StructureOverview,
  type StructureReportMonth,
} from '@motix/shared';
import {
  analyticsEvents,
  clientLinks,
  instructors,
  memberNotes,
  sportProfiles,
  subscriptions,
  trainerStructures,
  trainers,
  userConsents,
  users,
  workoutSessions,
} from '../db/schema';
import { addDays, toDay } from '../lib/days';
import { badRequest, forbidden, notFound, parse } from '../lib/errors';
import { audit, track } from '../services/events';
import { ensureConversation, postMessage } from '../services/messaging';
import { clientReport } from '../services/report';
import { riskFor } from '../services/risk';
import { assignedMemberIds, structureScope } from '../services/scope';

const memberParam = z.object({ id: z.string().uuid() });

/** Dashboard e CRM della struttura: iscritti, alert di abbandono, note, messaggi e report. */
export async function crmRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { db } = ctx;

  /** Iscritti visibili a chi chiama, con consenso, abbonamento, attività e rischio. */
  const loadMembers = async (req: FastifyRequest) => {
    const { auth, structure, instructorId } = await structureScope(ctx, req);
    const visible = await assignedMemberIds(ctx, instructorId);
    const people = (
      await db
        .select()
        .from(users)
        .where(and(eq(users.structureId, structure.id), eq(users.role, 'user'), eq(users.status, 'active')))
        .orderBy(desc(users.structureJoinedAt))
    ).filter((u) => !visible || visible.has(u.id));
    const ids = people.map((u) => u.id);
    const day = toDay(ctx.now());
    if (!ids.length) return { auth, structure, day, rows: [] as Array<MemberRow & { riskInternal: RiskInfo; active7d: boolean }> };

    const consents = await db.select().from(userConsents).where(and(inArray(userConsents.userId, ids), eq(userConsents.type, 'share_structure')));
    const subs = await db.select().from(subscriptions).where(inArray(subscriptions.userId, ids)).orderBy(desc(subscriptions.createdAt));
    const profiles = await db.select({ userId: sportProfiles.userId, goal: sportProfiles.goal }).from(sportProfiles).where(inArray(sportProfiles.userId, ids));
    const links = await db
      .select({ userId: clientLinks.userId, firstName: users.firstName, lastName: users.lastName })
      .from(clientLinks)
      .innerJoin(trainers, eq(trainers.id, clientLinks.trainerId))
      .innerJoin(users, eq(users.id, trainers.userId))
      .where(and(inArray(clientLinks.userId, ids), eq(clientLinks.status, 'active')));
    const sessions = await db
      .select({ userId: workoutSessions.userId, day: workoutSessions.scheduledDate })
      .from(workoutSessions)
      .where(and(inArray(workoutSessions.userId, ids), isNotNull(workoutSessions.completedAt), gte(workoutSessions.scheduledDate, addDays(day, -29))));
    const risks = await riskFor(db, ids, ctx.now());

    const rows = people.map((u) => {
      const shared = consents.find((c) => c.userId === u.id)?.granted ?? false;
      const mine = sessions.filter((s) => s.userId === u.id).map((s) => s.day).sort();
      const pt = links.find((l) => l.userId === u.id);
      const risk = risks.get(u.id)!;
      const active7d = mine.some((d) => d >= addDays(day, -6)) || Boolean(u.lastLoginAt && toDay(u.lastLoginAt) >= addDays(day, -6));
      // Senza consenso alla condivisione la struttura non vede dati personali né attività del singolo iscritto.
      const row: MemberRow = {
        id: u.id,
        sharesData: shared,
        firstName: shared ? u.firstName : null,
        lastName: shared ? u.lastName : null,
        email: shared ? u.email : null,
        joinedAt: u.structureJoinedAt?.toISOString() ?? null,
        lastLoginAt: shared ? (u.lastLoginAt?.toISOString() ?? null) : null,
        subscriptionStatus: subs.find((s) => s.userId === u.id)?.status ?? null,
        trainer: shared && pt ? `${pt.firstName} ${pt.lastName}` : null,
        goal: shared ? ((profiles.find((p) => p.userId === u.id)?.goal ?? null) as Goal | null) : null,
        sessions30d: shared ? mine.length : null,
        lastSessionDay: shared ? (mine.at(-1) ?? null) : null,
        risk: shared ? risk : null,
      };
      return { ...row, riskInternal: risk, active7d };
    });
    return { auth, structure, day, rows };
  };

  const publicRow = ({ riskInternal: _r, active7d: _a, ...row }: MemberRow & { riskInternal: RiskInfo; active7d: boolean }): MemberRow => row;

  app.get('/structure/overview', async (req): Promise<StructureOverview> => {
    const { structure, rows, day } = await loadMembers(req);
    const [pts] = await db
      .select({ n: count() })
      .from(trainerStructures)
      .where(and(eq(trainerStructures.structureId, structure.id), eq(trainerStructures.status, 'active')));
    const [ins] = await db.select({ n: count() }).from(instructors).where(and(eq(instructors.structureId, structure.id), eq(instructors.active, true)));
    const ids = rows.map((r) => r.id);
    const month = ids.length
      ? await db
          .select({ n: count() })
          .from(workoutSessions)
          .where(and(inArray(workoutSessions.userId, ids), isNotNull(workoutSessions.completedAt), gte(workoutSessions.scheduledDate, addDays(day, -27))))
      : [{ n: 0 }];
    // Dati aggregati: comprendono anche gli iscritti che non condividono i dati personali.
    return {
      members: rows.length,
      activeThisWeek: rows.filter((r) => r.active7d).length,
      inTrial: rows.filter((r) => r.subscriptionStatus === 'trial').length,
      subscribed: rows.filter((r) => r.subscriptionStatus === 'active').length,
      trainers: pts?.n ?? 0,
      instructors: ins?.n ?? 0,
      atRisk: rows.filter((r) => r.riskInternal.level !== 'low').length,
      avgSessionsPerWeek: rows.length ? Math.round(((month[0]?.n ?? 0) / 4 / rows.length) * 10) / 10 : 0,
    };
  });

  app.get('/structure/members', async (req) => ({ members: (await loadMembers(req)).rows.map(publicRow) }));

  /** Alert di abbandono: iscritti a rischio con motivo e azione suggerita. */
  app.get('/structure/alerts', async (req) => {
    const { rows } = await loadMembers(req);
    const risky = rows.filter((r) => r.riskInternal.level !== 'low');
    return {
      alerts: risky
        .filter((r) => r.sharesData)
        .sort((a, b) => b.riskInternal.score - a.riskInternal.score)
        .map(publicRow),
      // Gli iscritti a rischio che non condividono i dati compaiono solo come numero.
      anonymousAtRisk: risky.filter((r) => !r.sharesData).length,
    };
  });

  /** Iscritto della struttura che ha dato il consenso alla condivisione. */
  const sharedMember = async (req: FastifyRequest) => {
    const { id } = parse(memberParam, req.params);
    const { auth, structure, rows } = await loadMembers(req);
    const row = rows.find((r) => r.id === id);
    if (!row) throw notFound('Iscritto non trovato');
    if (!row.sharesData) throw forbidden('Questo iscritto non ha dato il consenso a condividere i suoi dati con la struttura', 'consent_required');
    return { auth, structure, row };
  };

  app.get('/structure/members/:id', async (req) => {
    const { auth, structure, row } = await sharedMember(req);
    const notes = await db
      .select({ id: memberNotes.id, text: memberNotes.text, createdAt: memberNotes.createdAt, firstName: users.firstName, lastName: users.lastName })
      .from(memberNotes)
      .innerJoin(users, eq(users.id, memberNotes.authorUserId))
      .where(and(eq(memberNotes.structureId, structure.id), eq(memberNotes.userId, row.id)))
      .orderBy(desc(memberNotes.createdAt));
    await audit(db, 'member.report_viewed', { actorUserId: auth.userId, entity: 'user', entityId: row.id, ip: req.ip });
    return {
      member: publicRow(row),
      report: await clientReport(ctx, row.id),
      notes: notes.map((n) => ({ id: n.id, text: n.text, at: n.createdAt.toISOString(), author: `${n.firstName} ${n.lastName}` })),
    };
  });

  app.post('/structure/members/:id/notes', async (req, reply) => {
    const { auth, structure, row } = await sharedMember(req);
    const { text } = parse(noteSchema, req.body);
    await db.insert(memberNotes).values({ structureId: structure.id, userId: row.id, authorUserId: auth.userId, text });
    return reply.code(201).send({ ok: true });
  });

  /** Messaggio a uno o più iscritti: a mano o per gruppo (campagna di riattivazione). */
  app.post('/structure/messages', async (req, reply) => {
    const input = parse(campaignSchema, req.body);
    const { auth, structure, rows } = await loadMembers(req);
    let targets = rows;
    if (input.userIds?.length) targets = rows.filter((r) => input.userIds!.includes(r.id));
    else if (input.segment === 'at_risk') targets = rows.filter((r) => r.riskInternal.level !== 'low');
    else if (input.segment === 'trial') targets = rows.filter((r) => r.subscriptionStatus === 'trial');
    else if (input.segment === 'inactive') targets = rows.filter((r) => !r.active7d);
    else if (input.segment !== 'all') throw badRequest('recipients_missing', 'Scegli a chi inviare il messaggio');
    for (const t of targets) {
      const conversationId = await ensureConversation(db, auth.userId, t.id);
      await postMessage(db, conversationId, auth.userId, input.text, ctx.now());
    }
    await track(db, 'campagna_inviata', { userId: auth.userId, structureId: structure.id }, { recipients: targets.length, segment: input.segment ?? 'manual' });
    return reply.code(201).send({ sent: targets.length });
  });

  /** Personal trainer della struttura con i clienti che seguono qui e la loro attività (dati aggregati). */
  app.get('/structure/trainers/activity', async (req) => {
    const { structure } = await structureScope(ctx, req, { ownerOnly: true });
    const day = toDay(ctx.now());
    const pts = await db
      .select({ trainerId: trainers.id, firstName: users.firstName, lastName: users.lastName })
      .from(trainerStructures)
      .innerJoin(trainers, eq(trainers.id, trainerStructures.trainerId))
      .innerJoin(users, eq(users.id, trainers.userId))
      .where(and(eq(trainerStructures.structureId, structure.id), eq(trainerStructures.status, 'active')));
    const out = [];
    for (const pt of pts) {
      const clients = await db
        .select({ id: users.id })
        .from(clientLinks)
        .innerJoin(users, eq(users.id, clientLinks.userId))
        .where(and(eq(clientLinks.trainerId, pt.trainerId), eq(clientLinks.status, 'active'), eq(users.structureId, structure.id)));
      const ids = clients.map((c) => c.id);
      const [done] = ids.length
        ? await db
            .select({ n: count() })
            .from(workoutSessions)
            .where(and(inArray(workoutSessions.userId, ids), isNotNull(workoutSessions.completedAt), gte(workoutSessions.scheduledDate, addDays(day, -29))))
        : [{ n: 0 }];
      const risks = await riskFor(db, ids, ctx.now());
      out.push({
        trainerId: pt.trainerId,
        name: `${pt.firstName} ${pt.lastName}`,
        clients: ids.length,
        sessions30d: done?.n ?? 0,
        clientsAtRisk: [...risks.values()].filter((r) => r.level !== 'low').length,
      });
    }
    return { trainers: out };
  });

  /* ---------- Report mensile ---------- */
  const monthlyReport = async (req: FastifyRequest): Promise<StructureReportMonth[]> => {
    const { structure } = await structureScope(ctx, req, { ownerOnly: true });
    const { months } = parse(z.object({ months: z.coerce.number().int().min(1).max(24).default(6) }), req.query);
    const now = ctx.now();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
    const from = toDay(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1)));
    const members = await db.select({ id: users.id, joinedAt: users.structureJoinedAt }).from(users).where(and(eq(users.structureId, structure.id), eq(users.role, 'user')));
    const ids = members.map((m) => m.id);
    const sessions = ids.length
      ? await db
          .select({ userId: workoutSessions.userId, day: workoutSessions.scheduledDate })
          .from(workoutSessions)
          .where(and(inArray(workoutSessions.userId, ids), isNotNull(workoutSessions.completedAt), gte(workoutSessions.scheduledDate, from)))
      : [];
    const trials = await db
      .select({ at: analyticsEvents.occurredAt })
      .from(analyticsEvents)
      .where(and(eq(analyticsEvents.type, 'prova_iniziata'), eq(analyticsEvents.structureId, structure.id)));
    const activeIn = (month: string) => new Set(sessions.filter((s) => s.day.startsWith(month)).map((s) => s.userId));
    const out: StructureReportMonth[] = [];
    for (let i = 0; i < months; i++) {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
      const month = toDay(d).slice(0, 7);
      const prev = toDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))).slice(0, 7);
      const active = activeIn(month);
      const before = activeIn(prev);
      out.push({
        month,
        newMembers: members.filter((m) => m.joinedAt && toDay(m.joinedAt).startsWith(month)).length,
        activeMembers: active.size,
        sessions: sessions.filter((s) => s.day.startsWith(month)).length,
        trialsStarted: trials.filter((t) => toDay(t.at).startsWith(month)).length,
        retentionPct: before.size ? Math.round(([...before].filter((id) => active.has(id)).length / before.size) * 100) : null,
      });
    }
    return out;
  };

  app.get('/structure/report', async (req) => ({ months: await monthlyReport(req) }));

  app.get('/structure/report.csv', async (req, reply) => {
    const rows = await monthlyReport(req);
    const lines = [
      'Mese;Nuovi iscritti;Iscritti attivi;Sedute completate;Prove iniziate;Retention %',
      ...rows.map((r) => [r.month, r.newMembers, r.activeMembers, r.sessions, r.trialsStarted, r.retentionPct ?? ''].join(';')),
    ];
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', 'attachment; filename="motix-report.csv"')
      // Il BOM fa aprire correttamente il file in Excel.
      .send(`﻿${lines.join('\r\n')}\r\n`);
  });
}
