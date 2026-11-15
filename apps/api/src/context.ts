import type { Role, UserStatus } from '@motix/shared';
import type { Config } from './config';
import type { Db } from './db/client';
import type { AiClient } from './lib/ai';
import type { Mailer } from './lib/mailer';
import type { Storage } from './lib/storage';

export interface AppCtx {
  db: Db;
  config: Config;
  mailer: Mailer;
  storage: Storage;
  ai: AiClient;
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
