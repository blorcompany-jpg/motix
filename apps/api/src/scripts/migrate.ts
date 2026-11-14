import { loadConfig } from '../config';
import { openDb } from '../db/client';

const handle = await openDb(loadConfig().databaseUrl);
await handle.migrate();
await handle.close();
console.log('Database aggiornato.');
