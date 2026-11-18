import { Router } from 'express';
import * as auth from '../../services/auth';
import { isSlugAvailable } from '../../services/tenants';
import { rateLimit } from '../../services/rateLimit';
import { created, userAgent, wrap } from '../wrap';

export function authRouter() {
  const r = Router();
  const loginLimit = rateLimit({ name: 'login', windowMs: 15 * 60_000, max: 20 });
  const signupLimit = rateLimit({ name: 'signup', windowMs: 60 * 60_000, max: 10 });

  r.get('/slug-available', rateLimit({ name: 'slug', windowMs: 60_000, max: 60 }), wrap(async (req) => {
    const slug = String(req.query.slug ?? '').toLowerCase().slice(0, 60);
    return { slug, available: await isSlugAvailable(slug) };
  }));
  r.post('/signup', signupLimit, created((req) => auth.signup(req.body, userAgent(req))));
  r.post('/login', loginLimit, wrap((req) => auth.staffLogin(req.body, userAgent(req))));
  r.post('/refresh', rateLimit({ name: 'refresh', windowMs: 60_000, max: 60 }), wrap((req) => auth.staffRefresh(req.body?.refreshToken, userAgent(req))));
  r.post('/logout', wrap((req) => auth.logout(req.body?.refreshToken)));
  return r;
}

export function platformAuthRouter() {
  const r = Router();
  const limit = rateLimit({ name: 'platform-login', windowMs: 15 * 60_000, max: 10 });
  r.post('/login', limit, wrap((req) => auth.platformLogin(req.body, userAgent(req), req.ip)));
  r.post('/refresh', limit, wrap((req) => auth.platformRefresh(req.body?.refreshToken, userAgent(req))));
  r.post('/logout', wrap((req) => auth.logout(req.body?.refreshToken)));
  return r;
}
