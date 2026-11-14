import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 96 * 1024 * 1024;

function derive(password: string, salt: Buffer, n: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEYLEN, { N: n, r: R, p: P, maxmem: MAXMEM }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N);
  return `scrypt$${N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  // Se l'utente non esiste si calcola comunque un hash, per non rivelarlo dai tempi di risposta.
  if (!stored) {
    await derive(password, Buffer.alloc(16), N);
    return false;
  }
  const [scheme, n, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'), Number(n));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
