import jwt from 'jsonwebtoken';
import { getDb } from './db.js';

const COOKIE_NAME = 'am_token';
const JWT_SECRET = process.env.JWT_SECRET || 'assettoman-dev-secret-change-me';
const TOKEN_TTL = '7d';

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('[auth] WARNING: JWT_SECRET not set — using insecure default. Set JWT_SECRET env var.');
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

// Reads token from cookie or Authorization header; attaches req.user or 401s.
// User rows are re-read from the DB (cached 30s per id) so deleted/deactivated
// users and role changes take effect before the token expires.
const USER_CACHE_TTL = 30_000;
const userCache = new Map(); // id -> { user, at }
async function loadUser(id) {
  const hit = userCache.get(id);
  if (hit && Date.now() - hit.at < USER_CACHE_TTL) return hit.user;
  const db = await getDb();
  const user = await db.get('SELECT id, username, role, display_name, is_active FROM users WHERE id = ?', id);
  userCache.set(id, { user, at: Date.now() });
  return user;
}

export async function requireAuth(req, res, next) {
  try {
    const bearer = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null;
    const token = req.cookies?.[COOKIE_NAME] || bearer;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const payload = jwt.verify(token, JWT_SECRET);
    const user = await loadUser(payload.sub);
    if (!user || !user.is_active) {
      clearAuthCookie(res);
      return res.status(401).json({ error: 'Account disabled or missing' });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' });
  }
  next();
}
