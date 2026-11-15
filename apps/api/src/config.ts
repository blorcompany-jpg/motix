export interface Config {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  accessTokenTtlMin: number;
  refreshTokenTtlDays: number;
  publicWebUrl: string;
  /** Indirizzo pubblico di questo server, usato nei link ai file caricati. */
  publicApiUrl: string;
  /** Cartella dei file caricati (solo con l'archivio su disco). */
  mediaDir: string;
  corsOrigins: string[];
  mailFrom: string;
  /** Indirizzo del motore AI (services/ai). Senza, le funzioni che lo usano ripiegano o avvisano. */
  aiUrl: string | null;
  aiKey: string | null;
  isProduction: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const isProduction = env.NODE_ENV === 'production';
  const jwtSecret = env.JWT_SECRET ?? (isProduction ? '' : 'chiave-di-sviluppo-non-usare-in-produzione-0123456789');
  if (jwtSecret.length < 32) throw new Error('JWT_SECRET mancante o troppo corta (minimo 32 caratteri)');
  return {
    port: Number(env.PORT ?? 4000),
    // Senza DATABASE_URL si usa un database locale su file: comodo per provare senza installare PostgreSQL.
    databaseUrl: env.DATABASE_URL ?? 'pglite:./.data/motix',
    jwtSecret,
    accessTokenTtlMin: Number(env.ACCESS_TOKEN_TTL_MIN ?? 15),
    refreshTokenTtlDays: Number(env.REFRESH_TOKEN_TTL_DAYS ?? 30),
    publicWebUrl: (env.PUBLIC_WEB_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
    publicApiUrl: (env.PUBLIC_API_URL ?? `http://localhost:${Number(env.PORT ?? 4000)}`).replace(/\/$/, ''),
    mediaDir: env.MEDIA_DIR ?? './.data/media',
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:8081').split(',').map((s) => s.trim()),
    mailFrom: env.MAIL_FROM ?? 'MOTIX <no-reply@motix.app>',
    aiUrl: env.AI_URL ? env.AI_URL.replace(/\/$/, '') : null,
    aiKey: env.AI_KEY || null,
    isProduction,
  };
}
