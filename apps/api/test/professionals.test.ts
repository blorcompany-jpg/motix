import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD, approvedStructure, approvedTrainer, createEnv, trainerInput, userInput, type TestEnv } from './helpers';

let env: TestEnv;
let gym: { ownerToken: string; id: string; code: string };
let pt: { token: string; id: string; code: string };
let nutri: { token: string; id: string; code: string };
let client: { token: string; id: string };
let ptLink: string;
let nutriLink: string;
const DAY = '2026-11-14';
const call = (m: string, url: string, token: string, body?: unknown) => env.api(m, url, body, token);
const tick = () => (env.clock.now = new Date(env.clock.now.getTime() + 60_000));
const at = (iso: string) => (env.clock.now = new Date(iso));

const nutritionistInput = trainerInput({
  email: 'nutri@example.com',
  firstName: 'Sara',
  lastName: 'Neri',
  profession: 'nutritionist',
  city: 'Bari',
  registerName: 'Ordine dei Biologi',
  registerNumber: 'AA_123456',
  specializations: ['Sport'],
});

beforeAll(async () => {
  env = await createEnv();
  gym = await approvedStructure(env);
  pt = await approvedTrainer(env, { city: 'Bari', bio: 'Forza e ricomposizione corporea' });
  nutri = await approvedTrainer(env, nutritionistInput);
  const reg = await env.api('POST', '/auth/register', userInput({ email: 'cliente@example.com', firstName: 'Nora', lastName: 'Fabbri', structureCode: gym.code, trainerCode: pt.code }));
  client = { token: reg.body.accessToken, id: reg.body.user.id };
  await call('PATCH', '/me/consents', client.token, { share_trainer: true });
  ptLink = (await call('GET', '/trainer/clients', pt.token)).body.clients[0].linkId;
});
afterAll(async () => {
  await env.close();
});

describe('professioni e albo', () => {
  it('nutrizionisti e fisioterapisti devono indicare albo e numero di iscrizione', async () => {
    const res = await env.api('POST', '/auth/register/trainer', trainerInput({ email: 'fisio@example.com', profession: 'physiotherapist' }));
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.fields)).toEqual(expect.arrayContaining(['registerName', 'registerNumber']));
  });

  it('il nutrizionista prescrive diete solo dopo la verifica dell’albo da parte di BTECH', async () => {
    const me = (await call('GET', '/me', nutri.token)).body.trainer;
    expect(me).toMatchObject({ profession: 'nutritionist', registerVerified: false, canPrescribeNutrition: false });
    const list = (await call('GET', '/admin/trainers?status=approved', env.adminToken)).body.trainers;
    expect(list.find((t: any) => t.id === nutri.id)).toMatchObject({ registerRequired: true, registerVerified: false, registerNumber: 'AA_123456' });
    expect((await call('PUT', `/admin/trainers/${nutri.id}/register`, env.adminToken, { verified: true })).body).toEqual({ id: nutri.id, registerVerified: true });
    expect((await call('GET', '/me', nutri.token)).body.trainer.canPrescribeNutrition).toBe(true);
    // il personal trainer non ha un albo da verificare e non può prescrivere diete
    expect((await call('GET', '/me', pt.token)).body.trainer).toMatchObject({ profession: 'personal_trainer', canPrescribeNutrition: false });
  });

  it('cambiare il numero di iscrizione richiede una nuova verifica', async () => {
    await call('PATCH', '/trainer', nutri.token, { registerNumber: 'AA_999999' });
    expect((await call('GET', '/trainer', nutri.token)).body).toMatchObject({ registerVerified: false, canPrescribeNutrition: false });
    await call('PUT', `/admin/trainers/${nutri.id}/register`, env.adminToken, { verified: true });
  });

  it('un utente può avere un professionista per l’allenamento e uno per l’alimentazione, non due personal trainer', async () => {
    const other = await approvedTrainer(env, { email: 'pt2@example.com', firstName: 'Ugo' });
    expect((await call('POST', '/me/trainer-links', client.token, { code: other.code })).body.error.code).toBe('trainer_already_linked');
    const linked = await call('POST', '/me/trainer-links', client.token, { code: nutri.code });
    expect(linked.status).toBe(201);
    expect(linked.body.links.map((l: any) => l.profession).sort()).toEqual(['nutritionist', 'personal_trainer']);
    nutriLink = (await call('GET', '/trainer/clients', nutri.token)).body.clients[0].linkId;
  });
});

