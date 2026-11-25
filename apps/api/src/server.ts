import { resolve } from 'node:path';
import { buildApp } from './app';
import { loadConfig } from './config';
import { openDb } from './db/client';
import { createAiClient } from './lib/ai';
import { DevMailer } from './lib/mailer';
import { LocalStorage } from './lib/storage';
import { demoHome, seedDemo, seedDemoProfessionals } from './services/demo';
import { runAutomations } from './services/automations';
import { ensureExerciseLibrary, ensureFoodLibrary, ensureShopCatalog } from './services/library';

const config = loadConfig();
const handle = await openDb(config.databaseUrl);
await handle.migrate();
await ensureExerciseLibrary(handle.db);
await ensureShopCatalog(handle.db);
await ensureFoodLibrary(handle.db);

// L'orologio si sposta solo mentre si creano i dati di esempio dell'ambiente di prova.
let clockOffsetMs = 0;
const ctx = {
  db: handle.db,
  config,
  // TODO produzione: sostituire con un servizio di invio email con server in UE.
  mailer: new DevMailer((msg) => console.log(msg)),
  // TODO produzione: archivio a oggetti con CDN in UE al posto del disco locale.
  storage: new LocalStorage(config.mediaDir),
  ai: createAiClient(config),
  now: () => new Date(Date.now() + clockOffsetMs),
};
const hosted = config.webDist && config.appDist ? { webDir: resolve(config.webDist), appDir: resolve(config.appDist), home: demoHome(Boolean(config.demoPassword)) } : undefined;
const app = await buildApp(ctx, { logger: true, hosted });

await app.listen({ port: config.port, host: '0.0.0.0' });

if (config.demoPassword) {
  // Il motore AI parte insieme al server: lo si aspetta qualche secondo, così le sedute di esempio hanno i dati del sensore.
  if (config.aiUrl)
    for (let i = 0; i < 60; i++) {
      const up = await fetch(`${config.aiUrl}/health`).then((r) => r.ok).catch(() => false);
      if (up) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
  const created = await seedDemo(app, ctx, config.demoPassword, hosted ? '/api' : '', (ms) => (clockOffsetMs = ms)).catch((e) => {
    app.log.error(e);
    return false;
  });
  app.log.info(created ? 'Dati di esempio creati' : 'Dati di esempio già presenti o non creati');
  const extra = await seedDemoProfessionals(app, ctx, config.demoPassword, hosted ? '/api' : '').catch((e) => {
    app.log.error(e);
    return false;
  });
  if (extra) app.log.info('Dati di esempio dei professionisti creati');
}

// Messaggi automatici dei professionisti: controllo ogni ora. Ogni messaggio parte una volta sola.
const automations = setInterval(() => {
  runAutomations(ctx)
    .then((r) => r.sent && app.log.info(`Messaggi automatici inviati: ${r.sent}`))
    .catch((e) => app.log.error(e));
}, 60 * 60 * 1000);
automations.unref();

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, async () => {
    await app.close();
    await handle.close();
    process.exit(0);
  });
