import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { getEnv } from '../config/env';
import { Session } from '../models';
import { AppError } from './errors';

export const ACCESS_TTL = '15m';
const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000; // tenant staff
const PLATFORM_REFRESH_TTL_MS = 12 * 3600 * 1000; // platform staff: shorter

export type Audience = 'tenant-admin' | 'platform' | 'preview';

export function signAccess(
  aud: Audience,
  sub: string,
  claims: Record<string, unknown>,
  expiresIn: jwt.SignOptions['expiresIn'] = ACCESS_TTL,
) {
  return jwt.sign(claims, getEnv().JWT_SECRET, {
    algorithm: 'HS256',
    subject: sub,
    audience: aud,
    issuer: 'quickstore-api',
    expiresIn,
  });
}

export function verifyAccess<T extends object>(token: string, aud: Audience): T & { sub: string; exp: number } {
  return jwt.verify(token, getEnv().JWT_SECRET, {
    algorithms: ['HS256'],
    audience: aud,
    issuer: 'quickstore-api',
  }) as T & { sub: string; exp: number };
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Creates a refresh-token session and returns the opaque token (only its hash is stored). */
export async function createSession(
  kind: 'staff' | 'platform',
  userId: Types.ObjectId,
  tenantId?: Types.ObjectId,
  userAgent?: string,
  family: string = randomUUID(),
) {
  const token = randomBytes(48).toString('base64url');
  const ttl = kind === 'platform' ? PLATFORM_REFRESH_TTL_MS : REFRESH_TTL_MS;
  await Session.create({
    kind,
    userId,
    tenantId,
    family,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + ttl),
    userAgent: userAgent?.slice(0, 300),
  });
  return token;
}

/**
 * Rotates a refresh token. Re-use of an already-rotated token revokes the whole family
 * (stolen-token detection).
 */
export async function rotateSession(kind: 'staff' | 'platform', token: string, userAgent?: string) {
  const invalid = new AppError(401, 'UNAUTHORIZED', 'Session expired, please log in again');
  if (!token || typeof token !== 'string' || token.length > 200) throw invalid;
  const session = await Session.findOne({ tokenHash: sha256(token), kind }).lean();
  if (!session || session.expiresAt < new Date()) throw invalid;
  if (session.revokedAt) {
    await Session.updateMany({ family: session.family, revokedAt: null }, { $set: { revokedAt: new Date() } });
    throw invalid;
  }
  const res = await Session.updateOne({ _id: session._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  if (res.modifiedCount !== 1) throw invalid; // lost a concurrent rotation
  const next = await createSession(kind, session.userId, session.tenantId ?? undefined, userAgent, session.family);
  return { session, refreshToken: next };
}

export async function revokeSession(token: string) {
  if (!token || typeof token !== 'string') return;
  const s = await Session.findOne({ tokenHash: sha256(token) }).lean();
  if (s) await Session.updateMany({ family: s.family, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export async function revokeAllForUser(userId: Types.ObjectId) {
  await Session.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}
