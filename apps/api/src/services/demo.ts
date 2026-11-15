/**
 * Dati di esempio per l'ambiente di prova: quattro accessi (BTECH, struttura, personal trainer, utente)
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
