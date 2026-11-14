import type { Role, UserStatus } from '@motix/shared';
import type { Config } from './config';
import type { Db } from './db/client';
import type { Mailer } from './lib/mailer';

export interface AppCtx {
  db: Db;
  config: Config;
  mailer: Mailer;
  now: () => Date;
}

export interface AuthCtx {
  userId: string;
  role: Role;
  status: UserStatus;
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppCtx;
  }
  interface FastifyRequest {
    auth: AuthCtx | null;
  }
}
