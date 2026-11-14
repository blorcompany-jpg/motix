import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Db;
  migrate: () => Promise<void>;
  close: () => Promise<void>;
}

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

/**
 * Apre il database.
 * - `postgres://…`  → PostgreSQL (produzione e sviluppo con Docker)
 * - `pglite:memory` → PostgreSQL in memoria (test automatici)
 * - `pglite:./cartella` → PostgreSQL su file locale, senza installare nulla
 */
export async function openDb(url: string): Promise<DbHandle> {
  if (url.startsWith('pglite:')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    const target = url.slice('pglite:'.length);
    let client;
    if (target === 'memory') client = new PGlite();
    else {
      const dir = resolve(target);
      mkdirSync(dirname(dir), { recursive: true });
      client = new PGlite(dir);
    }
    const db = drizzle(client, { schema });
    return {
      db: db as unknown as Db,
      migrate: () => migrate(db, { migrationsFolder }),
      close: () => client.close(),
    };
  }
  const pg = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  const pool = new pg.default.Pool({ connectionString: url, max: 10 });
  const db = drizzle(pool, { schema });
  return {
    db: db as unknown as Db,
    migrate: () => migrate(db, { migrationsFolder }),
    close: () => pool.end(),
  };
}

export { schema };
