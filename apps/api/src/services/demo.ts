/**
 * Dati di esempio per l'ambiente di prova: cinque accessi (BTECH, struttura, personal trainer, nutrizionista, utente)
 * e un po' di attività, così ogni area ha qualcosa da mostrare.
 *
 * Si attiva solo se è impostata DEMO_PASSWORD, che diventa la password dei quattro accessi.
 * NON va mai impostata in produzione. I dati sono creati passando dalle stesse chiamate che usano app e sito.
 */
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { simulatePodSet } from '@motix/shared';
import type { AppCtx } from '../context';
import { users } from '../db/schema';
import { toDay } from '../lib/days';
import { hashPassword } from '../lib/password';

export const DEMO_ACCOUNTS = {
  admin: { email: 'admin@motix.demo', label: 'Admin BTECH', where: 'sito' },
  owner: { email: 'struttura@motix.demo', label: 'Struttura affiliata (Fit Bari)', where: 'sito' },
  trainer: { email: 'trainer@motix.demo', label: 'Personal trainer (Luca Verdi)', where: 'sito' },
  nutritionist: { email: 'nutrizionista@motix.demo', label: 'Nutrizionista (Sara Neri)', where: 'sito' },
  user: { email: 'utente@motix.demo', label: 'Utente finale (Giulia Rossi)', where: 'app' },
} as const;

const DAY = 86_400_000;

