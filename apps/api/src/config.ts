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
  /** Ambiente di prova tutto in uno: cartelle con il sito e l'app già compilati (vedi Dockerfile). */
  webDist: string | null;
  appDist: string | null;
  /** Se impostata, crea gli accessi e i dati di esempio. Mai in produzione. */
  demoPassword: string | null;
  isProduction: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const isProduction = env.NODE_ENV === 'production';
  const jwtSecret = env.JWT_SECRET ?? (isProduction ? '' : 'chiave-di-sviluppo-non-usare-in-produzione-0123456789');
  if (jwtSecret.length < 32) throw new Error('JWT_SECRET mancante o troppo corta (minimo 32 caratteri)');
  // Ambiente tutto in uno: sito, app e API stanno sullo stesso indirizzo pubblico.
  const hosted = Boolean(env.WEB_DIST && env.APP_DIST);
  const publicUrl = (env.PUBLIC_URL ?? env.RENDER_EXTERNAL_URL ?? `http://localhost:${Number(env.PORT ?? 4000)}`).replace(/\/$/, '');
  if (env.DEMO_PASSWORD !== undefined && env.DEMO_PASSWORD.length < 10) throw new Error('DEMO_PASSWORD troppo corta (minimo 10 caratteri)');
  return {
    port: Number(env.PORT ?? 4000),
    // Senza DATABASE_URL si usa un database locale su file: comodo per provare senza installare PostgreSQL.
    databaseUrl: env.DATABASE_URL ?? 'pglite:./.data/motix',
    jwtSecret,
    accessTokenTtlMin: Number(env.ACCESS_TOKEN_TTL_MIN ?? 15),
    refreshTokenTtlDays: Number(env.REFRESH_TOKEN_TTL_DAYS ?? 30),
    publicWebUrl: (env.PUBLIC_WEB_URL ?? (hosted ? `${publicUrl}/sito` : 'http://localhost:5173')).replace(/\/$/, ''),
    publicApiUrl: (env.PUBLIC_API_URL ?? (hosted ? `${publicUrl}/api` : `http://localhost:${Number(env.PORT ?? 4000)}`)).replace(/\/$/, ''),
    mediaDir: env.MEDIA_DIR ?? './.data/media',
    corsOrigins: (env.CORS_ORIGINS ?? (hosted ? publicUrl : 'http://localhost:5173,http://localhost:8081')).split(',').map((s) => s.trim()),
    mailFrom: env.MAIL_FROM ?? 'MOTIX <no-reply@motix.app>',
    aiUrl: env.AI_URL ? env.AI_URL.replace(/\/$/, '') : null,
    aiKey: env.AI_KEY || null,
    webDist: hosted ? env.WEB_DIST! : null,
    appDist: hosted ? env.APP_DIST! : null,
    demoPassword: env.DEMO_PASSWORD || null,
    isProduction,
  };
}
