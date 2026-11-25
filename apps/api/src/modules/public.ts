import { and, asc, count, eq, ilike, inArray, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { PROFESSIONS, codeSchema, type ProfessionalCard, type ProfessionalProfile } from '@motix/shared';
import { z } from 'zod';
import { clientLinks, structures, trainerStructures, trainerVideos, trainers, users } from '../db/schema';
import { registerOk } from '../services/professionals';
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
    return { firstName: row.u.firstName, lastName: row.u.lastName, specializations: row.t.specializations, profession: row.t.profession };
  });

  /* ---------- Vetrina dei professionisti ---------- */

  type Row = { t: typeof trainers.$inferSelect; u: typeof users.$inferSelect };
  const cards = async (rows: Row[]): Promise<ProfessionalCard[]> => {
    const ids = rows.map((r) => r.t.id);
    const counts = ids.length
      ? await db
          .select({ id: clientLinks.trainerId, n: count() })
          .from(clientLinks)
          .where(and(inArray(clientLinks.trainerId, ids), eq(clientLinks.status, 'active')))
          .groupBy(clientLinks.trainerId)
      : [];
    return rows.map(({ t, u }) => ({
      id: t.id,
      userId: u.id,
      name: `${u.firstName} ${u.lastName}`,
      profession: t.profession,
      city: t.city,
      specializations: t.specializations,
      bio: t.bio,
      verified: Boolean(t.registerVerifiedAt),
      avatarUrl: u.avatarUrl,
      clients: counts.find((c) => c.id === t.id)?.n ?? 0,
    }));
  };
  // Si vedono solo i professionisti approvati con il profilo pubblico e, se serve, l'albo verificato.
  const listed = and(eq(trainers.status, 'approved'), eq(trainers.publicProfile, true), eq(users.status, 'active'));

  app.get('/public/professionals', limited, async (req) => {
    const { profession, city, q } = parse(
      z.object({ profession: z.enum(PROFESSIONS).optional(), city: z.string().trim().max(80).optional(), q: z.string().trim().max(80).optional() }),
      req.query,
    );
    const like = (v: string) => `%${v.replace(/[%_]/g, '')}%`;
    const rows = await db
      .select({ t: trainers, u: users })
      .from(trainers)
      .innerJoin(users, eq(users.id, trainers.userId))
      .where(
        and(
          listed,
          profession ? eq(trainers.profession, profession) : undefined,
          city ? ilike(trainers.city, like(city)) : undefined,
          q ? or(ilike(users.firstName, like(q)), ilike(users.lastName, like(q)), ilike(trainers.bio, like(q))) : undefined,
        ),
      )
      .orderBy(asc(users.lastName))
      .limit(100);
    return { professionals: await cards(rows.filter((r) => registerOk(r.t))) };
  });

  app.get('/public/professionals/:id', limited, async (req): Promise<ProfessionalProfile> => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const [row] = await db.select({ t: trainers, u: users }).from(trainers).innerJoin(users, eq(users.id, trainers.userId)).where(and(eq(trainers.id, id), listed)).limit(1);
    if (!row || !registerOk(row.t)) throw notFound('Professionista non trovato');
    const [card] = await cards([row]);
    const videos = await db
      .select()
      .from(trainerVideos)
      .where(and(eq(trainerVideos.trainerId, id), eq(trainerVideos.visibility, 'community'), eq(trainerVideos.reviewStatus, 'approved')))
      .limit(30);
    const places = await db
      .select({ displayName: structures.displayName, city: structures.city })
      .from(trainerStructures)
      .innerJoin(structures, eq(structures.id, trainerStructures.structureId))
      .where(and(eq(trainerStructures.trainerId, id), eq(trainerStructures.status, 'active')));
    return { ...card!, videos: videos.map((v) => ({ id: v.id, title: v.title, url: v.videoUrl })), structures: places };
  });
}
