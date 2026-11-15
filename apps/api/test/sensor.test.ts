import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { analyticsEvents } from '../src/db/schema';
import { approvedStructure, approvedTrainer, createEnv, userInput, type TestEnv } from './helpers';

let env: TestEnv;
let owner: { ownerToken: string; id: string; code: string };
let pt: { token: string; id: string; code: string };
let giulia: string;
let giuliaId: string;
let paolo: string;
const DAY = '2026-11-14';
const profile = { sex: 'female', weightKg: 62, heightCm: 168, goal: 'tone', level: 'intermediate', daysPerWeek: 2, equipment: ['dumbbells', 'bench', 'barbell'], limitations: [] };
const call = (m: string, url: string, token: string, body?: unknown) => env.api(m, url, body, token);
const admin = (m: string, url: string, body?: unknown) => env.api(m, url, body, env.adminToken);
const at = (iso: string) => (env.clock.now = new Date(iso));
/** Segnale minimo valido: il contenuto non conta, nei test risponde il motore finto. */
const signal = { sampleRateHz: 50, ax: [0, 0.1, 0.2], ay: [0, 0, 0], az: [9.8, 9.8, 9.8] };
const sensorsOf = async (token: string) => (await call('GET', '/me/sensors', token)).body.sensors as any[];

beforeAll(async () => {
  env = await createEnv();
  owner = await approvedStructure(env);
  pt = await approvedTrainer(env);
  const g = await env.api('POST', '/auth/register', userInput({ structureCode: owner.code, trainerCode: pt.code }));
  giulia = g.body.accessToken;
  giuliaId = g.body.user.id;
  paolo = (await env.api('POST', '/auth/register', userInput({ email: 'paolo@example.com', firstName: 'Paolo' }))).body.accessToken;
  await call('PUT', '/me/profile', giulia, profile);
});
afterAll(async () => { await env.close(); });

describe('registro dei sensori (BTECH)', () => {
  it('registra i sensori in magazzino o assegnati a una struttura', async () => {
    expect((await admin('POST', '/admin/sensors', { serials: ['mp-aaa001', 'MP-AAA002'], firmware: '1.0.0' })).body.created).toBe(2);
    expect((await admin('POST', '/admin/sensors', { serials: ['MP-GYM001', 'MP-GYM002'], structureId: owner.id, freeOfCharge: true })).status).toBe(201);
    const { sensors, totals } = (await admin('GET', '/admin/sensors')).body;
    expect(totals).toEqual({ in_stock: 2, active: 2, faulty: 0, retired: 0 });
    expect(sensors.find((s: any) => s.serial === 'MP-AAA001')).toMatchObject({ status: 'in_stock', ownerType: 'btech', firmware: '1.0.0', freeOfCharge: false });
    expect(sensors.find((s: any) => s.serial === 'MP-GYM001')).toMatchObject({ status: 'active', ownerType: 'structure', ownerName: 'Fit Bari', freeOfCharge: true });
    expect((await admin('GET', '/admin/sensors?q=gym&status=active')).body.sensors).toHaveLength(2);
  });

  it('rifiuta numeri di serie doppi o scritti male', async () => {
    expect((await admin('POST', '/admin/sensors', { serials: ['MP-AAA001'] })).body.error.code).toBe('serial_exists');
    expect((await admin('POST', '/admin/sensors', { serials: ['MP-NEW001', 'mp-new001'] })).status).toBe(422);
    expect((await admin('POST', '/admin/sensors', { serials: ['ABC'] })).status).toBe(422);
    expect((await call('GET', '/admin/sensors', giulia)).status).toBe(403);
  });
});

