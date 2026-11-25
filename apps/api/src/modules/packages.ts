/**
 * Pacchetti facoltativi per le palestre: abbonamenti annuali comprati in blocco a prezzo scontato
 * da regalare agli iscritti. Per la palestra MOTIX resta gratuito: il pacchetto è solo una possibilità in più.
 * Il pagamento oggi è fuori dall'app (bonifico o fattura): BTECH lo conferma dal pannello e i posti diventano disponibili.
 */
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DEFAULT_PACKAGE_RULES, PRICE_YEARLY_EUR, packageRequestSchema, packageRulesSchema, seatAssignSchema, type StructurePackagesResponse } from '@motix/shared';
import { requireRole } from '../auth';
import type { AppCtx } from '../context';
import type { Db } from '../db/client';
import { settings, structurePackages, structureSeats, structures, subscriptions, users } from '../db/schema';
import { badRequest, conflict, notFound, parse } from '../lib/errors';
import { audit, track } from '../services/events';
import { activateSubscription } from '../services/points';
import { structureScope } from '../services/scope';
import { currentSubscription } from '../services/subscription';

type PackageRules = { minSeats: number; unitPriceEur: number };

export async function getPackageRules(db: Db): Promise<PackageRules> {
  const [row] = await db.select().from(settings).where(eq(settings.key, 'packages')).limit(1);
  return { ...DEFAULT_PACKAGE_RULES, ...((row?.value ?? {}) as Partial<PackageRules>) };
}

const money = (n: number) => Math.round(n * 100) / 100;

async function packagesOf(ctx: AppCtx, structureId: string): Promise<StructurePackagesResponse> {
  const { db } = ctx;
  const rules = await getPackageRules(db);
  const pkgs = await db.select().from(structurePackages).where(eq(structurePackages.structureId, structureId)).orderBy(desc(structurePackages.createdAt));
  const seats = pkgs.length
    ? await db
        .select({ s: structureSeats, firstName: users.firstName, lastName: users.lastName, endsAt: subscriptions.commitmentEndsAt })
        .from(structureSeats)
        .leftJoin(users, eq(users.id, structureSeats.userId))
        .leftJoin(subscriptions, eq(subscriptions.id, structureSeats.subscriptionId))
        .where(inArray(structureSeats.packageId, pkgs.map((p) => p.id)))
        .orderBy(asc(structureSeats.assignedAt))
    : [];
  return {
    rules: { ...rules, listPriceEur: PRICE_YEARLY_EUR },
    packages: pkgs.map((p) => ({
      id: p.id,
      seats: p.seats,
      unitPriceEur: Number(p.unitPriceEur),
      totalEur: money(p.seats * Number(p.unitPriceEur)),
      status: p.status,
      createdAt: p.createdAt.toISOString(),
      paidAt: p.paidAt?.toISOString() ?? null,
      used: seats.filter((x) => x.s.packageId === p.id && x.s.userId).length,
    })),
    seatsAvailable: seats.filter((x) => !x.s.assignedAt).length,
    seats: seats
      .filter((x) => x.s.assignedAt)
      .map((x) => ({
        id: x.s.id,
        user: x.s.userId ? { id: x.s.userId, name: `${x.firstName} ${x.lastName}` } : null,
        assignedAt: x.s.assignedAt?.toISOString() ?? null,
        endsAt: x.endsAt?.toISOString() ?? null,
      })),
  };
}

