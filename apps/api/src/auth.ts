import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Role } from '@motix/shared';
import { users } from './db/schema';
import { forbidden, unauthorized } from './lib/errors';
import { verifyAccessToken } from './lib/tokens';

/** Legge il token dall'intestazione Authorization e carica ruolo e stato dell'utente. */
export function registerAuth(app: FastifyInstance) {
  app.decorateRequest('auth', null);
  app.addHook('onRequest', async (req) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return;
    const claims = await verifyAccessToken(app.ctx.config, header.slice(7));
    if (!claims) return;
    const [u] = await app.ctx.db
      .select({ id: users.id, role: users.role, status: users.status })
      .from(users)
      .where(eq(users.id, claims.sub))
      .limit(1);
    if (!u || u.status !== 'active') return;
    req.auth = { userId: u.id, role: u.role, status: u.status };
  });
}

export function requireAuth(req: FastifyRequest) {
  if (!req.auth) throw unauthorized('Accedi per continuare');
  return req.auth;
}

export function requireRole(req: FastifyRequest, ...roles: Role[]) {
  const auth = requireAuth(req);
  if (!roles.includes(auth.role)) throw forbidden();
  return auth;
}
