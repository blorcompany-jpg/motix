import { createHash, randomBytes, randomInt } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Role } from '@motix/shared';
import type { Config } from '../config';

export interface AccessClaims {
  sub: string;
  role: Role;
}

const key = (config: Config) => new TextEncoder().encode(config.jwtSecret);

export async function signAccessToken(config: Config, claims: AccessClaims): Promise<string> {
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer('motix')
    .setIssuedAt()
    .setExpirationTime(`${config.accessTokenTtlMin}m`)
    .sign(key(config));
}

export async function verifyAccessToken(config: Config, token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(config), { issuer: 'motix', algorithms: ['HS256'] });
    if (!payload.sub || typeof payload.role !== 'string') return null;
    return { sub: payload.sub, role: payload.role as Role };
  } catch {
    return null;
  }
}

/** Token casuale da consegnare alla persona; nel database si salva solo l'impronta. */
export function newOpaqueToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

// Senza caratteri ambigui (0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Codici brevi leggibili: struttura (MX…), personal trainer (PT…), amico (AM…). */
export function newCode(prefix: 'MX' | 'PT' | 'AM', length = 6): string {
  let out = prefix;
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}