describe('vetrina dei professionisti', () => {
  it('mostra i professionisti approvati con profilo pubblico e albo verificato, filtrabili', async () => {
    const all = (await env.api('GET', '/public/professionals')).body.professionals;
    expect(all.map((p: any) => p.name)).toEqual(expect.arrayContaining(['Luca Verdi', 'Sara Neri']));
    const n = (await env.api('GET', '/public/professionals?profession=nutritionist&city=bar')).body.professionals;
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ name: 'Sara Neri', verified: true, clients: 1, profession: 'nutritionist' });
    const profile = (await env.api('GET', `/public/professionals/${pt.id}`)).body;
    expect(profile).toMatchObject({ name: 'Luca Verdi', city: 'Bari', videos: [], clients: 1 });
    // senza verifica dell'albo il nutrizionista sparisce dalla vetrina
    await call('PUT', `/admin/trainers/${nutri.id}/register`, env.adminToken, { verified: false });
    expect((await env.api('GET', '/public/professionals?profession=nutritionist')).body.professionals).toHaveLength(0);
    await call('PUT', `/admin/trainers/${nutri.id}/register`, env.adminToken, { verified: true });
  });
});

describe('template delle schede', () => {
  let exercise: { id: string; loadable: boolean };
  let templateId: string;

  it('il professionista salva un template e lo assegna al cliente dal giorno scelto', async () => {
    const lib = (await call('GET', '/exercises', pt.token)).body.exercises;
    exercise = lib.find((e: any) => e.loadable);
    const bodyweight = lib.find((e: any) => !e.loadable);
    const created = await call('POST', '/trainer/templates', pt.token, {
      name: 'Forza base 2 giorni',
      note: 'Tecnica prima di tutto.',
      sessions: [
        { title: 'Giorno B', dayOffset: 3, exercises: [{ exerciseId: bodyweight.id, sets: 3, reps: 12, loadKg: 20, restSeconds: 60 }] },
        { title: 'Giorno A', dayOffset: 0, exercises: [{ exerciseId: exercise.id, sets: 5, reps: 5, loadKg: 60, restSeconds: 180 }] },
      ],
    });
    expect(created.status).toBe(201);
    const tpl = created.body.templates[0];
    templateId = tpl.id;
    // sedute in ordine e niente carico sugli esercizi a corpo libero
    expect(tpl.sessions.map((s: any) => s.title)).toEqual(['Giorno A', 'Giorno B']);
    expect(tpl.sessions[1].exercises[0].loadKg).toBeNull();

    expect((await call('POST', `/trainer/clients/${ptLink}/plan/template`, pt.token, { templateId, startDay: DAY })).body).toEqual({ ok: true });
    const plan = (await call('GET', '/me/plan', client.token)).body.plan;
    expect(plan).toMatchObject({ author: 'trainer', trainerName: 'Luca Verdi', rationale: ['Tecnica prima di tutto.'] });
    expect(plan.sessions.map((s: any) => s.scheduledDate)).toEqual(['2026-11-14', '2026-11-17']);
  });

  it('un altro professionista non vede né usa i template altrui', async () => {
    expect((await call('GET', '/trainer/templates', nutri.token)).body.templates).toEqual([]);
    expect((await call('POST', `/trainer/clients/${nutriLink}/plan/template`, nutri.token, { templateId, startDay: DAY })).status).toBe(404);
    expect((await call('DELETE', `/trainer/templates/${templateId}`, nutri.token)).body.templates).toEqual([]);
    expect((await call('GET', '/trainer/templates', pt.token)).body.templates).toHaveLength(1);
  });

  it('i carichi registrati finiscono nello storico per esercizio, visibile anche al professionista', async () => {
    const plan = (await call('GET', '/me/plan', client.token)).body.plan;
    const session = (await call('GET', `/me/sessions/${plan.sessions[0].id}`, client.token)).body;
    const se = session.exercises[0];
    await call('PUT', `/me/sessions/${session.id}/sets`, client.token, { sessionExerciseId: se.id, setNumber: 1, reps: 5, loadKg: 60 });
    await call('PUT', `/me/sessions/${session.id}/sets`, client.token, { sessionExerciseId: se.id, setNumber: 2, reps: 5, loadKg: 62.5 });
    const history = (await call('GET', `/me/exercises/${exercise.id}/history`, client.token)).body;
    expect(history).toMatchObject({ bestKg: 62.5, points: [{ day: DAY, bestKg: 62.5, sets: 2, volumeKg: 612.5 }] });
    expect((await call('GET', '/me/exercises/records', client.token)).body.records[0]).toMatchObject({ exerciseId: exercise.id, bestKg: 62.5, sessions: 1 });
    expect((await call('GET', `/trainer/clients/${ptLink}/exercises/${exercise.id}`, pt.token)).body.bestKg).toBe(62.5);
  });
});

