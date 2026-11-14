import { and, eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { requireRole } from '../auth';
import type { AppCtx } from '../context';
import { instructorAssignments, instructors, structures } from '../db/schema';
import { forbidden, notFound } from '../lib/errors';

export interface ScopeOptions {
  ownerOnly?: boolean;
  mustBeApproved?: boolean;
}

/** Struttura di chi fa la richiesta: il titolare la possiede, l'istruttore ci lavora. */
export async function structureScope(ctx: AppCtx, req: FastifyRequest, opts: ScopeOptions = {}) {
  const { db } = ctx;
  const auth = requireRole(req, ...(opts.ownerOnly ? (['owner'] as const) : (['owner', 'instructor'] as const)));
  let structure;
  let instructorId: string | null = null;
  if (auth.role === 'owner') {
    [structure] = await db.select().from(structures).where(eq(structures.ownerUserId, auth.userId)).limit(1);
  } else {
    const [row] = await db
      .select({ s: structures, i: instructors })
      .from(instructors)
      .innerJoin(structures, eq(structures.id, instructors.structureId))
      .where(and(eq(instructors.userId, auth.userId), eq(instructors.active, true)))
      .limit(1);
    structure = row?.s;
    instructorId = row?.i.id ?? null;
  }
  if (!structure) throw notFound('Struttura non trovata');
  if (opts.mustBeApproved !== false && structure.status !== 'approved')
    throw forbidden('La struttura è in attesa di approvazione da parte di BTECH', 'structure_not_approved');
  return { auth, structure, instructorId };
}

/** Iscritti che l'istruttore può vedere: solo quelli assegnati. Per il titolare restituisce null (tutti). */
export async function assignedMemberIds(ctx: AppCtx, instructorId: string | null): Promise<Set<string> | null> {
  if (!instructorId) return null;
  const rows = await ctx.db.select({ userId: instructorAssignments.userId }).from(instructorAssignments).where(eq(instructorAssignments.instructorId, instructorId));
  return new Set(rows.map((r) => r.userId));
}
