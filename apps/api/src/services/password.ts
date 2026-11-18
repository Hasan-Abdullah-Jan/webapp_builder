import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// scrypt (memory-hard, built into Node). Format: scrypt$N$r$p$saltB64$hashB64
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function scryptAsync(pw: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(pw, salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string | undefined | null): Promise<boolean> {
  if (!stored) return false;
  const [algo, n, r, p, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'), Number(n), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Burns comparable time when the user doesn't exist, so login timing doesn't reveal accounts. */
const DUMMY = ['scrypt', N, R, P, Buffer.alloc(16).toString('base64'), Buffer.alloc(64).toString('base64')].join('$');
export async function verifyPasswordOrDummy(password: string, stored?: string | null) {
  const ok = await verifyPassword(password, stored ?? DUMMY);
  return ok && Boolean(stored);
}
