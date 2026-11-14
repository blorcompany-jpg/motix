import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { openDb, type DbHandle } from '../src/db/client';
import { users } from '../src/db/schema';
import { DevMailer } from '../src/lib/mailer';
import { hashPassword } from '../src/lib/password';
import { ensureExerciseLibrary } from '../src/services/library';

export interface TestEnv {
  app: FastifyInstance;
  handle: DbHandle;
  mailer: DevMailer;
  clock: { now: Date };
  api: (method: string, url: string, body?: unknown, token?: string) => Promise<{ status: number; body: any }>;
  adminToken: string;
  close: () => Promise<void>;
}

export const PASSWORD = 'Password-di-prova-1';

export async function createEnv(): Promise<TestEnv> {
  const handle = await openDb('pglite:memory');
  await handle.migrate();
  await ensureExerciseLibrary(handle.db);
  const mailer = new DevMailer();
  const clock = { now: new Date('2026-11-14T10:00:00Z') };
  const config = loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(40), PUBLIC_WEB_URL: 'https://motix.test' });
  const app = await buildApp({ db: handle.db, config, mailer, now: () => clock.now }, { rateLimit: false });

  const api: TestEnv['api'] = async (method, url, body, token) => {
    const res = await app.inject({
      method: method as 'GET',
      url,
      payload: body as object | undefined,
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
  };

  await handle.db.insert(users).values({
    email: 'admin@btech.test',
    passwordHash: await hashPassword(PASSWORD),
    firstName: 'Admin',
    lastName: 'BTECH',
    role: 'admin',
  });
  const login = await api('POST', '/auth/login', { email: 'admin@btech.test', password: PASSWORD });

  return { app, handle, mailer, clock, api, adminToken: login.body.accessToken, close: async () => { await app.close(); await handle.close(); } };
}

export const tokenFromLink = (link?: string) => new URL(link!).searchParams.get('token')!;

export const userInput = (over: Record<string, unknown> = {}) => ({
  email: 'giulia@example.com',
  password: PASSWORD,
  firstName: 'Giulia',
  lastName: 'Rossi',
  birthDate: '1995-04-12',
  consents: { terms: true, health_data: true, share_structure: false, share_trainer: false, marketing: false },
  ...over,
});

export const structureInput = (over: Record<string, unknown> = {}) => ({
  owner: { email: 'titolare@palestra.example', password: PASSWORD, firstName: 'Marco', lastName: 'Bianchi' },
  acceptTerms: true,
  structure: { legalName: 'Fit Bari SSD a r.l.', displayName: 'Fit Bari', type: 'ssd', city: 'Bari', province: 'BA', membersEstimate: 450 },
  ...over,
});

export const trainerInput = (over: Record<string, unknown> = {}) => ({
  email: 'pt@example.com',
  password: PASSWORD,
  firstName: 'Luca',
  lastName: 'Verdi',
  birthDate: '1990-01-20',
  acceptTerms: true,
  specializations: ['Forza', 'Posturale'],
  ...over,
});

/** Crea una struttura approvata e restituisce token del titolare e codice. */
export async function approvedStructure(env: TestEnv, over: Record<string, unknown> = {}) {
  const reg = await env.api('POST', '/auth/register/structure', structureInput(over));
  const list = await env.api('GET', '/admin/structures?status=pending', undefined, env.adminToken);
  const id = list.body.structures.find((s: any) => s.owner.email === reg.body.user.email).id;
  const ok = await env.api('POST', `/admin/structures/${id}/approve`, {}, env.adminToken);
  return { ownerToken: reg.body.accessToken as string, id, code: ok.body.code as string };
}

/** Crea un personal trainer approvato. */
export async function approvedTrainer(env: TestEnv, over: Record<string, unknown> = {}) {
  const reg = await env.api('POST', '/auth/register/trainer', trainerInput(over));
  const id = reg.body.user.trainer.id as string;
  await env.api('POST', `/admin/trainers/${id}/approve`, {}, env.adminToken);
  return { token: reg.body.accessToken as string, id, code: reg.body.user.trainer.inviteCode as string };
}
