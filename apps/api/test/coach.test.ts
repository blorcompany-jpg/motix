import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scoreRisk } from '../src/services/risk';
import { PASSWORD, approvedStructure, approvedTrainer, createEnv, userInput, type TestEnv } from './helpers';

let env: TestEnv;
let owner: { ownerToken: string; id: string; code: string };
let pt: { token: string; id: string; code: string };
let client: string; // token
let clientId: string;
let linkId: string;
const DAY = '2026-11-14';
const profile = { sex: 'male', weightKg: 80, heightCm: 180, goal: 'strength', level: 'intermediate', daysPerWeek: 2, equipment: ['dumbbells', 'bench', 'barbell'], limitations: [] };
const call = (m: string, url: string, token: string, body?: unknown) => env.api(m, url, body, token);
const at = (iso: string) => (env.clock.now = new Date(iso));
/** Fa passare un minuto: nella realtà due messaggi non hanno mai lo stesso istante. */
const tick = () => (env.clock.now = new Date(env.clock.now.getTime() + 60_000));

beforeAll(async () => {
  env = await createEnv();
  owner = await approvedStructure(env);
  pt = await approvedTrainer(env);
  const reg = await env.api('POST', '/auth/register', userInput({ email: 'cliente@example.com', firstName: 'Nora', lastName: 'Fabbri', structureCode: owner.code, trainerCode: pt.code }));
  client = reg.body.accessToken;
  clientId = reg.body.user.id;
  linkId = (await call('GET', '/trainer/clients', pt.token)).body.clients[0].linkId;
});
afterAll(async () => { await env.close(); });

describe('punteggio di rischio abbandono', () => {
  const base = { accountAgeDays: 30, daysSinceLastSession: 2, daysSinceLastLogin: 1, sessionsLast14: 4, sessionsPrev14: 4, missedLast14: 0, trialDaysLeft: null };
  it('chi si allena con regolarità è a rischio basso', () => {
    expect(scoreRisk(base)).toMatchObject({ level: 'low', score: 0, reasons: [], suggestion: null });
  });
  it('assenza lunga e app non aperta portano a rischio alto, con il motivo principale in testa', () => {
    const r = scoreRisk({ ...base, daysSinceLastSession: 20, daysSinceLastLogin: 15, sessionsLast14: 0 });
    expect(r.level).toBe('high');
    expect(r.reasons[0]).toBe('Nessuna seduta da 20 giorni');
    expect(r.suggestion).toContain('fissare il prossimo allenamento');
  });
  it('un calo di frequenza da solo è un rischio contenuto', () => {
    const r = scoreRisk({ ...base, sessionsLast14: 1, sessionsPrev14: 4 });
    expect(r).toMatchObject({ level: 'low', score: 0.25 });
    expect(scoreRisk({ ...base, sessionsLast14: 1, sessionsPrev14: 4, missedLast14: 3 }).level).toBe('medium');
  });
  it('un account appena creato non genera alert', () => {
    expect(scoreRisk({ ...base, accountAgeDays: 2, daysSinceLastSession: null, sessionsLast14: 0, sessionsPrev14: 0 }).level).toBe('low');
    expect(scoreRisk({ ...base, accountAgeDays: 10, daysSinceLastSession: null, sessionsLast14: 0, sessionsPrev14: 0 }).reasons[0]).toBe('Non ha ancora completato una seduta');
  });
});