describe('check-in periodici', () => {
  it('il professionista chiede un check-in ogni 7 giorni; il cliente lo invia e riceve il commento', async () => {
    expect((await call('GET', '/me/check-ins', client.token)).body).toEqual({ checkIns: [], everyDays: null, nextDue: null });
    await call('PUT', `/trainer/clients/${ptLink}/check-in-frequency`, pt.token, { everyDays: 7 });
    expect((await call('GET', '/me/check-ins', client.token)).body).toMatchObject({ everyDays: 7, nextDue: DAY });

    const sent = await call('POST', '/me/check-ins', client.token, { day: DAY, weightKg: 72.4, energy: 4, sleep: 3, training: 5, notes: 'Settimana buona' });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ nextDue: '2026-11-21', checkIns: [{ day: DAY, weightKg: 72.4, energy: 4, comment: null }] });

    const seen = (await call('GET', `/trainer/clients/${ptLink}/check-ins`, pt.token)).body;
    expect(seen).toMatchObject({ myEveryDays: 7, checkIns: [{ notes: 'Settimana buona' }] });
    const commented = await call('POST', `/trainer/clients/${ptLink}/check-ins/${seen.checkIns[0].id}/comment`, pt.token, { comment: 'Ottimo, aumentiamo i carichi.' });
    expect(commented.body.checkIns[0]).toMatchObject({ comment: 'Ottimo, aumentiamo i carichi.', commentBy: 'Luca Verdi' });
    // un secondo invio nello stesso giorno aggiorna quello esistente
    await call('POST', '/me/check-ins', client.token, { day: DAY, weightKg: 72.2 });
    expect((await call('GET', '/me/check-ins', client.token)).body.checkIns).toHaveLength(1);
  });

  it('le foto devono essere dell’utente', async () => {
    const res = await call('POST', '/me/check-ins', client.token, { day: DAY, photoIds: ['00000000-0000-4000-8000-000000000000'] });
    expect(res.body.error.code).toBe('photo_invalid');
  });
});

describe('app salute', () => {
  it('i dati di Apple Salute arrivano al professionista che ha il consenso', async () => {
    const res = await call('POST', '/me/health', client.token, {
      source: 'apple_health',
      days: [
        { day: '2026-11-13', steps: 8200, sleepMinutes: 410, restingHr: 58 },
        { day: DAY, steps: 3100 },
      ],
    });
    expect(res.body.days).toHaveLength(2);
    await call('POST', '/me/health', client.token, { source: 'apple_health', days: [{ day: DAY, steps: 9000 }] });
    const seen = (await call('GET', `/trainer/clients/${ptLink}/health`, pt.token)).body.days;
    expect(seen.at(-1)).toMatchObject({ day: DAY, steps: 9000, source: 'apple_health' });
    expect((await call('POST', '/me/health', client.token, { source: 'apple_health', days: [{ day: '2026-09-01', steps: 1 }] })).body.error.code).toBe('day_invalid');
  });
});

