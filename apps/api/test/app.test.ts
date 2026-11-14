import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { approvedTrainer, createEnv, userInput, type TestEnv } from './helpers';

let env: TestEnv;
let token: string;
const DAY = '2026-11-14'; // sabato
const profile = { sex: 'female', weightKg: 70, heightCm: 168, goal: 'tone', level: 'intermediate', daysPerWeek: 3, equipment: ['dumbbells', 'bench', 'barbell'], limitations: ['knee'] };
const get = (url: string, t = token) => env.api('GET', url, undefined, t);
const post = (url: string, body?: unknown, t = token) => env.api('POST', url, body ?? {}, t);
const put = (url: string, body: unknown, t = token) => env.api('PUT', url, body, t);
const at = (iso: string) => (env.clock.now = new Date(iso));

beforeAll(async () => {
  env = await createEnv();
  token = (await env.api('POST', '/auth/register', userInput())).body.accessToken;
});
afterAll(async () => { await env.close(); });

describe('questionario e piano', () => {
  it('senza questionario non c’è piano', async () => {
    expect((await get('/me')).body).toMatchObject({ hasProfile: false, premium: true });
    expect((await get('/me/plan')).body.plan).toBeNull();
    expect((await post('/me/plan/generate', { day: DAY })).body.error.code).toBe('profile_missing');
  });

  it('salva il questionario e controlla i valori', async () => {
    expect((await put('/me/profile', { ...profile, weightKg: 10 })).body.error.fields.weightKg).toBeTruthy();
    expect((await put('/me/profile', { ...profile, equipment: ['astronave'] })).status).toBe(422);
    const saved = await put('/me/profile', profile);
    expect(saved.body).toMatchObject({ goal: 'tone', weightKg: 70, limitations: ['knee'] });
    expect((await get('/me')).body.hasProfile).toBe(true);
  });

  it('genera il piano della settimana con la spiegazione', async () => {
    const res = await post('/me/plan/generate', { day: DAY });
    expect(res.status).toBe(201);
    const plan = res.body.plan;
    expect(plan.author).toBe('ai');
    expect(plan.sessions.map((s: any) => s.scheduledDate)).toEqual(['2026-11-14', '2026-11-16', '2026-11-18']);
    expect(plan.sessions[0]).toMatchObject({ title: 'Total body A', exerciseCount: 6, completedAt: null });
    expect(plan.sessions[0].estimatedMinutes).toBeGreaterThan(20);
    expect(plan.rationale.join(' ')).toContain('ginocchio');
    expect((await get('/me/plan')).body.plan.id).toBe(plan.id);
  });

  it('rifiuta una data incompatibile con l’ora del server', async () => {
    expect((await post('/me/plan/generate', { day: '2026-12-25' })).body.error.code).toBe('day_invalid');
    expect((await get('/me/home?day=2020-01-01')).status).toBe(422);
  });

  it('gli altri ruoli non hanno un piano', async () => {
    const pt = await approvedTrainer(env);
    expect((await get('/me/plan', pt.token)).status).toBe(403);
  });
});

