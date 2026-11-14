import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { codeSchema } from '@motix/shared';
import { structures, trainers, users } from '../db/schema';
import { notFound, parse } from '../lib/errors';

/** Dati pubblici minimi, per confermare un codice prima di registrarsi. */
export async function publicRoutes(app: FastifyInstance) {
  const { db } = app.ctx;
  const limited = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

  app.get('/health', async () => ({ ok: true, service: 'motix-api' }));

  app.get('/public/structures/:code', limited, async (req) => {
    const { code } = parse(codeSchema, req.params);
    const [s] = await db
      .select()
      .from(structures)
      .where(and(eq(structures.code, code), eq(structures.status, 'approved')))
      .limit(1);
    if (!s) throw notFound('Codice della struttura non valido');
    return { displayName: s.displayName, city: s.city, type: s.type };
  });

  app.get('/public/trainers/:code', limited, async (req) => {
    const { code } = parse(codeSchema, req.params);
    const [row] = await db
      .select({ t: trainers, u: users })
      .from(trainers)
      .innerJoin(users, eq(users.id, trainers.userId))
      .where(and(eq(trainers.inviteCode, code), eq(trainers.status, 'approved')))
      .limit(1);
    if (!row) throw notFound('Codice del personal trainer non valido');
    return { firstName: row.u.firstName, lastName: row.u.lastName, specializations: row.t.specializations };
  });
}