describe('abbinamento nell’app', () => {
  it('l’iscritta vede già i sensori della sua struttura; chi non è iscritto no', async () => {
    expect((await sensorsOf(giulia)).map((s) => [s.serial, s.owner])).toEqual([['MP-GYM001', 'structure'], ['MP-GYM002', 'structure']]);
    expect(await sensorsOf(paolo)).toEqual([]);
    expect((await call('POST', '/me/sensors/pair', paolo, { serial: 'MP-GYM001' })).body.error.code).toBe('sensor_other_structure');
  });

  it('un sensore in magazzino diventa di chi lo abbina, e di nessun altro', async () => {
    const res = await call('POST', '/me/sensors/pair', giulia, { serial: ' mp-aaa001 ' });
    expect(res.status).toBe(201);
    expect(res.body.sensors[0]).toMatchObject({ serial: 'MP-AAA001', owner: 'mine' });
    expect((await call('POST', '/me/sensors/pair', paolo, { serial: 'MP-AAA001' })).body.error.code).toBe('sensor_taken');
    expect((await call('POST', '/me/sensors/pair', paolo, { serial: 'MP-ZZZ999' })).status).toBe(404);
    const row = (await admin('GET', '/admin/sensors?q=AAA001')).body.sensors[0];
    expect(row).toMatchObject({ status: 'active', ownerType: 'user', ownerName: 'Giulia Rossi' });
    const events = await env.handle.db.select().from(analyticsEvents).where(eq(analyticsEvents.type, 'sensore_abbinato'));
    expect(events).toHaveLength(1);
  });

  it('scollegato, il sensore torna disponibile', async () => {
    const mine = (await sensorsOf(giulia)).find((s) => s.owner === 'mine');
    expect((await call('DELETE', `/me/sensors/${mine.id}`, paolo)).status).toBe(404);
    expect((await call('DELETE', `/me/sensors/${mine.id}`, giulia)).body.sensors).toHaveLength(2);
    expect((await call('POST', '/me/sensors/pair', paolo, { serial: 'MP-AAA001' })).status).toBe(201);
  });
});