describe('seduta', () => {
  let sessionId: string;
  let detail: any;

  it('mostra gli esercizi con serie, ripetizioni e recupero; nessuno carica il ginocchio', async () => {
    sessionId = (await get('/me/plan')).body.plan.sessions[0].id;
    detail = (await get(`/me/sessions/${sessionId}`)).body;
    expect(detail.exercises).toHaveLength(6);
    expect(detail.exercises[0]).toMatchObject({ position: 1, targetSets: 3, targetReps: 12, restSeconds: 60, logs: [], previous: null, exercise: { name: 'Panca piana con bilanciere', unit: 'reps' } });
    expect(detail.exercises.some((e: any) => e.exercise.name === 'Sedia al muro')).toBe(false);
    const names = detail.exercises.map((e: any) => e.exercise.name);
    expect(names).not.toContain('Squat con bilanciere');
    expect(names).toContain('Panca piana con bilanciere');
  });

  it('registra, corregge ed elimina le serie', async () => {
    const bench = detail.exercises.find((e: any) => e.exercise.name === 'Panca piana con bilanciere');
    await post(`/me/sessions/${sessionId}/start`);
    for (const n of [1, 2, 3]) await put(`/me/sessions/${sessionId}/sets`, { sessionExerciseId: bench.id, setNumber: n, reps: 12, loadKg: 40 });
    // correzione della seconda serie
    const fixed = await put(`/me/sessions/${sessionId}/sets`, { sessionExerciseId: bench.id, setNumber: 2, reps: 12, loadKg: 42.5 });
    const logs = fixed.body.exercises.find((e: any) => e.id === bench.id).logs;
    expect(logs.map((l: any) => l.loadKg)).toEqual([40, 42.5, 40]);
    // un esercizio a corpo libero senza carico, con una serie in più eliminata
    const core = detail.exercises.find((e: any) => !e.exercise.loadable);
    await put(`/me/sessions/${sessionId}/sets`, { sessionExerciseId: core.id, setNumber: 1, reps: 15 });
    const extra = await put(`/me/sessions/${sessionId}/sets`, { sessionExerciseId: core.id, setNumber: 2, reps: 3 });
    const extraId = extra.body.exercises.find((e: any) => e.id === core.id).logs[1].id;
    const removed = await env.api('DELETE', `/me/sessions/${sessionId}/sets/${extraId}`, undefined, token);
    expect(removed.body.exercises.find((e: any) => e.id === core.id).logs).toHaveLength(1);
    expect((await put(`/me/sessions/${sessionId}/sets`, { sessionExerciseId: bench.id, setNumber: 1, reps: -1 })).status).toBe(422);
  });

  it('un altro utente non vede la seduta', async () => {
    const other = await env.api('POST', '/auth/register', userInput({ email: 'altro@example.com' }));
    expect((await get(`/me/sessions/${sessionId}`, other.body.accessToken)).status).toBe(404);
    expect((await put(`/me/sessions/${sessionId}/sets`, { sessionExerciseId: detail.exercises[0].id, setNumber: 1, reps: 5 }, other.body.accessToken)).status).toBe(404);
  });

  it('chiude la seduta e produce il riepilogo', async () => {
    expect((await get(`/me/sessions/${sessionId}/summary`)).status).toBe(409);
    at('2026-11-14T10:48:00Z');
    const res = await post(`/me/sessions/${sessionId}/complete`, { perceivedEffort: 7 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      title: 'Total body A',
      durationMin: 48,
      perceivedEffort: 7,
      totals: { sets: 4, reps: 51, volumeKg: 12 * 40 + 12 * 42.5 + 12 * 40 },
      previous: null,
      week: { sessionsThisWeek: 1, sessionsLastWeek: 0 },
    });
    expect(res.body.exercises.find((e: any) => e.name.startsWith('Panca'))).toMatchObject({ sets: 3, bestLoadKg: 42.5, trend: 'new' });
    expect(res.body.tips.join(' ')).toContain('Panca piana con bilanciere: hai completato tutte le ripetizioni. La prossima volta prova 44,5 kg');
    expect(res.body.tips.join(' ')).toContain('4 serie su');
    // dopo la chiusura non si modifica più
    expect((await put(`/me/sessions/${sessionId}/sets`, { sessionExerciseId: detail.exercises[0].id, setNumber: 1, reps: 5 })).status).toBe(409);
    expect((await post(`/me/sessions/${sessionId}/complete`, { perceivedEffort: 5 })).status).toBe(409);
    expect((await get('/me/sessions')).body.sessions.map((s: any) => s.id)).toEqual([sessionId]);
  });

  it('la settimana dopo il piano parte dai carichi fatti e li aumenta', async () => {
    at('2026-11-21T09:00:00Z');
    const plan = (await post('/me/plan/generate', { day: '2026-11-21' })).body.plan;
    expect(plan.rationale.join(' ')).toContain('circa il 5%');
    // le sedute non fatte del vecchio piano sono state sostituite, quella fatta resta nel diario
    expect(plan.sessions).toHaveLength(3);
    expect((await get('/me/sessions')).body.sessions).toHaveLength(1);
    const next = (await get(`/me/sessions/${plan.sessions[0].id}`)).body;
    const bench = next.exercises.find((e: any) => e.exercise.name === 'Panca piana con bilanciere');
    expect(bench.targetLoadKg).toBe(44.5);
    expect(bench.previous).toMatchObject({ day: '2026-11-14', sets: [{ reps: 12, loadKg: 40 }, { reps: 12, loadKg: 42.5 }, { reps: 12, loadKg: 40 }] });

    // seconda seduta dello stesso tipo: il riepilogo la confronta con la precedente
    for (const n of [1, 2, 3]) await put(`/me/sessions/${next.id}/sets`, { sessionExerciseId: bench.id, setNumber: n, reps: 12, loadKg: 44.5 });
    const summary = (await post(`/me/sessions/${next.id}/complete`, { perceivedEffort: 9 })).body;
    expect(summary.previous).toMatchObject({ day: '2026-11-14', volumeKg: 1470, volumeDeltaPct: 9 });
    expect(summary.week).toMatchObject({ sessionsThisWeek: 1, sessionsLastWeek: 1, volumeLastWeek: 1470, volumeThisWeek: 1602 });
    expect(summary.exercises[0]).toMatchObject({ trend: 'up', previous: { bestLoadKg: 42.5 } });
    expect(summary.tips[0]).toContain('molto intensa');
  });

  it('allenamento libero: si crea, si elimina se non completato', async () => {
    const ex = (await get('/exercises?q=plank')).body.exercises;
    expect(ex[0]).toMatchObject({ name: 'Plank', unit: 'seconds', loadable: false });
    const free = await post('/me/sessions', { day: '2026-11-21', exerciseIds: [ex[0].id] });
    expect(free.status).toBe(201);
    expect(free.body.exercises[0]).toMatchObject({ targetSets: 3, targetReps: 30 });
    expect((await env.api('DELETE', `/me/sessions/${free.body.id}`, undefined, token)).status).toBe(200);
    const planned = (await get('/me/plan')).body.plan.sessions[1].id;
    expect((await env.api('DELETE', `/me/sessions/${planned}`, undefined, token)).body.error.code).toBe('plan_session');
  });
});