describe('personal trainer: report e piano del cliente', () => {
  it('senza consenso il personal trainer non vede i dati del cliente', async () => {
    expect((await call('GET', `/trainer/clients/${linkId}/report`, pt.token)).body.error.code).toBe('consent_required');
    expect((await call('POST', `/trainer/clients/${linkId}/plan/draft`, pt.token, { day: DAY })).body.error.code).toBe('consent_required');
    expect((await call('GET', '/trainer/clients', pt.token)).body.clients[0].risk).toBeNull();
  });

  it('con il consenso riceve una proposta dal questionario del cliente', async () => {
    await call('PATCH', '/me/consents', client, { share_trainer: true });
    await call('PUT', '/me/profile', client, profile);
    const draft = await call('POST', `/trainer/clients/${linkId}/plan/draft`, pt.token, { day: DAY });
    expect(draft.status).toBe(200);
    expect(draft.body.sessions).toHaveLength(2);
    expect(draft.body.sessions[0].exercises[0]).toMatchObject({ sets: 4, reps: 6, restSeconds: 150 });
    expect(draft.body.sessions[0].exercises[0].name).toBeTruthy();
    // la proposta non è ancora il piano del cliente
    expect((await call('GET', '/me/plan', client)).body.plan).toBeNull();
  });

  it('modifica la proposta e la assegna: il cliente la vede come piano del personal trainer', async () => {
    const draft = (await call('POST', `/trainer/clients/${linkId}/plan/draft`, pt.token, { day: DAY })).body;
    const sessions = draft.sessions.map((s: any) => ({
      title: s.title.replace('Total body', 'Forza'),
      day: s.day,
      exercises: s.exercises.slice(0, 3).map((e: any) => ({ exerciseId: e.exerciseId, sets: 5, reps: 5, loadKg: e.loadable ? 50 : null, restSeconds: 180 })),
    }));
    const saved = await call('PUT', `/trainer/clients/${linkId}/plan`, pt.token, { note: 'Partiamo con carichi medi.\nTecnica prima di tutto.', sessions });
    expect(saved.status).toBe(200);
    const plan = (await call('GET', '/me/plan', client)).body.plan;
    expect(plan).toMatchObject({ author: 'trainer', trainerName: 'Luca Verdi', rationale: ['Partiamo con carichi medi.', 'Tecnica prima di tutto.'] });
    expect(plan.sessions.map((s: any) => s.title)).toEqual(['Forza A', 'Forza B']);
    const detail = (await call('GET', `/me/sessions/${plan.sessions[0].id}`, client)).body;
    expect(detail.exercises).toHaveLength(3);
    expect(detail.exercises[0]).toMatchObject({ targetSets: 5, targetReps: 5, restSeconds: 180 });
    // il personal trainer rilegge il piano nell'editor
    const editor = (await call('GET', `/trainer/clients/${linkId}/plan`, pt.token)).body;
    expect(editor).toMatchObject({ author: 'trainer', note: 'Partiamo con carichi medi.\nTecnica prima di tutto.' });
    expect(editor.sessions[0].exercises[0].sets).toBe(5);
  });

  it('rifiuta piani non validi e accessi di altri personal trainer', async () => {
    const bad = { sessions: [{ title: 'X', day: DAY, exercises: [{ exerciseId: '00000000-0000-4000-8000-000000000000', sets: 3, reps: 10, restSeconds: 60 }] }] };
    expect((await call('PUT', `/trainer/clients/${linkId}/plan`, pt.token, bad)).body.error.code).toBe('exercise_invalid');
    expect((await call('PUT', `/trainer/clients/${linkId}/plan`, pt.token, { sessions: [] })).status).toBe(422);
    const other = await approvedTrainer(env, { email: 'pt2@example.com' });
    expect((await call('GET', `/trainer/clients/${linkId}/report`, other.token)).status).toBe(404);
    expect((await call('PUT', `/trainer/clients/${linkId}/plan`, other.token, bad)).status).toBe(404);
    expect((await call('GET', `/trainer/clients/${linkId}/report`, client)).status).toBe(403);
  });

  it('il report mostra sedute, forza e rischio del cliente', async () => {
    const plan = (await call('GET', '/me/plan', client)).body.plan;
    const detail = (await call('GET', `/me/sessions/${plan.sessions[0].id}`, client)).body;
    const loadable = detail.exercises.find((e: any) => e.exercise.loadable);
    for (const n of [1, 2, 3, 4, 5]) await call('PUT', `/me/sessions/${detail.id}/sets`, client, { sessionExerciseId: loadable.id, setNumber: n, reps: 5, loadKg: 50 });
    await call('POST', `/me/sessions/${detail.id}/complete`, client, { perceivedEffort: 6 });
    const report = (await call('GET', `/trainer/clients/${linkId}/report`, pt.token)).body;
    expect(report.client).toMatchObject({ firstName: 'Nora', lastName: 'Fabbri' });
    expect(report.profile).toMatchObject({ goal: 'strength', weightKg: 80 });
    expect(report).toMatchObject({ lastSessionDay: DAY, subscriptionStatus: 'trial', risk: { level: 'low' } });
    expect(report.sessions[0]).toMatchObject({ title: 'Forza A', sets: 5, volumeKg: 1250, perceivedEffort: 6 });
    expect(report.weeks.reduce((n: number, w: any) => n + w.sessions, 0)).toBe(1);
  });
});

