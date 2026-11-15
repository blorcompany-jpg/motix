import { and, count, desc, eq, gte, ilike, inArray, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  adminSensorPatchSchema,
  adminSensorsSchema,
  pairSensorSchema,
  sensorIssueSchema,
  SENSOR_STATUSES,
  type AdminSensor,
  type SensorIssueView,
  type SensorsResponse,
  type SensorView,
  type StructureSensor,
} from '@motix/shared';
import { requireRole } from '../auth';
import { sensorIssues, sensorReadings, sensors, structures, users } from '../db/schema';
import { conflict, forbidden, notFound, parse } from '../lib/errors';
import { audit, track } from '../services/events';
import { structureScope } from '../services/scope';
import { usableSensors } from '../services/sensors';
import { hasPremium } from '../services/subscription';

const idParam = z.object({ id: z.string().uuid() });
const iso = (d: Date | null) => d?.toISOString() ?? null;

/** Sensore motix pod: abbinamento nell'app, sensori della struttura, registro BTECH. */
export async function sensorRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { db } = ctx;

  const view = (s: typeof sensors.$inferSelect): SensorView => ({
    id: s.id,
    serial: s.serial,
    firmware: s.firmware,
    owner: s.ownerType === 'user' ? 'mine' : 'structure',
    batteryPct: s.batteryPct,
    lastSeenAt: iso(s.lastSeenAt),
  });

  /* ---------- Utente ---------- */

  const mySensors = async (userId: string): Promise<SensorsResponse> => ({
    premium: await hasPremium(ctx, userId),
    sensors: (await usableSensors(db, userId)).map(view).sort((a, b) => a.owner.localeCompare(b.owner) || a.serial.localeCompare(b.serial)),
  });

  app.get('/me/sensors', async (req) => mySensors(requireRole(req, 'user').userId));

  /**
   * Abbina un sensore all'account. Il numero di serie arriva dal sensore via Bluetooth (o è scritto sul dispositivo).
   * Un sensore in magazzino diventa dell'utente; uno della struttura resta della struttura e si può solo usare.
   */
  app.post('/me/sensors/pair', async (req, reply) => {
    const { userId } = requireRole(req, 'user');
    const { serial } = parse(pairSensorSchema, req.body);
    if (!(await hasPremium(ctx, userId))) throw forbidden('Il sensore motix pod è incluso in Premium', 'premium_required');
    const [s] = await db.select().from(sensors).where(eq(sensors.serial, serial)).limit(1);
    if (!s) throw notFound('Sensore non riconosciuto: controlla il numero di serie');
    if (s.status === 'faulty' || s.status === 'retired') throw conflict('sensor_unavailable', 'Questo sensore risulta guasto o ritirato: contatta l’assistenza');
    const [me] = await db.select({ structureId: users.structureId }).from(users).where(eq(users.id, userId)).limit(1);
    if (s.ownerType === 'user') {
      if (s.ownerUserId !== userId) throw conflict('sensor_taken', 'Questo sensore è già abbinato a un altro account');
    } else if (s.ownerType === 'structure') {
      if (!me?.structureId || s.ownerStructureId !== me.structureId) throw forbidden('Questo sensore appartiene a una struttura a cui non sei iscritto', 'sensor_other_structure');
      if (s.status !== 'active') await db.update(sensors).set({ status: 'active', pairedAt: s.pairedAt ?? ctx.now() }).where(eq(sensors.id, s.id));
    } else {
      await db.update(sensors).set({ ownerType: 'user', ownerUserId: userId, status: 'active', pairedAt: ctx.now() }).where(eq(sensors.id, s.id));
      await audit(db, 'sensor_paired', { actorUserId: userId, entity: 'sensor', entityId: s.id, ip: req.ip });
    }
    await track(db, 'sensore_abbinato', { userId, structureId: me?.structureId });
    return reply.code(201).send(await mySensors(userId));
  });

  /** Scollega un sensore di proprietà: torna disponibile per un nuovo abbinamento. */
  app.delete('/me/sensors/:id', async (req) => {
    const { userId } = requireRole(req, 'user');
    const { id } = parse(idParam, req.params);
    const [s] = await db.select().from(sensors).where(and(eq(sensors.id, id), eq(sensors.ownerType, 'user'), eq(sensors.ownerUserId, userId))).limit(1);
    if (!s) throw notFound('Sensore non trovato tra quelli abbinati al tuo account');
    await db.update(sensors).set({ ownerType: 'btech', ownerUserId: null, status: 'in_stock', pairedAt: null }).where(eq(sensors.id, id));
    await audit(db, 'sensor_unpaired', { actorUserId: userId, entity: 'sensor', entityId: id, ip: req.ip });
    return mySensors(userId);
  });

  /** Segnala un guasto: lo vede il team BTECH nel registro dei sensori. */
  app.post('/me/sensors/:id/issues', async (req, reply) => {
    const { userId } = requireRole(req, 'user');
    const { id } = parse(idParam, req.params);
    const { note } = parse(sensorIssueSchema, req.body);
    if (!(await usableSensors(db, userId)).some((s) => s.id === id)) throw notFound('Sensore non trovato');
    await db.insert(sensorIssues).values({ sensorId: id, reporterId: userId, note });
    return reply.code(201).send({ ok: true });
  });

  /* ---------- Struttura ---------- */

  app.get('/structure/sensors', async (req) => {
    const { structure } = await structureScope(ctx, req);
    const rows = await db.select().from(sensors).where(and(eq(sensors.ownerType, 'structure'), eq(sensors.ownerStructureId, structure.id))).orderBy(sensors.serial);
    const since = new Date(ctx.now().getTime() - 30 * 86_400_000);
    const usage = rows.length
      ? await db
          .select({ sensorId: sensorReadings.sensorId, n: count() })
          .from(sensorReadings)
          .where(and(inArray(sensorReadings.sensorId, rows.map((r) => r.id)), gte(sensorReadings.createdAt, since)))
          .groupBy(sensorReadings.sensorId)
      : [];
    const list: StructureSensor[] = rows.map((s) => ({
      id: s.id,
      serial: s.serial,
      status: s.status,
      freeOfCharge: s.freeOfCharge,
      batteryPct: s.batteryPct,
      lastSeenAt: iso(s.lastSeenAt),
      setsLast30Days: Number(usage.find((u) => u.sensorId === s.id)?.n ?? 0),
    }));
    return { sensors: list };
  });

  app.post('/structure/sensors/:id/issues', async (req, reply) => {
    const { structure, auth } = await structureScope(ctx, req);
    const { id } = parse(idParam, req.params);
    const { note } = parse(sensorIssueSchema, req.body);
    const [s] = await db.select({ id: sensors.id }).from(sensors).where(and(eq(sensors.id, id), eq(sensors.ownerType, 'structure'), eq(sensors.ownerStructureId, structure.id))).limit(1);
    if (!s) throw notFound('Sensore non trovato');
    await db.insert(sensorIssues).values({ sensorId: id, reporterId: auth.userId, note });
    return reply.code(201).send({ ok: true });
  });

  /* ---------- Registro BTECH ---------- */

  app.get('/admin/sensors', async (req) => {
    requireRole(req, 'admin');
    const { status, q } = parse(z.object({ status: z.enum(SENSOR_STATUSES).optional(), q: z.string().trim().max(40).optional() }), req.query);
    const rows = await db
      .select({ s: sensors, structure: structures.displayName, firstName: users.firstName, lastName: users.lastName })
      .from(sensors)
      .leftJoin(structures, eq(structures.id, sensors.ownerStructureId))
      .leftJoin(users, eq(users.id, sensors.ownerUserId))
      .where(and(status ? eq(sensors.status, status) : undefined, q ? ilike(sensors.serial, `%${q.replace(/[%_]/g, '')}%`) : undefined))
      .orderBy(desc(sensors.createdAt), sensors.serial)
      .limit(500);
    const open = await db.select({ sensorId: sensorIssues.sensorId, n: count() }).from(sensorIssues).where(isNull(sensorIssues.resolvedAt)).groupBy(sensorIssues.sensorId);
    const totals = await db.select({ status: sensors.status, n: count() }).from(sensors).groupBy(sensors.status);
    const list: AdminSensor[] = rows.map(({ s, structure, firstName, lastName }) => ({
      id: s.id,
      serial: s.serial,
      firmware: s.firmware,
      status: s.status,
      ownerType: s.ownerType,
      ownerName: s.ownerType === 'structure' ? structure : s.ownerType === 'user' && firstName ? `${firstName} ${lastName}` : null,
      freeOfCharge: s.freeOfCharge,
      batteryPct: s.batteryPct,
      lastSeenAt: iso(s.lastSeenAt),
      pairedAt: iso(s.pairedAt),
      note: s.note,
      openIssues: Number(open.find((o) => o.sensorId === s.id)?.n ?? 0),
    }));
    return { sensors: list, totals: Object.fromEntries(SENSOR_STATUSES.map((st) => [st, Number(totals.find((t) => t.status === st)?.n ?? 0)])) };
  });

  const approvedStructure = async (structureId: string) => {
    const [st] = await db.select({ id: structures.id, status: structures.status }).from(structures).where(eq(structures.id, structureId)).limit(1);
    if (!st) throw notFound('Struttura non trovata');
    if (st.status !== 'approved') throw conflict('structure_not_approved', 'La struttura non è ancora approvata');
    return st.id;
  };

  /** Registra uno o più sensori; con una struttura indicata, vengono assegnati a quella struttura. */
  app.post('/admin/sensors', async (req, reply) => {
    const auth = requireRole(req, 'admin');
    const input = parse(adminSensorsSchema, req.body);
    const structureId = input.structureId ? await approvedStructure(input.structureId) : null;
    const existing = await db.select({ serial: sensors.serial }).from(sensors).where(inArray(sensors.serial, input.serials));
    if (existing.length) throw conflict('serial_exists', `Già nel registro: ${existing.map((e) => e.serial).slice(0, 5).join(', ')}`);
    await db.insert(sensors).values(
      input.serials.map((serial) => ({
        serial,
        firmware: input.firmware,
        ownerType: structureId ? ('structure' as const) : ('btech' as const),
        ownerStructureId: structureId,
        freeOfCharge: input.freeOfCharge,
        status: structureId ? ('active' as const) : ('in_stock' as const),
      })),
    );
    await audit(db, 'sensors_registered', { actorUserId: auth.userId, entity: 'sensor', ip: req.ip }, { count: input.serials.length, structureId });
    return reply.code(201).send({ created: input.serials.length });
  });

  app.patch('/admin/sensors/:id', async (req) => {
    const auth = requireRole(req, 'admin');
    const { id } = parse(idParam, req.params);
    const input = parse(adminSensorPatchSchema, req.body);
    const [s] = await db.select().from(sensors).where(eq(sensors.id, id)).limit(1);
    if (!s) throw notFound('Sensore non trovato');
    const set: Partial<typeof sensors.$inferInsert> = {};
    if (input.firmware !== undefined) set.firmware = input.firmware;
    if (input.freeOfCharge !== undefined) set.freeOfCharge = input.freeOfCharge;
    if (input.note !== undefined) set.note = input.note;
    if (input.status !== undefined) set.status = input.status;
    if (input.structureId !== undefined) {
      if (input.structureId) {
        set.ownerType = 'structure';
        set.ownerStructureId = await approvedStructure(input.structureId);
        set.ownerUserId = null;
        if (input.status === undefined && s.status === 'in_stock') set.status = 'active';
      } else {
        set.ownerType = 'btech';
        set.ownerStructureId = null;
        set.ownerUserId = null;
        set.pairedAt = null;
        if (input.status === undefined && s.status === 'active') set.status = 'in_stock';
      }
    }
    if (Object.keys(set).length) await db.update(sensors).set(set).where(eq(sensors.id, id));
    await audit(db, 'sensor_updated', { actorUserId: auth.userId, entity: 'sensor', entityId: id, ip: req.ip }, input);
    return { ok: true };
  });

  app.get('/admin/sensor-issues', async (req) => {
    requireRole(req, 'admin');
    const rows = await db
      .select({ i: sensorIssues, serial: sensors.serial, firstName: users.firstName, lastName: users.lastName })
      .from(sensorIssues)
      .innerJoin(sensors, eq(sensors.id, sensorIssues.sensorId))
      .leftJoin(users, eq(users.id, sensorIssues.reporterId))
      .orderBy(desc(sensorIssues.createdAt))
      .limit(200);
    const issues: SensorIssueView[] = rows.map(({ i, serial, firstName, lastName }) => ({
      id: i.id,
      sensorId: i.sensorId,
      serial,
      note: i.note,
      reporter: firstName ? `${firstName} ${lastName}` : null,
      at: i.createdAt.toISOString(),
      resolvedAt: iso(i.resolvedAt),
    }));
    return { issues };
  });

  app.post('/admin/sensor-issues/:id/resolve', async (req) => {
    requireRole(req, 'admin');
    const { id } = parse(idParam, req.params);
    const [i] = await db.update(sensorIssues).set({ resolvedAt: ctx.now() }).where(and(eq(sensorIssues.id, id), isNull(sensorIssues.resolvedAt))).returning({ id: sensorIssues.id });
    if (!i) throw notFound('Segnalazione non trovata o già chiusa');
    return { ok: true };
  });
}