/** Crea i dati di esempio se non ci sono già. `setClock` sposta l'orologio del server per registrare attività nei giorni passati. */
export async function seedDemo(app: FastifyInstance, ctx: AppCtx, password: string, prefix: string, setClock: (offsetMs: number) => void) {
  const { db } = ctx;
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_ACCOUNTS.user.email)).limit(1);
  if (existing) return false;

  const call = async (method: string, url: string, body?: unknown, token?: string) => {
    const res = await app.inject({
      method: method as 'GET',
      url: prefix + url,
      payload: body as object | undefined,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'x-forwarded-for': `10.0.0.${1 + Math.floor(Math.random() * 250)}` },
    });
    const data = res.body ? JSON.parse(res.body) : null;
    if (res.statusCode >= 400) throw new Error(`Dati di esempio: ${method} ${url} → ${res.statusCode} ${res.body.slice(0, 200)}`);
    return data;
  };
  const daysAgo = (n: number, hour = 18) => {
    const at = new Date(Date.now() - n * DAY);
    at.setUTCHours(hour, 0, 0, 0);
    setClock(at.getTime() - Date.now());
    return toDay(at);
  };

  try {
    // Amministratore BTECH.
    const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_ACCOUNTS.admin.email)).limit(1);
    if (!admin)
      await db.insert(users).values({ email: DEMO_ACCOUNTS.admin.email, passwordHash: await hashPassword(password), firstName: 'Admin', lastName: 'BTECH', role: 'admin', emailVerifiedAt: new Date() });
    const adminToken = (await call('POST', '/auth/login', { email: DEMO_ACCOUNTS.admin.email, password })).accessToken as string;

    // Struttura e personal trainer, registrati tre settimane fa e approvati.
    daysAgo(21);
    const owner = await call('POST', '/auth/register/structure', {
      owner: { email: DEMO_ACCOUNTS.owner.email, password, firstName: 'Marco', lastName: 'Bianchi' },
      acceptTerms: true,
      structure: { legalName: 'Fit Bari SSD a r.l.', displayName: 'Fit Bari', type: 'ssd', city: 'Bari', province: 'BA', membersEstimate: 450 },
    });
    const pending = await call('GET', '/admin/structures?status=pending', undefined, adminToken);
    const structureId = pending.structures.find((s: { owner: { email: string } }) => s.owner.email === DEMO_ACCOUNTS.owner.email).id as string;
    const code = (await call('POST', `/admin/structures/${structureId}/approve`, {}, adminToken)).code as string;

    const pt = await call('POST', '/auth/register/trainer', {
      email: DEMO_ACCOUNTS.trainer.email,
      password,
      firstName: 'Luca',
      lastName: 'Verdi',
      birthDate: '1990-01-20',
      acceptTerms: true,
      specializations: ['Forza', 'Posturale'],
      bio: 'Preparatore atletico a Bari. Lavoro su forza e postura.',
    });
    await call('POST', `/admin/trainers/${pt.user.trainer.id}/approve`, {}, adminToken);
    const ptCode = pt.user.trainer.inviteCode as string;

    // Sensori: uno in magazzino (quello del simulatore) e due dati alla struttura.
    await call('POST', '/admin/sensors', { serials: ['MP-SIM001'], firmware: 'sim-1.0' }, adminToken);
    await call('POST', '/admin/sensors', { serials: ['MP-FIT0001', 'MP-FIT0002'], structureId, freeOfCharge: true }, adminToken);
    await call('POST', '/admin/rewards', { name: 'Sensore motix pod', description: 'Un sensore in omaggio per i tuoi clienti.', pointsRequired: 300 }, adminToken);
    await call('POST', '/admin/rewards', { name: 'Buono Shop by BLOR da 25 €', pointsRequired: 150 }, adminToken);

    const member = async (email: string, firstName: string, lastName: string, extra: Record<string, unknown> = {}) => {
      const reg = await call('POST', '/auth/register', {
        email,
        password,
        firstName,
        lastName,
        birthDate: '1994-05-02',
        structureCode: code,
        consents: { terms: true, health_data: true, share_structure: true, share_trainer: true, marketing: false },
        ...extra,
      });
      await call('PATCH', '/me', { profileVisibility: 'public' }, reg.accessToken);
      return { token: reg.accessToken as string, id: reg.user.id as string };
    };
    const sensorSet = async (token: string, sessionId: string, ex: { id: string; targetReps: number }, setNumber: number, sensorId: string, loadKg: number | null, tired: boolean) => {
      // Le ultime ripetizioni dell'ultima serie sono più lente, come in una serie vera.
      const repSeconds = Array.from({ length: ex.targetReps }, (_, i) => 2.2 + (tired ? Math.max(0, i - ex.targetReps * 0.5) * 0.22 : (i % 3) * 0.05));
      const signal = simulatePodSet({ reps: ex.targetReps, repSeconds, rangeM: 0.42, seed: setNumber * 97 + ex.targetReps });
      const round = (v: number) => Math.round(v * 1000) / 1000;
      await call(
        'POST',
        `/me/sessions/${sessionId}/sets/sensor`,
        { sessionExerciseId: ex.id, setNumber, sensorId, loadKg, sampleRateHz: signal.sampleRateHz, ax: signal.ax.map(round), ay: signal.ay.map(round), az: signal.az.map(round), batteryPct: 86, firmware: 'sim-1.0' },
        token,
      );
    };
    /** Esegue una seduta del piano: gli esercizi a ripetizioni con il sensore (se il motore AI risponde), gli altri a mano. */
    const train = async (token: string, sessionId: string, sensorId: string | null, loads: number[], effort: number, minutes: number) => {
      const detail = await call('POST', `/me/sessions/${sessionId}/start`, {}, token);
      let i = 0;
      for (const ex of detail.exercises) {
        const loadKg = ex.exercise.loadable ? (loads[i++ % loads.length] ?? null) : null;
        for (let n = 1; n <= ex.targetSets; n++) {
          let done = false;
          if (sensorId && ex.exercise.unit === 'reps' && ex.position <= 3) {
            try {
              await sensorSet(token, sessionId, ex, n, sensorId, loadKg, n === ex.targetSets);
              done = true;
            } catch (e) {
              app.log.warn(String(e));
              sensorId = null;
            }
          }
          if (!done) await call('PUT', `/me/sessions/${sessionId}/sets`, { sessionExerciseId: ex.id, setNumber: n, reps: ex.targetReps, loadKg }, token);
        }
      }
      setClock(ctx.now().getTime() + minutes * 60_000 - Date.now());
      await call('POST', `/me/sessions/${sessionId}/complete`, { perceivedEffort: effort }, token);
    };

    /* ---------- L'utente della prova: Giulia, cliente di Luca, iscritta a Fit Bari ---------- */
    let day = daysAgo(9);
    const giulia = await member(DEMO_ACCOUNTS.user.email, 'Giulia', 'Rossi', { trainerCode: ptCode });
    await call('PUT', '/me/profile', { sex: 'female', weightKg: 62, heightCm: 168, goal: 'tone', level: 'intermediate', daysPerWeek: 3, equipment: ['dumbbells', 'bench', 'barbell'], limitations: [] }, giulia.token);
    await call('POST', `/admin/users/${giulia.id}/subscription/activate`, {}, adminToken);
    const paired = await call('POST', '/me/sensors/pair', { serial: 'MP-SIM001' }, giulia.token);
    const podId = paired.sensors.find((s: { serial: string }) => s.serial === 'MP-SIM001').id as string;
    const plan = (await call('POST', '/me/plan/generate', { day }, giulia.token)).plan;

    await train(giulia.token, plan.sessions[0].id, podId, [30, 10, 12, 20], 7, 52);
    for (const c of ['bottle_05', 'bottle_05', 'glass', 'bottle_1']) await call('POST', '/me/hydration', { day, container: c }, giulia.token);
    const post = await call('POST', '/community/posts', { text: 'Prima seduta con il sensore: 12 ripetizioni contate da sole. Si parte!', visibility: 'structure' }, giulia.token);

    day = daysAgo(7);
    await train(giulia.token, plan.sessions[1].id, podId, [22.5, 10, 12, 20], 6, 47);
    for (const c of ['bottle_05', 'bottle_1', 'glass']) await call('POST', '/me/hydration', { day, container: c }, giulia.token);
    await call('POST', '/me/measurements', { day, weightKg: 61.6 }, giulia.token);

    day = daysAgo(5);
    await train(giulia.token, plan.sessions[2].id, podId, [30, 10, 12, 20], 7, 50);
    for (const c of ['bottle_1', 'bottle_05', 'bottle_05', 'glass', 'glass']) await call('POST', '/me/hydration', { day, container: c }, giulia.token);

    // Messaggi con il personal trainer.
    const ptToken = pt.accessToken as string;
    const chat = await call('POST', '/conversations', { userId: giulia.id }, ptToken);
    await call('POST', `/conversations/${chat.id}/messages`, { text: 'Ciao Giulia, ho visto le prime sedute: ottimo ritmo. Sulla panca tieni i 30 kg ancora una settimana.' }, ptToken);
    daysAgo(4, 9);
    await call('POST', `/conversations/${chat.id}/messages`, { text: 'Perfetto, grazie Luca! Le ultime ripetizioni erano dure.' }, giulia.token);

    /* ---------- Altri iscritti, per riempire dashboard e community ---------- */
    daysAgo(16);
    const anna = await member('anna@motix.demo', 'Anna', 'Greco');
    await call('PUT', '/me/profile', { sex: 'female', weightKg: 58, heightCm: 164, goal: 'health', level: 'beginner', daysPerWeek: 2, equipment: [], limitations: [] }, anna.token);
    await call('POST', `/admin/users/${anna.id}/subscription/activate`, {}, adminToken);
    for (const ago of [14, 11, 6, 2]) {
      const d = daysAgo(ago);
      const p = (await call('POST', '/me/plan/generate', { day: d }, anna.token)).plan;
      await train(anna.token, p.sessions[0].id, null, [], 5, 35);
    }
    await call('POST', '/community/posts', { text: 'Quarta seduta del mese fatta. Chi viene domani alle 18?', visibility: 'structure' }, anna.token);
    await call('PUT', `/community/posts/${post.id}/like`, {}, anna.token);
    await call('POST', `/community/posts/${post.id}/comments`, { text: 'Brava Giulia! Lo voglio provare anch’io.' }, anna.token);

    // Paolo si è iscritto e ha smesso: compare tra gli iscritti a rischio.
    daysAgo(20);
    const paolo = await member('paolo@motix.demo', 'Paolo', 'Leone');
    await call('PUT', '/me/profile', { sex: 'male', weightKg: 84, heightCm: 180, goal: 'lose_weight', level: 'beginner', daysPerWeek: 3, equipment: [], limitations: ['lower_back'] }, paolo.token);
    const first = (await call('POST', '/me/plan/generate', { day: daysAgo(19) }, paolo.token)).plan;
    await train(paolo.token, first.sessions[0].id, null, [], 9, 30);

    // Una segnalazione di guasto aperta, da vedere nel registro dei sensori.
    daysAgo(1, 10);
    const gym = (await call('GET', '/structure/sensors', undefined, owner.accessToken)).sensors;
    await call('POST', `/structure/sensors/${gym[1].id}/issues`, { note: 'Si scarica in meno di un’ora anche dopo la ricarica completa.' }, owner.accessToken);
    return true;
  } finally {
    setClock(0);
  }
}

