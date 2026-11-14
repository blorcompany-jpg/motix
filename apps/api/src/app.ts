import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { registerAuth } from './auth';
import type { AppCtx } from './context';
import { AppError } from './lib/errors';
import { adminRoutes } from './modules/admin';
import { authRoutes } from './modules/auth';
import { meRoutes } from './modules/me';
import { publicRoutes } from './modules/public';
import { structureRoutes } from './modules/structure';
import { trainerRoutes } from './modules/trainer';
import { trainingRoutes } from './modules/training';
import { wellbeingRoutes } from './modules/wellbeing';

export async function buildApp(ctx: AppCtx, opts: { logger?: boolean; rateLimit?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true });
  app.decorate('ctx', ctx);

  await app.register(helmet);
  await app.register(cors, {
    origin: ctx.config.corsOrigins,
    credentials: true,
    // Senza questo elenco il browser blocca PUT, PATCH e DELETE.
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  if (opts.rateLimit !== false) await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });

  app.setErrorHandler((err: Error & { statusCode?: number; validation?: unknown }, req, reply) => {
    if (err instanceof AppError)
      return reply.code(err.status).send({ error: { code: err.code, message: err.message, fields: err.fields } });
    if (err.statusCode === 429)
      return reply.code(429).send({ error: { code: 'too_many_requests', message: 'Troppe richieste: riprova tra poco' } });
    if (err.statusCode && err.statusCode < 500)
      return reply.code(err.statusCode).send({ error: { code: 'bad_request', message: 'Richiesta non valida' } });
    req.log.error(err);
    return reply.code(500).send({ error: { code: 'internal_error', message: 'Si è verificato un errore: riprova' } });
  });
  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).send({ error: { code: 'not_found', message: 'Risorsa non trovata' } }),
  );

  registerAuth(app);
  await app.register(publicRoutes);
  await app.register(authRoutes);
  await app.register(meRoutes);
  await app.register(trainingRoutes);
  await app.register(wellbeingRoutes);
  await app.register(trainerRoutes);
  await app.register(structureRoutes);
  await app.register(adminRoutes);
  return app;
}
