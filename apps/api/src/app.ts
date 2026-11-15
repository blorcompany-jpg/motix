import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { registerAuth } from './auth';
import type { AppCtx } from './context';
import { AppError } from './lib/errors';
import { adminRoutes } from './modules/admin';
import { authRoutes } from './modules/auth';
import { backofficeRoutes } from './modules/backoffice';
import { coachingRoutes } from './modules/coaching';
import { commerceRoutes } from './modules/commerce';
import { communityRoutes } from './modules/community';
import { crmRoutes } from './modules/crm';
import { messageRoutes } from './modules/messages';
import { meRoutes } from './modules/me';
import { mediaRoutes } from './modules/media';
import { publicRoutes } from './modules/public';
import { sensorRoutes } from './modules/sensors';
import { structureRoutes } from './modules/structure';
import { trainerRoutes } from './modules/trainer';
import { trainingRoutes } from './modules/training';
import { wellbeingRoutes } from './modules/wellbeing';

export interface AppOptions {
  logger?: boolean;
  rateLimit?: boolean;
  /**
   * Ambiente «tutto in uno»: lo stesso server distribuisce anche il sito (su /sito) e l'app in versione web (su /app),
   * e l'API risponde sotto /api. Serve per l'ambiente di prova; in produzione sito e app stanno su servizi separati.
   */
  hosted?: { webDir: string; appDir: string; home: string };
}

export async function buildApp(ctx: AppCtx, opts: AppOptions = {}) {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true });
  app.decorate('ctx', ctx);
  const prefix = opts.hosted ? '/api' : '';

  await app.register(
    helmet,
    opts.hosted
      ? {
          contentSecurityPolicy: {
            directives: {
              // Anteprime di foto e video scelti dal telefono, e file caricati.
              'img-src': ["'self'", 'data:', 'blob:'],
              'media-src': ["'self'", 'blob:'],
              'upgrade-insecure-requests': null,
            },
          },
        }
      : {},
  );
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

  if (opts.hosted) {
    const { webDir, appDir, home } = opts.hosted;
    await app.register(fastifyStatic, { root: webDir, prefix: '/sito/', redirect: true });
    await app.register(fastifyStatic, { root: appDir, prefix: '/app/', redirect: true, decorateReply: false });
    app.get('/', (_req, reply) => reply.type('text/html; charset=utf-8').send(home));
    app.setNotFoundHandler((req, reply) => {
      // Sito e app sono a pagina singola: ogni indirizzo interno riceve la pagina iniziale.
      const path = req.url.split('?')[0]!;
      if (req.method === 'GET' && path.startsWith('/sito/')) return reply.sendFile('index.html', webDir);
      if (req.method === 'GET' && path.startsWith('/app/')) return reply.sendFile('index.html', appDir);
      return reply.code(404).send({ error: { code: 'not_found', message: 'Risorsa non trovata' } });
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: { code: 'not_found', message: 'Risorsa non trovata' } }));
  }

  registerAuth(app);
  await app.register(
    async (api) => {
      await api.register(publicRoutes);
      await api.register(authRoutes);
      await api.register(meRoutes);
      await api.register(trainingRoutes);
      await api.register(wellbeingRoutes);
      await api.register(trainerRoutes);
      await api.register(coachingRoutes);
      await api.register(messageRoutes);
      await api.register(crmRoutes);
      await api.register(mediaRoutes);
      await api.register(communityRoutes);
      await api.register(commerceRoutes);
      await api.register(sensorRoutes);
      await api.register(backofficeRoutes);
      await api.register(structureRoutes);
      await api.register(adminRoutes);
    },
    { prefix },
  );
  return app;
}
