import { randomUUID } from 'node:crypto';
import multipart from '@fastify/multipart';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { MAX_IMAGE_MB, MAX_VIDEO_MB, type MediaRef } from '@motix/shared';
import { requireRole } from '../auth';
import type { AppCtx } from '../context';
import { mediaFiles } from '../db/schema';
import { badRequest, notFound } from '../lib/errors';
import { sniff } from '../lib/storage';

const MB = 1024 * 1024;

export const mediaUrl = (ctx: AppCtx, key: string) => `${ctx.config.publicApiUrl}/media/${key}`;

/** Caricamento e distribuzione di foto e video. */
export async function mediaRoutes(app: FastifyInstance) {
  const ctx = app.ctx;
  const { db } = ctx;
  await app.register(multipart, { limits: { fileSize: MAX_VIDEO_MB * MB, files: 1 } });

  app.post('/media', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const auth = requireRole(req, 'user', 'personal_trainer', 'admin');
    const file = await req.file();
    if (!file) throw badRequest('file_missing', 'Nessun file ricevuto');
    const data = await file.toBuffer().catch(() => null);
    if (!data || file.file.truncated) throw badRequest('file_too_large', `Il file è troppo grande: massimo ${MAX_VIDEO_MB} MB`);
    const type = sniff(data);
    if (!type) throw badRequest('file_type', 'Formato non supportato: usa JPG, PNG, WebP, MP4 o MOV');
    if (type.kind === 'image' && data.length > MAX_IMAGE_MB * MB) throw badRequest('file_too_large', `La foto è troppo grande: massimo ${MAX_IMAGE_MB} MB`);
    const key = `${randomUUID()}.${type.ext}`;
    await ctx.storage.put(key, data);
    const [row] = await db
      .insert(mediaFiles)
      .values({ ownerId: auth.userId, key, kind: type.kind, contentType: type.contentType, sizeBytes: data.length })
      .returning();
    const ref: MediaRef = { id: row!.id, url: mediaUrl(ctx, key), type: type.kind };
    return reply.code(201).send(ref);
  });

  /** I file hanno nomi casuali non indovinabili; i video si scaricano a intervalli per poterli riprodurre. */
  app.get('/media/:key', async (req, reply) => {
    const { key } = req.params as { key: string };
    const [row] = await db.select().from(mediaFiles).where(eq(mediaFiles.key, key)).limit(1);
    const object = row ? await ctx.storage.get(key) : null;
    if (!row || !object) throw notFound('File non trovato');
    reply
      .header('content-type', row.contentType)
      .header('accept-ranges', 'bytes')
      .header('cache-control', 'public, max-age=31536000, immutable')
      // Foto e video vengono mostrati dall'app e dal sito, che stanno su altri indirizzi.
      .header('cross-origin-resource-policy', 'cross-origin');
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (match && (match[1] || match[2])) {
      const start = match[1] ? Number(match[1]) : Math.max(0, object.size - Number(match[2]));
      const end = match[1] && match[2] ? Math.min(Number(match[2]), object.size - 1) : object.size - 1;
      if (start > end || start >= object.size) return reply.code(416).header('content-range', `bytes */${object.size}`).send();
      return reply
        .code(206)
        .header('content-range', `bytes ${start}-${end}/${object.size}`)
        .header('content-length', end - start + 1)
        .send(object.stream({ start, end }));
    }
    return reply.header('content-length', object.size).send(object.stream());
  });
}