describe('idratazione, home e progressi', () => {
  const D = '2026-11-21';

  it('in Premium l’obiettivo dipende da peso e allenamento del giorno', async () => {
    // 70 kg × 35 ml = 2450, più 500 perché oggi c'è una seduta
    expect((await get(`/me/hydration?day=${D}`)).body).toMatchObject({ goalMl: 2950, totalMl: 0, personalized: true });
    // domani nessuna seduta in programma
    expect((await get('/me/hydration?day=2026-11-22')).body.goalMl).toBe(2450);
  });

  it('registra bicchieri e bottiglie e permette di annullare', async () => {
    await post('/me/hydration', { day: D, container: 'glass' });
    await post('/me/hydration', { day: D, container: 'bottle_15' });
    const res = await post('/me/hydration', { day: D, container: 'flask_05' });
    expect(res.body.totalMl).toBe(2200);
    expect(res.body.logs).toHaveLength(3);
    const undone = await env.api('DELETE', `/me/hydration/${res.body.logs[0].id}`, undefined, token);
    expect(undone.body.totalMl).toBe(2200 - res.body.logs[0].amountMl);
    expect(undone.body.logs).toHaveLength(2);
    expect((await post('/me/hydration', { day: D, container: 'secchio' })).status).toBe(422);
  });

  it('la home riassume la giornata', async () => {
    const home = (await get(`/me/home?day=${D}`)).body;
    expect(home).toMatchObject({ premium: true, hasPlan: true, sessionIsToday: false, trialDaysLeft: 8, hydration: { goalMl: 2950 } });
    // la seduta di oggi è già fatta: propone la prossima
    expect(home.session.scheduledDate).toBe('2026-11-23');
    expect(home.streakDays).toBe(1);
    expect(home.tip.length).toBeGreaterThan(10);
  });

  it('misure e progressi', async () => {
    expect((await post('/me/measurements', { day: D, weightKg: 69.2 })).status).toBe(201);
    expect((await post('/me/measurements', { day: D })).status).toBe(409);
    const p = (await get(`/me/progress?day=${D}&days=30`)).body;
    expect(p).toMatchObject({ days: 30, limited: false });
    expect(p.weeks.map((w: any) => w.sessions).reduce((a: number, b: number) => a + b, 0)).toBe(2);
    expect(p.weight).toEqual([{ day: '2026-11-14', weightKg: 70 }, { day: D, weightKg: 69.2 }]);
    expect(p.strength[0]).toMatchObject({ exercise: 'Panca piana con bilanciere', points: [{ day: '2026-11-14', bestLoadKg: 42.5 }, { day: D, bestLoadKg: 44.5 }] });
    expect(p.muscles[0]).toMatchObject({ muscle: 'chest', sets: 6 });
    expect(p.hydration.days.at(-1)).toMatchObject({ day: D, goalMl: 2950 });
    // la media conta dal primo giorno registrato (oggi), non da 30 giorni fa
    expect(p.hydration).toMatchObject({ trackedDays: 1, daysOnTarget: 0 });
    expect(p.hydration.averageMl).toBe(p.hydration.days.at(-1).totalMl);
    // il nuovo peso aggiorna l'obiettivo di idratazione: 69,2 × 35 ≈ 2400
    expect((await get('/me/hydration?day=2026-11-22')).body.goalMl).toBe(2400);
  });
});