export async function packageRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { db } = ctx;
  const owner = (req: Parameters<typeof structureScope>[1]) => structureScope(ctx, req, { ownerOnly: true });

  /* ---------- Palestra ---------- */

  app.get('/structure/packages', async (req) => packagesOf(ctx, (await owner(req)).structure.id));

  app.post('/structure/packages', async (req, reply) => {
    const { auth, structure } = await owner(req);
    const { seats } = parse(packageRequestSchema, req.body);
    const rules = await getPackageRules(db);
    if (seats < rules.minSeats) throw badRequest('seats_too_few', `Il pacchetto parte da ${rules.minSeats} abbonamenti`, { seats: `Minimo ${rules.minSeats}` });
    const [open] = await db
      .select({ id: structurePackages.id })
      .from(structurePackages)
      .where(and(eq(structurePackages.structureId, structure.id), eq(structurePackages.status, 'requested')))
      .limit(1);
    if (open) throw conflict('package_pending', 'C’è già una richiesta in attesa di pagamento');
    await db.insert(structurePackages).values({ structureId: structure.id, seats, unitPriceEur: String(rules.unitPriceEur), requestedBy: auth.userId });
    await track(db, 'pacchetto_richiesto', { structureId: structure.id }, { seats });
    return reply.code(201).send(await packagesOf(ctx, structure.id));
  });

  /** La palestra regala un abbonamento annuale a un suo iscritto, usando un posto del pacchetto pagato. */
  app.post('/structure/packages/assign', async (req) => {
    const { auth, structure } = await owner(req);
    const { userId } = parse(seatAssignSchema, req.body);
    const [member] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.structureId, structure.id), eq(users.role, 'user')))
      .limit(1);
    if (!member) throw notFound('Iscritto non trovato');
    const sub = await currentSubscription(ctx, userId);
    if (sub?.status === 'active') throw conflict('already_active', 'Questo iscritto ha già un abbonamento attivo');
    const [seat] = await db
      .select({ s: structureSeats, price: structurePackages.unitPriceEur })
      .from(structureSeats)
      .innerJoin(structurePackages, eq(structurePackages.id, structureSeats.packageId))
      .where(and(eq(structurePackages.structureId, structure.id), eq(structurePackages.status, 'paid'), isNull(structureSeats.assignedAt)))
      .orderBy(asc(structurePackages.paidAt))
      .limit(1);
    if (!seat) throw conflict('no_seats', 'Non ci sono abbonamenti disponibili: richiedi un nuovo pacchetto');
    // Il posto si prenota prima di attivare, così due richieste insieme non usano lo stesso posto.
    const claimed = await db
      .update(structureSeats)
      .set({ userId, assignedAt: ctx.now() })
      .where(and(eq(structureSeats.id, seat.s.id), isNull(structureSeats.assignedAt)))
      .returning({ id: structureSeats.id });
    if (!claimed.length) throw conflict('seat_taken', 'Riprova: il posto è stato appena usato');
    try {
      await activateSubscription(ctx, userId, 'subscription', { channel: 'structure', transactionId: seat.s.id, priceEur: Number(seat.price) });
    } catch (e) {
      await db.update(structureSeats).set({ userId: null, assignedAt: null }).where(eq(structureSeats.id, seat.s.id));
      throw e;
    }
    const [now] = await db.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.userId, userId)).orderBy(desc(subscriptions.createdAt)).limit(1);
    await db.update(structureSeats).set({ subscriptionId: now?.id ?? null }).where(eq(structureSeats.id, seat.s.id));
    await audit(db, 'package.seat_assigned', { actorUserId: auth.userId, entity: 'user', entityId: userId, ip: req.ip }, { seatId: seat.s.id });
    return packagesOf(ctx, structure.id);
  });

  /* ---------- BTECH ---------- */

  app.get('/admin/packages', async (req) => {
    requireRole(req, 'admin');
    const rows = await db
      .select({ p: structurePackages, name: structures.displayName, city: structures.city })
      .from(structurePackages)
      .innerJoin(structures, eq(structures.id, structurePackages.structureId))
      .orderBy(desc(structurePackages.createdAt))
      .limit(300);
    return {
      rules: await getPackageRules(db),
      packages: rows.map(({ p, name, city }) => ({
        id: p.id,
        structure: name,
        city,
        seats: p.seats,
        unitPriceEur: Number(p.unitPriceEur),
        totalEur: money(p.seats * Number(p.unitPriceEur)),
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        paidAt: p.paidAt?.toISOString() ?? null,
      })),
    };
  });

  app.put('/admin/packages/rules', async (req) => {
    const auth = requireRole(req, 'admin');
    const rules = parse(packageRulesSchema, req.body);
    await db.insert(settings).values({ key: 'packages', value: rules }).onConflictDoUpdate({ target: settings.key, set: { value: rules, updatedAt: ctx.now() } });
    await audit(db, 'packages.rules_updated', { actorUserId: auth.userId, ip: req.ip }, rules);
    return { rules };
  });

  /** Pagamento ricevuto: i posti del pacchetto diventano disponibili. Oppure annullamento della richiesta. */
  app.post('/admin/packages/:id/:action', async (req) => {
    const auth = requireRole(req, 'admin');
    const { id, action } = parse(z.object({ id: z.string().uuid(), action: z.enum(['confirm', 'cancel']) }), req.params);
    const [p] = await db.select().from(structurePackages).where(eq(structurePackages.id, id)).limit(1);
    if (!p) throw notFound('Pacchetto non trovato');
    if (p.status !== 'requested') throw conflict('invalid_state', 'Il pacchetto non è in attesa');
    if (action === 'confirm') {
      await db.transaction(async (tx) => {
        await tx.update(structurePackages).set({ status: 'paid', paidAt: ctx.now(), confirmedBy: auth.userId }).where(eq(structurePackages.id, id));
        await tx.insert(structureSeats).values(Array.from({ length: p.seats }, () => ({ packageId: id })));
      });
      await track(db, 'pacchetto_pagato', { structureId: p.structureId }, { seats: p.seats, totalEur: money(p.seats * Number(p.unitPriceEur)) });
    } else {
      await db.update(structurePackages).set({ status: 'cancelled' }).where(eq(structurePackages.id, id));
    }
    await audit(db, `package.${action}`, { actorUserId: auth.userId, entity: 'structure_package', entityId: id, ip: req.ip });
    return { id, status: action === 'confirm' ? 'paid' : 'cancelled' };
  });
}