describe('messaggi', () => {
  let conv: string;

  it('personal trainer e cliente si scrivono; i messaggi non letti sono contati', async () => {
    const created = await call('POST', '/conversations', pt.token, { userId: clientId });
    expect(created.status).toBe(201);
    conv = created.body.id;
    expect((await call('POST', '/conversations', pt.token, { userId: clientId })).body.id).toBe(conv); // non si duplica
    tick();
    await call('POST', `/conversations/${conv}/messages`, pt.token, { text: 'Ciao Nora, com’è andata la prima seduta?' });
    tick();
    expect((await call('GET', '/conversations/unread', client)).body.unread).toBe(1);
    const list = (await call('GET', '/conversations', client)).body.conversations;
    expect(list[0]).toMatchObject({ id: conv, unread: 1, with: { name: 'Luca Verdi', role: 'personal_trainer' }, lastMessage: { mine: false } });
    const thread = (await call('GET', `/conversations/${conv}/messages`, client)).body.messages;
    expect(thread).toHaveLength(1);
    expect((await call('GET', '/conversations/unread', client)).body.unread).toBe(0);
    tick();
    const reply = await call('POST', `/conversations/${conv}/messages`, client, { text: 'Bene! Un po’ di fatica sugli ultimi squat.' });
    expect(reply.status).toBe(201);
    expect((await call('GET', '/conversations', pt.token)).body.conversations[0]).toMatchObject({ unread: 1, with: { name: 'Nora Fabbri' } });
    expect((await call('POST', `/conversations/${conv}/messages`, client, { text: '   ' })).status).toBe(422);
  });

  it('non si può scrivere a chi non è collegato né leggere conversazioni altrui', async () => {
    const stranger = await env.api('POST', '/auth/register', userInput({ email: 'estraneo@example.com' }));
    expect((await call('POST', '/conversations', stranger.body.accessToken, { userId: clientId })).status).toBe(403);
    expect((await call('POST', '/conversations', pt.token, { userId: stranger.body.user.id })).status).toBe(403);
    expect((await call('GET', `/conversations/${conv}/messages`, stranger.body.accessToken)).status).toBe(404);
    expect((await call('POST', `/conversations/${conv}/messages`, stranger.body.accessToken, { text: 'ciao' })).status).toBe(404);
  });
});