/**
 * Seconda parte dei dati di esempio, aggiunta con le funzioni per i professionisti: nutrizionista con piano alimentare,
 * template, check-in, app salute, messaggi automatici e un pacchetto della palestra.
 * Gira anche su un ambiente già popolato: si ferma se la nutrizionista di esempio esiste già.
 */
export async function seedDemoProfessionals(app: FastifyInstance, ctx: AppCtx, password: string, prefix: string) {
  const { db } = ctx;
  const [done] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_ACCOUNTS.nutritionist.email)).limit(1);
  const [giuliaRow] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_ACCOUNTS.user.email)).limit(1);
  if (done || !giuliaRow) return false;
  const call = async (method: string, url: string, body?: unknown, token?: string) => {
    const res = await app.inject({
      method: method as 'GET',
      url: prefix + url,
      payload: body as object | undefined,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'x-forwarded-for': `10.0.1.${1 + Math.floor(Math.random() * 250)}` },
    });
    const data = res.body ? JSON.parse(res.body) : null;
    if (res.statusCode >= 400) throw new Error(`Dati di esempio: ${method} ${url} → ${res.statusCode} ${res.body.slice(0, 200)}`);
    return data;
  };
  const login = async (email: string) => (await call('POST', '/auth/login', { email, password })).accessToken as string;
  const adminToken = await login(DEMO_ACCOUNTS.admin.email);
  const ptToken = await login(DEMO_ACCOUNTS.trainer.email);
  const ownerToken = await login(DEMO_ACCOUNTS.owner.email);
  const giulia = await login(DEMO_ACCOUNTS.user.email);
  const today = toDay(ctx.now());
  const ago = (n: number) => toDay(new Date(ctx.now().getTime() - n * DAY));

  // Nutrizionista con albo verificato, collegata a Giulia.
  const nutri = await call('POST', '/auth/register/trainer', {
    email: DEMO_ACCOUNTS.nutritionist.email,
    password,
    firstName: 'Sara',
    lastName: 'Neri',
    birthDate: '1988-03-11',
    acceptTerms: true,
    profession: 'nutritionist',
    city: 'Bari',
    registerName: 'Ordine Nazionale dei Biologi',
    registerNumber: 'DEMO-000000',
    specializations: ['Nutrizione sportiva', 'Ricomposizione corporea'],
    bio: 'Biologa nutrizionista. Piani alimentari per chi si allena, senza rinunce inutili.',
  });
  const nutriId = nutri.user.trainer.id as string;
  await call('POST', `/admin/trainers/${nutriId}/approve`, {}, adminToken);
  await call('PUT', `/admin/trainers/${nutriId}/register`, { verified: true }, adminToken);
  await call('PATCH', '/trainer', { city: 'Bari' }, ptToken);
  await call('POST', '/me/trainer-links', { code: nutri.user.trainer.inviteCode }, giulia);
  const nutriToken = nutri.accessToken as string;
  const nutriLink = (await call('GET', '/trainer/clients', undefined, nutriToken)).clients[0].linkId as string;
  const foods = (await call('GET', '/foods', undefined, nutriToken)).foods as Array<{ id: string; name: string }>;
  const f = (name: string) => foods.find((x) => x.name === name)!.id;
  await call(
    'PUT',
    `/trainer/clients/${nutriLink}/meal-plan`,
    {
      title: 'Tonificazione · giorno di allenamento',
      notes: 'Nei giorni di allenamento aggiungi una banana prima della seduta. Bevi almeno 2 litri d’acqua.',
      days: [
        {
          name: 'Giorno di allenamento',
          meals: [
            { meal: 'breakfast', time: '07:30', items: [{ foodId: f('Yogurt greco 0%'), grams: 170 }, { foodId: f('Fiocchi d’avena'), grams: 40 }, { foodId: f('Frutti di bosco'), grams: 100 }], alternatives: [[{ foodId: f('Latte parzialmente scremato'), grams: 200 }, { foodId: f('Fette biscottate'), grams: 30 }, { foodId: f('Marmellata'), grams: 20 }]] },
            { meal: 'snack_am', items: [{ foodId: f('Mela'), grams: 150 }, { foodId: f('Mandorle'), grams: 15 }], alternatives: [] },
            { meal: 'lunch', time: '13:00', items: [{ foodId: f('Pasta integrale'), grams: 80 }, { foodId: f('Petto di pollo'), grams: 120 }, { foodId: f('Zucchine'), grams: 200 }, { foodId: f('Olio extravergine d’oliva'), grams: 10 }], alternatives: [[{ foodId: f('Riso integrale'), grams: 80 }, { foodId: f('Tonno al naturale, sgocciolato'), grams: 100 }, { foodId: f('Pomodori'), grams: 200 }, { foodId: f('Olio extravergine d’oliva'), grams: 10 }]] },
            { meal: 'snack_pm', time: '17:00', items: [{ foodId: f('Banana'), grams: 120 }], alternatives: [] },
            { meal: 'dinner', time: '20:30', items: [{ foodId: f('Salmone fresco'), grams: 130 }, { foodId: f('Patate'), grams: 200 }, { foodId: f('Insalata (lattuga)'), grams: 100 }, { foodId: f('Olio extravergine d’oliva'), grams: 10 }], alternatives: [[{ foodId: f('Uova intere'), grams: 120 }, { foodId: f('Pane integrale'), grams: 60 }, { foodId: f('Spinaci'), grams: 200 }, { foodId: f('Olio extravergine d’oliva'), grams: 10 }]] },
          ],
        },
      ],
    },
    nutriToken,
  );
  for (const [meal, food, grams] of [['breakfast', 'Yogurt greco 0%', 170], ['breakfast', 'Fiocchi d’avena', 40], ['lunch', 'Pasta integrale', 80], ['lunch', 'Petto di pollo', 120]] as const)
    await call('POST', '/me/food-diary', { day: today, meal, foodId: f(food), grams }, giulia);

  // Template del personal trainer, check-in settimanali e messaggi automatici.
  const ptLink = (await call('GET', '/trainer/clients', undefined, ptToken)).clients.find((c: { client: { firstName: string } }) => c.client.firstName === 'Giulia').linkId as string;
  const lib = (await call('GET', '/exercises', undefined, ptToken)).exercises as Array<{ id: string; name: string; loadable: boolean }>;
  const pick = (n: number, loadable: boolean) => lib.filter((e) => e.loadable === loadable).slice(0, n);
  const [a, b, c, d] = pick(4, true);
  const [core] = pick(1, false);
  await call(
    'POST',
    '/trainer/templates',
    {
      name: 'Tonificazione 3 giorni · principianti',
      note: 'Carichi moderati, tecnica pulita. Recuperi completi.',
      sessions: [
        { title: 'Total body A', dayOffset: 0, exercises: [{ exerciseId: a!.id, sets: 3, reps: 12, loadKg: 20, restSeconds: 90 }, { exerciseId: core!.id, sets: 3, reps: 30, restSeconds: 45 }] },
        { title: 'Total body B', dayOffset: 2, exercises: [{ exerciseId: b!.id, sets: 3, reps: 12, loadKg: 10, restSeconds: 90 }, { exerciseId: c!.id, sets: 3, reps: 12, loadKg: 12, restSeconds: 90 }] },
        { title: 'Total body C', dayOffset: 4, exercises: [{ exerciseId: d!.id, sets: 3, reps: 10, loadKg: 20, restSeconds: 120 }] },
      ],
    },
    ptToken,
  );
  await call('PUT', `/trainer/clients/${ptLink}/check-in-frequency`, { everyDays: 7 }, ptToken);
  await call('POST', '/me/check-ins', { day: ago(1), weightKg: 61.4, waistCm: 70, energy: 4, sleep: 3, stress: 2, training: 5, nutrition: 4, notes: 'Bene! Un po’ stanca a fine settimana.' }, giulia);
  const checks = (await call('GET', `/trainer/clients/${ptLink}/check-ins`, undefined, ptToken)).checkIns;
  await call('POST', `/trainer/clients/${ptLink}/check-ins/${checks[0].id}/comment`, { comment: 'Ottimo lavoro Giulia. Questa settimana aggiungiamo 2 kg sulla panca.' }, ptToken);
  await call('PUT', '/trainer/automations', { kind: 'welcome', enabled: true, text: 'Ciao {nome}, benvenuta! Da oggi ti seguo su MOTIX: trovi qui il tuo piano.' }, ptToken);
  await call('PUT', '/trainer/automations', { kind: 'check_in_reminder', enabled: true, text: 'Ciao {nome}, è il momento del check-in settimanale: bastano due minuti.' }, ptToken);

  // Dati di una settimana come se arrivassero da Apple Salute.
  await call(
    'POST',
    '/me/health',
    { source: 'apple_health', days: Array.from({ length: 7 }, (_, i) => ({ day: ago(6 - i), steps: [6400, 9100, 7300, 11200, 5800, 8600, 4200][i], sleepMinutes: [410, 385, 440, 395, 420, 460, 400][i], restingHr: [61, 60, 60, 59, 61, 58, 59][i], activeKcal: [320, 480, 350, 560, 290, 430, 210][i] })) },
    giulia,
  );

  // Pacchetto di 10 abbonamenti per Fit Bari, già pagato: uno regalato a Paolo.
  await call('POST', '/structure/packages', { seats: 10 }, ownerToken);
  const pkg = (await call('GET', '/admin/packages', undefined, adminToken)).packages[0];
  await call('POST', `/admin/packages/${pkg.id}/confirm`, {}, adminToken);
  const [paolo] = await db.select({ id: users.id }).from(users).where(eq(users.email, 'paolo@motix.demo')).limit(1);
  if (paolo) await call('POST', '/structure/packages/assign', { userId: paolo.id }, ownerToken);
  return true;
}

