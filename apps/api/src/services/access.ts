import { and, eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../auth';
import type { AppCtx } from '../context';
import { clientLinks, trainers, users } from '../db/schema';
import { forbidden, notFound, parse } from '../lib/errors';

/** Il professionista che fa la richiesta. Molte azioni richiedono l'approvazione di BTECH. */
export async function currentTrainer(ctx: AppCtx, req: FastifyRequest, mustBeApproved = true) {
  const auth = requireRole(req, 'personal_trainer');
  const [row] = await ctx.db
    .select({ t: trainers, u: users })
    .from(trainers)
    .innerJoin(users, eq(users.id, trainers.userId))
    .where(eq(trainers.userId, auth.userId))
    .limit(1);
  if (!row) throw notFound('Profilo professionista non trovato');
  if (mustBeApproved && row.t.status !== 'approved')
    throw forbidden('Il tuo profilo è in attesa di approvazione da parte di BTECH', 'trainer_not_approved');
  return { auth, ...row };
}

/** Collegamento attivo tra il professionista che chiama e il cliente indicato da :linkId. */
export async function clientOfTrainer(ctx: AppCtx, req: FastifyRequest, opts: { needsData?: boolean } = {}) {
  const { auth, t } = await currentTrainer(ctx, req);
  const { linkId } = parse(z.object({ linkId: z.string().uuid() }).passthrough(), req.params);
  const [row] = await ctx.db
    .select({ link: clientLinks, client: users })
    .from(clientLinks)
    .innerJoin(users, eq(users.id, clientLinks.userId))
    .where(and(eq(clientLinks.id, linkId), eq(clientLinks.trainerId, t.id)))
    .limit(1);
  if (!row || row.link.status !== 'active') throw notFound('Cliente non trovato');
  if (opts.needsData && !row.link.dataConsent)
    throw forbidden('Il cliente non ha dato il consenso a condividere i suoi dati con te', 'consent_required');
  return { auth, t, ...row };
}