describe('prova gratuita e versione gratuita', () => {
  it('la disdetta durante la prova non toglie subito Premium e si può annullare', async () => {
    const sub = (await get('/me/subscription')).body;
    expect(sub).toMatchObject({ status: 'trial', premium: true, cancelled: false, trialDaysLeft: 8, installmentsTotal: 12, priceMonthlyEur: 4.99 });
    const cancelled = (await post('/me/subscription/cancel')).body;
    expect(cancelled).toMatchObject({ status: 'trial', premium: true, cancelled: true, firstChargeAt: null });
    expect((await post('/me/subscription/resume')).body.cancelled).toBe(false);
    expect((await post('/me/subscription/resume')).status).toBe(409);
  });

  it('finita la prova senza abbonamento si passa alla versione gratuita', async () => {
    at('2026-11-29T09:00:00Z');
    const D = '2026-11-29';
    expect((await get('/me/subscription')).body).toMatchObject({ status: 'expired', premium: false, trialDaysLeft: null });
    expect((await get('/me')).body.premium).toBe(false);
    // piano personalizzato: solo Premium
    expect((await post('/me/plan/generate', { day: D })).body.error.code).toBe('premium_required');
    // idratazione: obiettivo standard
    expect((await get(`/me/hydration?day=${D}`)).body).toMatchObject({ goalMl: 2000, personalized: false });
    // progressi: ultimi 7 giorni
    expect((await get(`/me/progress?day=${D}&days=90`)).body).toMatchObject({ days: 7, limited: true });
    // diario e allenamento libero restano disponibili
    expect((await get('/me/sessions')).body.sessions).toHaveLength(2);
    const ex = (await get('/exercises?q=crunch')).body.exercises;
    expect((await post('/me/sessions', { day: D, exerciseIds: [ex[0].id] })).status).toBe(201);
    expect((await post('/me/subscription/cancel')).status).toBe(409);
  });
});