/** Pagina iniziale dell'ambiente di prova: i due ingressi e gli accessi di esempio. */
export function demoHome(demo: boolean) {
  const rows = Object.values(DEMO_ACCOUNTS)
    .map((a) => `<tr><td>${a.label}</td><td><code>${a.email}</code></td><td><a href="/${a.where}/">${a.where === 'app' ? 'App' : 'Sito'}</a></td></tr>`)
    .join('');
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MOTIX · ambiente di prova</title>
<style>
body{margin:0;background:#0B1220;color:#EEF3FA;font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:720px;margin:0 auto;padding:40px 16px}
h1{font-size:34px;margin:0 0 4px}h1 span{color:#B5E853}p{color:#A9B7CC}
.cards{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));margin:24px 0}
.cards a{display:block;background:#13203A;border:1px solid #24365A;border-radius:18px;padding:20px;color:#EEF3FA;text-decoration:none}
.cards a:hover,.cards a:focus{border-color:#38D3EE}.cards b{display:block;font-size:20px;margin-bottom:4px}.cards small{color:#A9B7CC}
table{width:100%;border-collapse:collapse;background:#13203A;border:1px solid #24365A;border-radius:18px;overflow:hidden}
td{padding:12px 14px;border-top:1px solid #24365A;font-size:15px}tr:first-child td{border-top:0}
code{color:#38D3EE;word-break:break-all}td a{color:#B5E853}.wrap{overflow-x:auto}
</style></head><body><main>
<h1>moti<span>x</span></h1>
<p>Ambiente di prova. I dati sono di esempio e possono essere azzerati in qualsiasi momento.</p>
<div class="cards">
<a href="/app/"><b>App</b><small>Per chi si allena. Dal telefono si vede come sarà sugli store.</small></a>
<a href="/sito/"><b>Sito</b><small>Dashboard della struttura, area personal trainer, pannello BTECH.</small></a>
</div>
${demo ? `<h2>Accessi di esempio</h2><p>La password è la stessa per tutti: quella scelta quando è stato creato l’ambiente.</p><div class="wrap"><table>${rows}</table></div>
<p>Nell’app il sensore motix pod è simulato: si chiama MP-SIM001 ed è già abbinato all’utente di esempio.</p>` : ''}
</main></body></html>`;
}