describe('serie registrata dal sensore', () => {
  let sessionId: string;
  let bench: any;
  let timed: any;
  let pod: any;

  beforeAll(async () => {
    const plan = (await call('POST', '/me/plan/generate', giulia, { day: DAY })).body.plan;
    sessionId = plan.sessions[0].id;
    const detail = (await call('GET', `/me/sessions/${sessionId}`, giulia)).body;
    bench = detail.exercises.find((e: any) => e.exercise.loadable && e.exercise.unit === 'reps');
    timed = detail.exercises.find((e: any) => e.exercise.unit !== 'reps');
    pod = (await sensorsOf(giulia))[0];
  });

  it('conta le ripetizioni e salva velocità e regolarità', async () => {
    const res = await call('POST', `/me/sessions/${sessionId}/sets/sensor`, giulia, { ...signal, sessionExerciseId: bench.id, setNumber: 1, sensorId: pod.id, loadKg: 30, batteryPct: 81, firmware: '1.0.2' });
    expect(res.status).toBe(200);
    expect(res.body.analysis).toMatchObject({ reps: 10, avgVelocity: 0.42, regularity: 88, velocityLossPct: 12 });
    const log = res.body.session.exercises.find((e: any) => e.id === bench.id).logs[0];
    expect(log).toMatchObject({ setNumber: 1, reps: 10, loadKg: 30, source: 'sensor', sensor: { avgVelocity: 0.42, peakVelocity: 0.71, regularity: 88, timeUnderTensionMs: 26000, rangeM: 0.45 } });
    expect(res.body.session.startedAt).not.toBeNull();
    expect((await sensorsOf(giulia))[0]).toMatchObject({ batteryPct: 81, firmware: '1.0.2' });
    expect((await sensorsOf(giulia))[0].lastSeenAt).not.toBeNull();
  });

  it('la stessa serie rifatta sostituisce la precedente; una serie a mano non ha dati del sensore', async () => {
    env.ai.analysis = { ...env.ai.analysis, reps: 9, avgVelocity: 0.4 };
    const again = await call('POST', `/me/sessions/${sessionId}/sets/sensor`, giulia, { ...signal, sessionExerciseId: bench.id, setNumber: 1, sensorId: pod.id, loadKg: 30 });
    expect(again.body.session.exercises.find((e: any) => e.id === bench.id).logs).toHaveLength(1);
    expect(again.body.session.exercises.find((e: any) => e.id === bench.id).logs[0]).toMatchObject({ reps: 9, sensor: { avgVelocity: 0.4 } });
    const manual = await call('PUT', `/me/sessions/${sessionId}/sets`, giulia, { sessionExerciseId: bench.id, setNumber: 2, reps: 12, loadKg: 30 });
    expect(manual.body.exercises.find((e: any) => e.id === bench.id).logs[1]).toMatchObject({ source: 'manual', sensor: null });
  });

  it('senza ripetizioni, senza motore o su un esercizio a tempo chiede di registrare a mano', async () => {
    const body = { ...signal, sessionExerciseId: bench.id, setNumber: 3, sensorId: pod.id, loadKg: 30 };
    env.ai.analysis = { ...env.ai.analysis, reps: 0, quality: 'no_movement' };
    expect((await call('POST', `/me/sessions/${sessionId}/sets/sensor`, giulia, body)).body.error.code).toBe('no_reps');
    env.ai.down = true;
    const down = await call('POST', `/me/sessions/${sessionId}/sets/sensor`, giulia, body);
    expect(down.status).toBe(503);
    expect(down.body.error.code).toBe('analysis_unavailable');
    env.ai.down = false;
    env.ai.analysis = { ...env.ai.analysis, reps: 12, quality: 'ok', avgVelocity: 0.3, velocityLossPct: 42, regularity: 55 };
    if (timed) expect((await call('POST', `/me/sessions/${sessionId}/sets/sensor`, giulia, { ...body, sessionExerciseId: timed.id, setNumber: 1 })).body.error.code).toBe('not_countable');
    expect((await call('GET', `/me/sessions/${sessionId}`, giulia)).body.exercises.find((e: any) => e.id === bench.id).logs).toHaveLength(2);
  });

  it('controlla il segnale, il sensore e la seduta', async () => {
    const body = { ...signal, sessionExerciseId: bench.id, setNumber: 3, sensorId: pod.id };
    expect((await call('POST', `/me/sessions/${sessionId}/sets/sensor`, giulia, { ...body, ay: [0] })).status).toBe(422);
    expect((await call('POST', `/me/sessions/${sessionId}/sets/sensor`, giulia, { ...body, ax: [900, 0, 0] })).status).toBe(422);
    const paoloPod = (await sensorsOf(paolo))[0];
    expect((await call('POST', `/me/sessions/${sessionId}/sets/sensor`, giulia, { ...body, sensorId: paoloPod.id })).body.error.code).toBe('sensor_not_paired');
    expect((await call('POST', `/me/sessions/${sessionId}/sets/sensor`, paolo, { ...body, sensorId: paoloPod.id })).status).toBe(404);
  });

  it('il riepilogo riporta i dati del sensore e i consigli che ne derivano', async () => {
    await call('POST', `/me/sessions/${sessionId}/sets/sensor`, giulia, { ...signal, sessionExerciseId: bench.id, setNumber: 3, sensorId: pod.id, loadKg: 30 });
    const summary = (await call('POST', `/me/sessions/${sessionId}/complete`, giulia, { perceivedEffort: 7 })).body;
    expect(summary.sensor).toMatchObject({ sets: 2, avgVelocity: 0.35, timeUnderTensionMs: 52000 });
    const row = summary.exercises.find((e: any) => e.name === bench.exercise.name);
    expect(row.sensor).toMatchObject({ sets: 2, avgVelocity: 0.35, velocityLossPct: 27, previousAvgVelocity: null });
    expect(summary.exercises.find((e: any) => e.name !== bench.exercise.name)?.sensor ?? null).toBeNull();
    const events = await env.handle.db.select().from(analyticsEvents).where(eq(analyticsEvents.type, 'serie_registrata_sensore'));
    expect(events).toHaveLength(3);
    expect(events[0]!.structureId).toBe(owner.id);
  });

  it('il personal trainer vede i dati del sensore nel report del cliente', async () => {
    await call('PATCH', '/me/consents', giulia, { share_trainer: true });
    const linkId = (await call('GET', '/trainer/clients', pt.token)).body.clients[0].linkId;
    const report = (await call('GET', `/trainer/clients/${linkId}/report`, pt.token)).body;
    expect(report.sensor).toMatchObject({ sets: 2, totalSets: 3 });
    expect(report.sensor.exercises[0]).toMatchObject({ exercise: bench.exercise.name, sets: 2, firstVelocity: 0.35, lastVelocity: 0.35, lastLoadKg: 30 });
  });

  it('la struttura vede quanto sono usati i suoi sensori e segnala un guasto', async () => {
    const list = (await call('GET', '/structure/sensors', owner.ownerToken)).body.sensors;
    expect(list.map((s: any) => [s.serial, s.setsLast30Days, s.freeOfCharge])).toEqual([['MP-GYM001', 2, true], ['MP-GYM002', 0, true]]);
    expect((await call('POST', `/structure/sensors/${list[1].id}/issues`, owner.ownerToken, { note: 'Non si accende più' })).status).toBe(201);
    expect((await call('POST', `/me/sensors/${pod.id}/issues`, giulia, { note: 'ok' })).status).toBe(422);
    expect((await call('POST', `/me/sensors/${pod.id}/issues`, giulia, { note: 'Il led lampeggia rosso' })).status).toBe(201);
    expect((await call('POST', `/me/sensors/${list[1].id}/issues`, paolo, { note: 'Non è il mio sensore' })).status).toBe(404);
  });

  it('BTECH chiude le segnalazioni e ritira un sensore guasto', async () => {
    const issues = (await admin('GET', '/admin/sensor-issues')).body.issues;
    expect(issues).toHaveLength(2);
    expect(issues.find((i: any) => i.serial === 'MP-GYM002')).toMatchObject({ note: 'Non si accende più', reporter: 'Marco Bianchi', resolvedAt: null });
    const broken = (await admin('GET', '/admin/sensors?q=GYM002')).body.sensors[0];
    expect(broken.openIssues).toBe(1);
    expect((await admin('PATCH', `/admin/sensors/${broken.id}`, { status: 'faulty', note: 'Rientrato in assistenza' })).status).toBe(200);
    expect((await sensorsOf(giulia)).map((s) => s.serial)).toEqual(['MP-GYM001']);
    expect((await call('POST', '/me/sensors/pair', giulia, { serial: 'MP-GYM002' })).body.error.code).toBe('sensor_unavailable');
    const issue = issues.find((i: any) => i.serial === 'MP-GYM002');
    expect((await admin('POST', `/admin/sensor-issues/${issue.id}/resolve`)).status).toBe(200);
    expect((await admin('POST', `/admin/sensor-issues/${issue.id}/resolve`)).status).toBe(404);
    // tolto alla struttura torna in magazzino
    const other = (await admin('GET', '/admin/sensors?q=GYM001')).body.sensors[0];
    await admin('PATCH', `/admin/sensors/${other.id}`, { structureId: null });
    expect((await admin('GET', '/admin/sensors?q=GYM001')).body.sensors[0]).toMatchObject({ status: 'in_stock', ownerType: 'btech', ownerName: null });
    expect(await sensorsOf(giulia)).toEqual([]);
    await admin('PATCH', `/admin/sensors/${other.id}`, { structureId: owner.id });
    expect((await sensorsOf(giulia)).map((s) => s.serial)).toEqual(['MP-GYM001']);
  });
});