describe('alimentazione', () => {
  let foods: any[];
  const plan = () => ({
    title: 'Piano ricomposizione',
    notes: 'Bevi almeno 2 litri d’acqua.',
    days: [
      {
        name: 'Giorno tipo',
        meals: [
          { meal: 'breakfast', time: '07:30', items: [{ foodId: foods.find((f) => f.name === 'Fiocchi d’avena').id, grams: 50 }], alternatives: [[{ foodId: foods.find((f) => f.name === 'Fette biscottate').id, grams: 40 }]] },
          { meal: 'lunch', items: [{ foodId: foods.find((f) => f.name === 'Pasta di semola').id, grams: 80 }, { foodId: foods.find((f) => f.name === 'Petto di pollo').id, grams: 150 }] },
        ],
      },
    ],
  });

  it('la libreria degli alimenti è disponibile e si può cercare', async () => {
    foods = (await call('GET', '/foods', nutri.token)).body.foods;
    expect(foods.length).toBeGreaterThan(40);
    expect((await call('GET', '/foods?q=pollo', client.token)).body.foods[0]).toMatchObject({ name: 'Petto di pollo', kcal: 100, protein: 23.3 });
  });

  it('il personal trainer non può prescrivere un piano alimentare', async () => {
    expect((await call('PUT', `/trainer/clients/${ptLink}/meal-plan`, pt.token, plan())).body.error.code).toBe('nutrition_reserved');
  });

  it('il nutrizionista assegna il piano: calorie e macro sono calcolati, il cliente lo vede', async () => {
    const saved = await call('PUT', `/trainer/clients/${nutriLink}/meal-plan`, nutri.token, plan());
    expect(saved.status).toBe(200);
    const day = saved.body.plan.days[0];
    // 50 g di avena = 186 kcal; 80 g di pasta + 150 g di pollo = 282 + 150 kcal
    expect(day.meals[0]).toMatchObject({ meal: 'breakfast', time: '07:30', totals: { kcal: 186 } });
    expect(day.meals[0].alternatives[0].totals.kcal).toBe(164);
    expect(day.meals[1].totals).toMatchObject({ kcal: 432, protein: 45.4 });
    expect(day.totals.kcal).toBe(618);
    const mine = (await call('GET', '/me/meal-plan', client.token)).body.plan;
    expect(mine).toMatchObject({ title: 'Piano ricomposizione', nutritionist: 'Sara Neri' });
  });

  it('alimenti personalizzati del nutrizionista e diario del cliente con l’obiettivo del piano', async () => {
    const custom = await call('POST', '/trainer/foods', nutri.token, { name: 'Pancake proteico della casa', category: 'other', kcal: 210, protein: 20, carbs: 22, fat: 4 });
    expect(custom.body).toMatchObject({ custom: true });
    // il cliente del nutrizionista vede l'alimento, un altro professionista no
    expect((await call('GET', '/foods?q=pancake', client.token)).body.foods).toHaveLength(1);
    expect((await call('GET', '/foods?q=pancake', pt.token)).body.foods).toHaveLength(0);
    const logged = await call('POST', '/me/food-diary', client.token, { day: DAY, meal: 'breakfast', foodId: custom.body.id, grams: 100 });
    expect(logged.status).toBe(201);
    expect(logged.body).toMatchObject({ totals: { kcal: 210 }, target: { kcal: 618 } });
    expect((await call('GET', `/trainer/clients/${nutriLink}/food-diary?day=${DAY}`, nutri.token)).body.entries).toHaveLength(1);
    const removed = await call('DELETE', `/me/food-diary/${logged.body.entries[0].id}`, client.token);
    expect(removed.body.entries).toEqual([]);
  });
});

