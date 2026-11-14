import { buildApp } from './app';
import { loadConfig } from './config';
import { openDb } from './db/client';
import { DevMailer } from './lib/mailer';
import { ensureExerciseLibrary } from './services/library';

const config = loadConfig();
const handle = await openDb(config.databaseUrl);
await handle.migrate();
await ensureExerciseLibrary(handle.db);

const app = await buildApp(
  {
    db: handle.db,
    config,
    // TODO produzione: sostituire con un servizio di invio email con server in UE.
    mailer: new DevMailer((msg) => console.log(msg)),
    now: () => new Date(),
  },
  { logger: true },
);

await app.listen({ port: config.port, host: '0.0.0.0' });

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, async () => {
    await app.close();
    await handle.close();
    process.exit(0);
  });