describe('il piano si adatta ogni settimana', () => {
  let first: any;

  it('finché la settimana è in corso il piano non cambia', async () => {
    at('2026-11-20T09:00:00Z');
    first = (await call('GET', '/me/plan', giulia)).body.plan;
    expect(first).toMatchObject({ weekStart: DAY, version: 1, changes: [] });
    expect(env.ai.lastWeek).toBeNull();
  });

  it('dalla settimana dopo il motore riceve cosa è successo e il piano riparte con le sue proposte', async () => {
    at('2026-11-21T09:00:00Z');
    env.ai.decide = (week) => ({
      mode: 'progress',
      summary: ['Hai completato 1 seduta su 2: dove hai chiuso tutte le ripetizioni il piano sale.'],
      exercises: week.exercises.map((e, i) =>
        // Il motore esagera sul primo esercizio: il filtro di sicurezza deve fermarlo al 10%.
        i === 0 ? { key: e.key, action: 'increase', sets: e.sets + 4, reps: e.reps, loadKg: 60, reason: 'Tutte le ripetizioni completate, da 30 kg a 60 kg.' } : { key: e.key, action: 'hold', sets: e.sets, reps: e.reps, loadKg: e.loadKg, reason: 'Resta uguale.' },
      ),
    });
    const plan = (await call('GET', '/me/plan', giulia)).body.plan;
    expect(plan).toMatchObject({ weekStart: '2026-11-21', version: 2, author: 'ai' });
    expect(plan.id).not.toBe(first.id);
    expect(plan.sessions.map((s: any) => [s.title, s.scheduledDate, s.completedAt])).toEqual(first.sessions.map((s: any) => [s.title, s.scheduledDate.replace('2026-11-14', '2026-11-21').replace('2026-11-17', '2026-11-24'), null]));
    expect(plan.rationale).toEqual(first.rationale);
    expect(plan.changes[0]).toContain('Hai completato 1 seduta su 2');
    expect(plan.changes[1]).toMatch(/: tutte le ripetizioni completate, da 30 kg a 60 kg\./);

    // Cosa ha ricevuto il motore.
    const week = env.ai.lastWeek!;
    expect(week).toMatchObject({ plannedSessions: 2, completedSessions: 1, efforts: [7], minor: false });
    const done = week.exercises.find((e) => e.sessions.length > 0)!;
    expect(done.sessions[0]).toEqual([
      { reps: 9, loadKg: 30, velocityLossPct: 12 },
      { reps: 12, loadKg: 30, velocityLossPct: null },
      { reps: 12, loadKg: 30, velocityLossPct: 42 },
    ]);

    // Il filtro di sicurezza: al massimo +10% di carico e una serie in più.
    const detail = (await call('GET', `/me/sessions/${plan.sessions[0].id}`, giulia)).body;
    const before = (await call('GET', `/me/sessions/${first.sessions[0].id}`, giulia)).body;
    expect(detail.exercises[0]).toMatchObject({ targetLoadKg: 33, targetSets: before.exercises[0].targetSets + 1, targetReps: before.exercises[0].targetReps });
    expect(detail.exercises.slice(1).map((e: any) => [e.targetSets, e.targetReps, e.targetLoadKg])).toEqual(before.exercises.slice(1).map((e: any) => [e.targetSets, e.targetReps, e.targetLoadKg]));
    // Le sedute fatte restano nel diario, quelle non fatte della settimana vecchia spariscono.
    expect((await call('GET', '/me/sessions', giulia)).body.sessions).toHaveLength(1);
    expect((await call('GET', `/me/sessions/${first.sessions[1].id}`, giulia)).status).toBe(404);
    expect((await call('GET', '/me/plan', giulia)).body.plan.id).toBe(plan.id);
  });

  it('se il motore non risponde il piano riparte uguale', async () => {
    at('2026-11-27T09:00:00Z'); // la prova è ancora attiva fino al 28
    env.ai.down = true;
    const before = (await call('GET', '/me/plan', giulia)).body.plan;
    at('2026-11-28T08:00:00Z');
    const home = (await call('GET', '/me/home?day=2026-11-28', giulia)).body;
    expect(home.session.scheduledDate).toBe('2026-11-28');
    const plan = (await call('GET', '/me/plan', giulia)).body.plan;
    expect(plan).toMatchObject({ weekStart: '2026-11-28', version: 3, changes: ['Questa settimana il piano riparte uguale alla precedente.'] });
    expect(plan.id).not.toBe(before.id);
    env.ai.down = false;
  });

  it('nella versione gratuita il piano resta l’ultimo ricevuto e il sensore non si usa', async () => {
    at('2026-12-10T09:00:00Z');
    const plan = (await call('GET', '/me/plan', giulia)).body.plan;
    expect(plan).toMatchObject({ weekStart: '2026-11-28', version: 3 });
    expect((await call('GET', '/me/sensors', giulia)).body.premium).toBe(false);
    const detail = (await call('GET', `/me/sessions/${plan.sessions[0].id}`, giulia)).body;
    const pod = (await sensorsOf(giulia))[0];
    expect((await call('POST', `/me/sessions/${plan.sessions[0].id}/sets/sensor`, giulia, { ...signal, sessionExerciseId: detail.exercises[0].id, setNumber: 1, sensorId: pod.id })).body.error.code).toBe('premium_required');
    expect((await call('POST', '/me/sensors/pair', giulia, { serial: 'MP-AAA002' })).body.error.code).toBe('premium_required');
  });

  it('con l’abbonamento attivo riparte dalla settimana in corso, saltando quelle perse', async () => {
    await admin('POST', `/admin/users/${giuliaId}/subscription/activate`);
    env.ai.lastWeek = null;
    const plan = (await call('GET', '/me/plan', giulia)).body.plan;
    expect(plan).toMatchObject({ weekStart: '2026-12-05', version: 4 });
    expect(env.ai.lastWeek).toMatchObject({ plannedSessions: 2, completedSessions: 0 });
  });

  it('il piano del personal trainer viene riproposto uguale, senza passare dal motore', async () => {
    const linkId = (await call('GET', '/trainer/clients', pt.token)).body.clients[0].linkId;
    const draft = (await call('POST', `/trainer/clients/${linkId}/plan/draft`, pt.token, { day: '2026-12-10' })).body;
    const sessions = draft.sessions.slice(0, 1).map((s: any) => ({ title: 'Forza A', day: '2026-12-10', exercises: s.exercises.slice(0, 2).map((e: any) => ({ exerciseId: e.exerciseId, sets: 4, reps: 6, loadKg: 50, restSeconds: 120 })) }));
    expect((await call('PUT', `/trainer/clients/${linkId}/plan`, pt.token, { note: 'Tecnica prima di tutto.', sessions })).status).toBe(200);
    env.ai.lastWeek = null;
    at('2026-12-18T09:00:00Z');
    const plan = (await call('GET', '/me/plan', giulia)).body.plan;
    expect(plan).toMatchObject({ author: 'trainer', trainerName: 'Luca Verdi', weekStart: '2026-12-17', changes: [], rationale: ['Tecnica prima di tutto.'] });
    expect(plan.sessions.map((s: any) => [s.title, s.scheduledDate])).toEqual([['Forza A', '2026-12-17']]);
    const detail = (await call('GET', `/me/sessions/${plan.sessions[0].id}`, giulia)).body;
    expect(detail.exercises.map((e: any) => [e.targetSets, e.targetReps, e.targetLoadKg, e.restSeconds])).toEqual([[4, 6, 50, 120], [4, 6, 50, 120]]);
    expect(env.ai.lastWeek).toBeNull();
  });
});