describe('dashboard e CRM della struttura', () => {
  it('senza consenso l’iscritto resta anonimo e non si possono aprire scheda e note', async () => {
    const members = (await call('GET', '/structure/members', owner.ownerToken)).body.members;
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ sharesData: false, firstName: null, goal: null, sessions30d: null, risk: null, subscriptionStatus: 'trial' });
    expect((await call('GET', `/structure/members/${clientId}`, owner.ownerToken)).body.error.code).toBe('consent_required');
    expect((await call('POST', `/structure/members/${clientId}/notes`, owner.ownerToken, { text: 'x' })).status).toBe(403);
    // i numeri aggregati lo contano comunque
    expect((await call('GET', '/structure/overview', owner.ownerToken)).body).toMatchObject({ members: 1, activeThisWeek: 1, inTrial: 1, atRisk: 0, trainers: 0 });
  });

  it('con il consenso la struttura vede attività, obiettivo e scheda con note', async () => {
    await call('PATCH', '/me/consents', client, { share_structure: true });
    const m = (await call('GET', '/structure/members', owner.ownerToken)).body.members[0];
    expect(m).toMatchObject({ sharesData: true, firstName: 'Nora', goal: 'strength', sessions30d: 1, lastSessionDay: DAY, trainer: 'Luca Verdi', risk: { level: 'low' } });
    expect((await call('POST', `/structure/members/${clientId}/notes`, owner.ownerToken, { text: 'Interessata al corso di pilates' })).status).toBe(201);
    const detail = (await call('GET', `/structure/members/${clientId}`, owner.ownerToken)).body;
    expect(detail.notes[0]).toMatchObject({ text: 'Interessata al corso di pilates', author: 'Marco Bianchi' });
    expect(detail.report.sessions).toHaveLength(1);
  });

  it('la struttura scrive agli iscritti, a mano o per gruppo', async () => {
    expect((await call('POST', '/structure/messages', owner.ownerToken, { text: 'Ciao' })).body.error.code).toBe('recipients_missing');
    tick();
    const sent = await call('POST', '/structure/messages', owner.ownerToken, { text: 'Sabato open day: porta un amico!', segment: 'all' });
    expect(sent.body.sent).toBe(1);
    const inbox = (await call('GET', '/conversations', client)).body.conversations;
    const fromGym = inbox.find((c: any) => c.with.role === 'owner');
    expect(fromGym).toMatchObject({ unread: 1, with: { name: 'Fit Bari' }, lastMessage: { text: 'Sabato open day: porta un amico!' } });
    expect((await call('POST', '/structure/messages', owner.ownerToken, { text: 'Solo a rischio', segment: 'at_risk' })).body.sent).toBe(0);
  });

  it('dopo settimane senza allenarsi scatta l’alert, con motivo e azione suggerita', async () => {
    at('2026-12-06T09:00:00Z');
    const alerts = (await call('GET', '/structure/alerts', owner.ownerToken)).body;
    expect(alerts.anonymousAtRisk).toBe(0);
    expect(alerts.alerts).toHaveLength(1);
    expect(alerts.alerts[0].risk.level).toBe('high');
    expect(alerts.alerts[0].risk.reasons).toEqual(expect.arrayContaining(['Nessuna seduta da 22 giorni', 'Non apre l’app da 22 giorni']));
    expect(alerts.alerts[0].risk.suggestion).toBeTruthy();
    expect((await call('GET', '/structure/overview', owner.ownerToken)).body).toMatchObject({ atRisk: 1, activeThisWeek: 0 });
    expect((await call('GET', '/trainer/clients', pt.token)).body.clients[0].risk.level).toBe('high');
    // campagna di riattivazione agli iscritti a rischio
    expect((await call('POST', '/structure/messages', owner.ownerToken, { text: 'Ti aspettiamo: prenota una seduta di ripartenza.', segment: 'at_risk' })).body.sent).toBe(1);
    // chi revoca il consenso torna anonimo: l'alert diventa solo un numero
    await call('PATCH', '/me/consents', (await env.api('POST', '/auth/login', { email: 'cliente@example.com', password: PASSWORD })).body.accessToken, { share_structure: false });
    expect((await call('GET', '/structure/alerts', owner.ownerToken)).body).toMatchObject({ alerts: [], anonymousAtRisk: 1 });
  });

  it('finita la prova il cliente legge i messaggi ma per rispondere serve Premium', async () => {
    const login = (await env.api('POST', '/auth/login', { email: 'cliente@example.com', password: PASSWORD })).body.accessToken;
    const inbox = (await call('GET', '/conversations', login)).body.conversations;
    expect(inbox.length).toBe(2);
    expect((await call('GET', `/conversations/${inbox[0].id}/messages`, login)).status).toBe(200);
    expect((await call('POST', `/conversations/${inbox[0].id}/messages`, login, { text: 'Arrivo!' })).body.error.code).toBe('premium_required');
  });

  it('report mensile, anche in CSV', async () => {
    const report = (await call('GET', '/structure/report?months=3', owner.ownerToken)).body.months;
    expect(report.map((m: any) => m.month)).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(report[1]).toMatchObject({ newMembers: 1, activeMembers: 1, sessions: 1, trialsStarted: 1, retentionPct: null });
    expect(report[2]).toMatchObject({ activeMembers: 0, sessions: 0, retentionPct: 0 });
    const csv = await env.app.inject({ method: 'GET', url: '/structure/report.csv?months=3', headers: { authorization: `Bearer ${owner.ownerToken}` } });
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('Mese;Nuovi iscritti;Iscritti attivi');
    expect(csv.body).toContain('2026-11;1;1;1;1;');
    expect((await call('GET', '/structure/report', pt.token)).status).toBe(403);
  });

  it('attività dei personal trainer collegati alla struttura', async () => {
    await call('POST', '/trainer/structures', pt.token, { code: owner.code });
    await call('POST', `/structure/trainers/${pt.id}/accept`, owner.ownerToken, {});
    const res = (await call('GET', '/structure/trainers/activity', owner.ownerToken)).body.trainers;
    expect(res).toEqual([{ trainerId: pt.id, name: 'Luca Verdi', clients: 1, sessions30d: 1, clientsAtRisk: 1 }]);
  });
});
