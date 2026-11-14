import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MemoryStorage } from '../src/lib/storage';
import { PASSWORD, approvedStructure, approvedTrainer, createEnv, userInput, type TestEnv } from './helpers';

let env: TestEnv;
let structure: { ownerToken: string; id: string; code: string };
let pt: { token: string; id: string; code: string };
const U: Record<string, { token: string; id: string }> = {};
const call = (m: string, url: string, token: string, body?: unknown) => env.api(m, url, body, token);
const tick = () => (env.clock.now = new Date(env.clock.now.getTime() + 60_000));

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(200, 7)]);

async function upload(token: string | null, data: Buffer, filename = 'file.bin') {
  const boundary = '----motixtest';
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await env.app.inject({
    method: 'POST',
    url: '/media',
    payload,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  return { status: res.statusCode, body: JSON.parse(res.body) };
}

beforeAll(async () => {
  env = await createEnv();
  structure = await approvedStructure(env);
  pt = await approvedTrainer(env);
  const mk = async (key: string, over: Record<string, unknown>) => {
    const r = await env.api('POST', '/auth/register', userInput({ email: `${key}@example.com`, firstName: key[0]!.toUpperCase() + key.slice(1), lastName: 'Rossi', ...over }));
    U[key] = { token: r.body.accessToken, id: r.body.user.id };
  };
  await mk('anna', { structureCode: structure.code, trainerCode: pt.code });
  await mk('bruno', { structureCode: structure.code });
  await mk('carla', {});
  await mk('dino', {});
});
afterAll(async () => { await env.close(); });

describe('caricamento di foto e video', () => {
  it('riconosce il tipo dai byte del file e rifiuta gli altri formati', async () => {
    const img = await upload(U.anna!.token, PNG, 'foto.png');
    expect(img.status).toBe(201);
    expect(img.body).toMatchObject({ type: 'image' });
    expect(img.body.url).toMatch(/^http:\/\/localhost:4000\/media\/[a-f0-9-]+\.png$/);
    expect((await upload(U.anna!.token, MP4, 'video.mov')).body.type).toBe('video');
    // un file di testo rinominato in .png non passa
    expect((await upload(U.anna!.token, Buffer.from('questo non è un’immagine, davvero'), 'finta.png')).body.error.code).toBe('file_type');
    expect((await upload(null, PNG)).status).toBe(401);
  });

  it('distribuisce i file anche a intervalli, per riprodurre i video', async () => {
    const { body } = await upload(U.anna!.token, MP4);
    const path = new URL(body.url).pathname;
    const full = await env.app.inject({ method: 'GET', url: path });
    expect(full.statusCode).toBe(200);
    expect(full.headers['content-type']).toBe('video/mp4');
    expect(full.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(full.rawPayload.length).toBe(MP4.length);
    const part = await env.app.inject({ method: 'GET', url: path, headers: { range: 'bytes=4-11' } });
    expect(part.statusCode).toBe(206);
    expect(part.headers['content-range']).toBe(`bytes 4-11/${MP4.length}`);
    expect(part.rawPayload.toString()).toBe('ftypisom');
    expect((await env.app.inject({ method: 'GET', url: '/media/non-esiste.png' })).statusCode).toBe(404);
  });
});

describe('feed, like e commenti', () => {
  let postId: string;

  it('con il profilo privato si pubblica solo nella propria struttura', async () => {
    const img = (await upload(U.anna!.token, PNG)).body;
    const post = await call('POST', '/community/posts', U.anna!.token, { text: 'Prima seduta fatta!', mediaId: img.id, visibility: 'structure' });
    expect(post.status).toBe(201);
    expect(post.body).toMatchObject({ author: { name: 'Anna R.', structure: 'Fit Bari' }, media: { type: 'image' }, likes: 0, mine: true });
    postId = post.body.id;
    expect((await call('POST', '/community/posts', U.anna!.token, { text: 'Ciao a tutti', visibility: 'global' })).body.error.code).toBe('profile_private');
    expect((await call('POST', '/community/posts', U.carla!.token, { text: 'x', visibility: 'structure' })).body.error.code).toBe('no_structure');
    expect((await call('POST', '/community/posts', U.anna!.token, { visibility: 'structure' })).status).toBe(422);
    // un file caricato da un altro non si può usare
    expect((await call('POST', '/community/posts', U.bruno!.token, { mediaId: img.id, visibility: 'structure' })).body.error.code).toBe('media_invalid');
  });

  it('il feed della struttura lo vedono solo gli iscritti; quello generale tutti', async () => {
    await call('PATCH', '/me', U.anna!.token, { profileVisibility: 'public' });
    tick();
    const global = await call('POST', '/community/posts', U.anna!.token, { text: 'Ciao a tutti', visibility: 'global' });
    expect(global.body.author.name).toBe('Anna Rossi');
    const forBruno = (await call('GET', '/community/feed?scope=structure', U.bruno!.token)).body.posts;
    expect(forBruno.map((p: any) => p.text)).toEqual(['Ciao a tutti', 'Prima seduta fatta!']);
    expect((await call('GET', '/community/feed?scope=structure', U.carla!.token)).body.posts).toEqual([]);
    expect((await call('GET', '/community/feed?scope=global', U.carla!.token)).body.posts.map((p: any) => p.text)).toEqual(['Ciao a tutti']);
    // chi è fuori dalla struttura non può mettere like al post interno
    expect((await call('PUT', `/community/posts/${postId}/like`, U.carla!.token)).status).toBe(404);
    expect((await call('GET', '/community/feed', structure.ownerToken)).status).toBe(403);
  });

  it('like, commenti ed eliminazione', async () => {
    expect((await call('PUT', `/community/posts/${postId}/like`, U.bruno!.token)).body).toMatchObject({ likes: 1, liked: true });
    expect((await call('PUT', `/community/posts/${postId}/like`, U.bruno!.token)).body.likes).toBe(1); // non si conta due volte
    expect((await call('DELETE', `/community/posts/${postId}/like`, U.bruno!.token)).body).toMatchObject({ likes: 0, liked: false });
    const c = await call('POST', `/community/posts/${postId}/comments`, U.bruno!.token, { text: 'Grande!' });
    expect(c.body.comments[0]).toMatchObject({ text: 'Grande!', author: { name: 'Bruno R.' }, mine: true });
    expect((await call('GET', `/community/posts/${postId}/comments`, U.anna!.token)).body.post.comments).toBe(1);
    expect((await call('DELETE', `/community/comments/${c.body.comments[0].id}`, U.anna!.token)).status).toBe(404);
    expect((await call('DELETE', `/community/comments/${c.body.comments[0].id}`, U.bruno!.token)).status).toBe(200);
    expect((await call('DELETE', `/community/posts/${postId}`, U.bruno!.token)).status).toBe(404);
  });
});

describe('profili, blocchi, classifica e chat tra iscritti', () => {
  it('un profilo privato mostra solo il nome abbreviato', async () => {
    const priv = (await call('GET', `/community/profiles/${U.bruno!.id}`, U.anna!.token)).body;
    expect(priv).toMatchObject({ name: 'Bruno R.', private: true, stats: null, posts: [] });
    const pub = (await call('GET', `/community/profiles/${U.anna!.id}`, U.carla!.token)).body;
    expect(pub).toMatchObject({ name: 'Anna Rossi', private: false, structure: 'Fit Bari', stats: { sessions: 0 } });
    expect(pub.posts.map((p: any) => p.text)).toEqual(['Ciao a tutti']); // il post interno alla struttura resta nascosto a chi è fuori
    const trainer = (await call('GET', `/community/profiles/${(await call('GET', '/community/trainers?q=postur', U.carla!.token)).body.trainers[0].userId}`, U.carla!.token)).body;
    expect(trainer).toMatchObject({ name: 'Luca Verdi', role: 'personal_trainer', trainer: { specializations: ['Forza', 'Posturale'] } });
    expect((await call('GET', '/community/trainers?q=yoga', U.carla!.token)).body.trainers).toEqual([]);
  });

  it('chi blocca non vede più l’altro, e viceversa', async () => {
    await call('PUT', `/community/blocks/${U.anna!.id}`, U.carla!.token);
    expect((await call('GET', '/community/feed?scope=global', U.carla!.token)).body.posts).toEqual([]);
    expect((await call('GET', `/community/profiles/${U.carla!.id}`, U.anna!.token)).status).toBe(404);
    expect((await call('GET', '/community/blocks', U.carla!.token)).body.blocked).toEqual([{ id: U.anna!.id, name: 'Anna Rossi' }]);
    await call('DELETE', `/community/blocks/${U.anna!.id}`, U.carla!.token);
    expect((await call('GET', '/community/feed?scope=global', U.carla!.token)).body.posts).toHaveLength(1);
  });

  it('si chatta solo tra profili pubblici', async () => {
    expect((await call('POST', '/conversations', U.anna!.token, { userId: U.bruno!.id })).status).toBe(403);
    await call('PATCH', '/me', U.carla!.token, { profileVisibility: 'public' });
    const conv = await call('POST', '/conversations', U.carla!.token, { userId: U.anna!.id });
    expect(conv.status).toBe(201);
    tick();
    expect((await call('POST', `/conversations/${conv.body.id}/messages`, U.carla!.token, { text: 'Ciao Anna!' })).status).toBe(201);
    await call('PUT', `/community/blocks/${U.carla!.id}`, U.anna!.token);
    expect((await call('POST', `/conversations/${conv.body.id}/messages`, U.carla!.token, { text: 'Ci sei?' })).body.error.code).toBe('link_closed');
    await call('DELETE', `/community/blocks/${U.carla!.id}`, U.anna!.token);
  });

  it('in classifica compaiono solo i profili pubblici della struttura, più chi guarda', async () => {
    const ex = (await call('GET', '/exercises?q=plank', U.anna!.token)).body.exercises[0];
    for (const who of ['anna', 'bruno'] as const) {
      const s = await call('POST', '/me/sessions', U[who]!.token, { day: '2026-11-14', exerciseIds: [ex.id] });
      await call('POST', `/me/sessions/${s.body.id}/complete`, U[who]!.token, { perceivedEffort: 5 });
    }
    const forAnna = (await call('GET', '/community/leaderboard?period=week', U.anna!.token)).body;
    expect(forAnna).toMatchObject({ structure: 'Fit Bari' });
    expect(forAnna.rows).toEqual([{ rank: 1, userId: U.anna!.id, name: 'Anna Rossi', sessions: 1, me: true }]); // Bruno ha il profilo privato
    const forBruno = (await call('GET', '/community/leaderboard', U.bruno!.token)).body.rows;
    expect(forBruno.map((r: any) => r.name)).toEqual(['Anna Rossi', 'Bruno R.']);
    expect(forBruno.every((r: any) => r.rank === 1)).toBe(true);
    expect((await call('GET', '/community/leaderboard', U.carla!.token)).body.rows).toEqual([]);
  });
});

describe('segnalazioni e moderazione', () => {
  it('dopo tre segnalazioni il post viene nascosto in attesa di BTECH, che può ripristinarlo o rimuoverlo', async () => {
    const post = (await call('POST', '/community/posts', U.anna!.token, { text: 'Post discusso', visibility: 'global' })).body;
    for (const who of ['bruno', 'carla'] as const) await call('POST', '/community/reports', U[who]!.token, { targetType: 'post', targetId: post.id, reason: 'Spam o pubblicità' });
    await call('POST', '/community/reports', U.bruno!.token, { targetType: 'post', targetId: post.id, reason: 'Spam o pubblicità' }); // la stessa persona conta una volta
    expect((await call('GET', '/community/feed', U.dino!.token)).body.posts.some((p: any) => p.id === post.id)).toBe(true);
    await call('POST', '/community/reports', U.dino!.token, { targetType: 'post', targetId: post.id, reason: 'Altro motivo' });
    expect((await call('GET', '/community/feed', U.dino!.token)).body.posts.some((p: any) => p.id === post.id)).toBe(false);

    const queue = (await call('GET', '/admin/reports', env.adminToken)).body.reports;
    expect(queue).toHaveLength(3);
    expect(queue[0]).toMatchObject({ targetType: 'post', author: { name: 'Anna Rossi' }, content: { text: 'Post discusso' } });
    expect((await call('GET', '/admin/reports', U.anna!.token)).status).toBe(403);

    expect((await call('POST', `/admin/reports/${queue[0].id}/dismiss`, env.adminToken)).body.outcome).toBe('dismissed');
    expect((await call('GET', '/admin/reports', env.adminToken)).body.reports).toHaveLength(0); // chiuse tutte insieme
    expect((await call('GET', '/community/feed', U.dino!.token)).body.posts.some((p: any) => p.id === post.id)).toBe(true);

    await call('POST', '/community/reports', U.dino!.token, { targetType: 'post', targetId: post.id, reason: 'Contenuto offensivo' });
    const again = (await call('GET', '/admin/reports', env.adminToken)).body.reports[0];
    await call('POST', `/admin/reports/${again.id}/remove`, env.adminToken);
    expect((await call('GET', '/community/feed', U.dino!.token)).body.posts.some((p: any) => p.id === post.id)).toBe(false);
  });

  it('nei casi gravi BTECH sospende l’autore', async () => {
    await call('PATCH', '/me', U.dino!.token, { profileVisibility: 'public' });
    const post = (await call('POST', '/community/posts', U.dino!.token, { text: 'Contenuto inaccettabile', visibility: 'global' })).body;
    await call('POST', '/community/reports', U.anna!.token, { targetType: 'post', targetId: post.id, reason: 'Molestie o bullismo' });
    const r = (await call('GET', '/admin/reports', env.adminToken)).body.reports[0];
    expect((await call('POST', `/admin/reports/${r.id}/suspend`, env.adminToken)).body.outcome).toBe('suspended');
    expect((await call('GET', '/me', U.dino!.token)).status).toBe(401);
    expect((await env.api('POST', '/auth/login', { email: 'dino@example.com', password: PASSWORD })).body.error.code).toBe('account_suspended');
  });
});

describe('shop by BLOR', () => {
  it('ogni voce apre il sito BLOR con il codice della struttura o del personal trainer', async () => {
    const products = (await call('GET', '/shop/products', U.anna!.token)).body.products;
    expect(products.map((p: any) => p.category)).toEqual(['sensor', 'equipment', 'apparel', 'accessories']);
    const open = await call('POST', `/shop/products/${products[2].id}/open`, U.anna!.token);
    expect(open.body.url).toBe(`https://blorcompany.com/prodotti/Abbigliamento?utm_source=motix&utm_medium=app&ref=${structure.code}`);
    expect((await call('POST', `/shop/products/${products[1].id}/open`, pt.token)).body.url).toContain(`ref=${pt.code}`);
    expect((await call('POST', `/shop/products/${products[1].id}/open`, U.carla!.token)).body.url).not.toContain('ref=');
  });

  it('BTECH gestisce il catalogo, solo con link al sito BLOR', async () => {
    const bad = await call('POST', '/admin/shop/products', env.adminToken, { name: 'Trappola', category: 'apparel', blorUrl: 'https://blorcompany.com.sito-finto.example/x' });
    expect(bad.status).toBe(422);
    const ok = await call('POST', '/admin/shop/products', env.adminToken, { name: 'Bumper plates', category: 'equipment', blorUrl: 'https://blorcompany.com/scheda/51/0/competition-colored-bumper-plates', position: 5 });
    expect(ok.status).toBe(201);
    const item = ok.body.products.find((p: any) => p.name === 'Bumper plates');
    await call('PUT', `/admin/shop/products/${item.id}`, env.adminToken, { name: 'Bumper plates', category: 'equipment', blorUrl: item.blorUrl, position: 5, visible: false });
    expect((await call('GET', '/shop/products', U.anna!.token)).body.products).toHaveLength(4);
    expect((await call('POST', '/admin/shop/products', U.anna!.token, {})).status).toBe(403);
  });
});

describe('video dei personal trainer', () => {
  it('i video per i clienti sono subito visibili e compaiono nell’esercizio corrispondente', async () => {
    const video = (await upload(pt.token, MP4)).body;
    const ex = (await call('GET', '/exercises?q=plank', pt.token)).body.exercises[0];
    expect((await call('POST', '/trainer/videos', pt.token, { title: 'Foto', mediaId: (await upload(pt.token, PNG)).body.id, visibility: 'clients' })).body.error.code).toBe('media_invalid');
    const saved = await call('POST', '/trainer/videos', pt.token, { title: 'Plank: la mia tecnica', mediaId: video.id, visibility: 'clients', exerciseId: ex.id });
    expect(saved.body.videos[0]).toMatchObject({ title: 'Plank: la mia tecnica', reviewStatus: 'approved', exercise: 'Plank' });
    expect((await call('GET', '/me/trainer-videos', U.anna!.token)).body.videos).toHaveLength(1);
    expect((await call('GET', '/me/trainer-videos', U.bruno!.token)).body.videos).toEqual([]); // Bruno non è suo cliente
    const s = await call('POST', '/me/sessions', U.anna!.token, { day: '2026-11-14', exerciseIds: [ex.id] });
    expect(s.body.exercises[0].exercise.videoUrl).toBe(video.url);
    const sBruno = await call('POST', '/me/sessions', U.bruno!.token, { day: '2026-11-14', exerciseIds: [ex.id] });
    expect(sBruno.body.exercises[0].exercise.videoUrl).toBeNull();
  });

  it('i video per tutta la community passano dalla revisione di BTECH', async () => {
    const video = (await upload(pt.token, MP4)).body;
    await call('POST', '/trainer/videos', pt.token, { title: 'Riscaldamento spalle', mediaId: video.id, visibility: 'community' });
    expect((await call('GET', '/community/trainer-videos', U.carla!.token)).body.videos).toEqual([]);
    const queue = (await call('GET', '/admin/trainer-videos', env.adminToken)).body.videos;
    expect(queue).toHaveLength(1);
    await call('POST', `/admin/trainer-videos/${queue[0].id}/approve`, env.adminToken);
    expect((await call('GET', '/community/trainer-videos', U.carla!.token)).body.videos[0]).toMatchObject({ title: 'Riscaldamento spalle', trainerName: 'Luca Verdi' });
  });
});

describe('punti e premi del personal trainer', () => {
  it('i punti arrivano quando il cliente si abbona, non durante la prova', async () => {
    expect((await call('GET', '/trainer/points', pt.token)).body).toMatchObject({ balance: 0, rules: { subscription: 100, renewal: 50 }, movements: [] });
    const res = await call('POST', `/admin/users/${U.anna!.id}/subscription/activate`, env.adminToken);
    expect(res.body).toEqual({ trainerId: pt.id, points: 100 });
    expect((await call('GET', '/me/subscription', U.anna!.token)).body).toMatchObject({ status: 'active', premium: true, installmentsPaid: 1 });
    const points = (await call('GET', '/trainer/points', pt.token)).body;
    expect(points.balance).toBe(100);
    expect(points.movements[0]).toMatchObject({ reason: 'subscription', points: 100, balanceAfter: 100 });
    expect((await call('POST', `/admin/users/${U.anna!.id}/subscription/activate`, env.adminToken)).status).toBe(409);
    // un cliente senza personal trainer non assegna punti a nessuno
    expect((await call('POST', `/admin/users/${U.bruno!.id}/subscription/activate`, env.adminToken)).body).toEqual({ trainerId: null, points: 0 });
  });

  it('BTECH cambia il valore dei punti e gestisce il catalogo dei premi', async () => {
    await call('PUT', '/admin/points/rules', env.adminToken, { subscription: 100, renewal: 80 });
    tick();
    expect((await call('POST', `/admin/users/${U.anna!.id}/subscription/renew`, env.adminToken)).body.points).toBe(80);
    const state = await call('POST', '/admin/rewards', env.adminToken, { name: 'Sensore motix pod', pointsRequired: 150, stock: 1 });
    expect(state.body.rewards).toHaveLength(1);
    await call('POST', '/admin/rewards', env.adminToken, { name: 'Buono shop BLOR da 50 €', pointsRequired: 500 });
    expect((await call('GET', '/trainer/points', pt.token)).body).toMatchObject({ balance: 180, rewards: [{ name: 'Sensore motix pod', available: true }, { name: 'Buono shop BLOR da 50 €' }] });
  });

  it('il riscatto scala i punti; se BTECH rifiuta, tornano indietro', async () => {
    const catalog = (await call('GET', '/trainer/points', pt.token)).body.rewards;
    expect((await call('POST', `/trainer/rewards/${catalog[1].id}/redeem`, pt.token)).body.error.code).toBe('points_insufficient');
    tick();
    const redeemed = await call('POST', `/trainer/rewards/${catalog[0].id}/redeem`, pt.token);
    expect(redeemed.status).toBe(201);
    expect(redeemed.body).toMatchObject({ balance: 30, redemptions: [{ reward: 'Sensore motix pod', status: 'requested', points: 150 }] });
    expect(redeemed.body.rewards[0].available).toBe(false); // era l'ultimo pezzo
    const pending = (await call('GET', '/admin/rewards', env.adminToken)).body.redemptions[0];
    expect(pending).toMatchObject({ trainer: 'Luca Verdi', status: 'requested' });
    tick();
    await call('POST', `/admin/redemptions/${pending.id}/reject`, env.adminToken);
    const after = (await call('GET', '/trainer/points', pt.token)).body;
    expect(after).toMatchObject({ balance: 180, redemptions: [{ status: 'rejected' }] });
    expect(after.rewards[0].available).toBe(true);
    expect((await call('POST', `/admin/redemptions/${pending.id}/deliver`, env.adminToken)).status).toBe(409);
    // bonus manuale di BTECH
    expect((await call('POST', `/admin/trainers/${pt.id}/points`, env.adminToken, { points: 20, note: 'Bonus pilot' })).body.balance).toBe(200);
    expect((await call('POST', `/admin/trainers/${pt.id}/points`, env.adminToken, { points: -500, note: 'Rettifica' })).body.error.code).toBe('points_insufficient');
    expect((await call('GET', '/trainer/points', U.anna!.token)).status).toBe(403);
  });
});

describe('cancellazione dell’account', () => {
  it('rimuove anche i file caricati', async () => {
    const storage = env.app.ctx.storage as MemoryStorage;
    const { body } = await upload(U.carla!.token, PNG);
    const key = new URL(body.url).pathname.split('/').pop()!;
    expect(storage.files.has(key)).toBe(true);
    await call('DELETE', '/me', U.carla!.token);
    expect(storage.files.has(key)).toBe(false);
    expect((await env.app.inject({ method: 'GET', url: `/media/${key}` })).statusCode).toBe(404);
  });
});