describe('messaggi automatici', () => {
  it('partono solo se accesi, dalla chat del professionista, e una volta sola', async () => {
    expect((await call('POST', '/admin/automations/run', env.adminToken)).body).toEqual({ sent: 0 });
    const list = (await call('GET', '/trainer/automations', pt.token)).body.automations;
    expect(list.every((a: any) => !a.enabled)).toBe(true);
    await call('PUT', '/trainer/automations', pt.token, { kind: 'welcome', enabled: true, text: 'Ciao {nome}, benvenuta nel team!' });
    await call('PUT', '/trainer/automations', pt.token, { kind: 'check_in_reminder', enabled: true, text: 'Ciao {nome}, tocca al check-in.' });
    expect((await call('POST', '/admin/automations/run', env.adminToken)).body).toEqual({ sent: 1 });
    expect((await call('POST', '/admin/automations/run', env.adminToken)).body).toEqual({ sent: 0 });

    // una settimana dopo il check-in è scaduto: arriva il promemoria
    at('2026-11-22T09:00:00Z');
    expect((await call('POST', '/admin/automations/run', env.adminToken)).body).toEqual({ sent: 1 });
    const convs = (await call('GET', '/conversations', client.token)).body.conversations;
    const thread = (await call('GET', `/conversations/${convs[0].id}/messages`, client.token)).body.messages;
    expect(thread.map((m: any) => m.text)).toEqual(['Ciao Nora, benvenuta nel team!', 'Ciao Nora, tocca al check-in.']);
    at('2026-11-14T12:00:00Z');
  });
});

describe('pacchetti di abbonamenti per le palestre', () => {
  it('la palestra richiede un pacchetto, BTECH conferma il pagamento e la palestra regala un abbonamento', async () => {
    const reg = await env.api('POST', '/auth/register', userInput({ email: 'iscritto@example.com', firstName: 'Ivo', structureCode: gym.code, trainerCode: pt.code }));
    const member = reg.body.user.id as string;
    expect((await call('POST', '/structure/packages', gym.ownerToken, { seats: 5 })).body.error.code).toBe('seats_too_few');
    const asked = await call('POST', '/structure/packages', gym.ownerToken, { seats: 10 });
    expect(asked.body.packages[0]).toMatchObject({ seats: 10, unitPriceEur: 39.99, totalEur: 399.9, status: 'requested' });
    expect((await call('POST', '/structure/packages/assign', gym.ownerToken, { userId: member })).body.error.code).toBe('no_seats');

    const pkg = (await call('GET', '/admin/packages', env.adminToken)).body.packages[0];
    expect((await call('POST', `/admin/packages/${pkg.id}/confirm`, env.adminToken)).body.status).toBe('paid');
    const before = (await call('GET', '/trainer/points', pt.token)).body.balance;
    tick();
    const given = await call('POST', '/structure/packages/assign', gym.ownerToken, { userId: member });
    expect(given.body).toMatchObject({ seatsAvailable: 9, seats: [{ user: { name: 'Ivo Rossi' } }] });
    expect((await call('GET', '/me/subscription', reg.body.accessToken)).body).toMatchObject({ status: 'active', channel: 'structure' });
    // 20% di €39,99 = 80 punti al personal trainer che segue l'iscritto
    expect((await call('GET', '/trainer/points', pt.token)).body.balance).toBe(before + 80);
    expect((await call('POST', '/structure/packages/assign', gym.ownerToken, { userId: member })).body.error.code).toBe('already_active');
    // solo iscritti della propria palestra
    expect((await call('POST', '/structure/packages/assign', gym.ownerToken, { userId: pt.id })).status).toBe(404);
  });

  it('BTECH cambia prezzo e minimo dei pacchetti', async () => {
    await call('PUT', '/admin/packages/rules', env.adminToken, { minSeats: 20, unitPriceEur: 35 });
    expect((await call('GET', '/structure/packages', gym.ownerToken)).body.rules).toEqual({ minSeats: 20, unitPriceEur: 35, listPriceEur: 49.99 });
  });
});

void PASSWORD;
