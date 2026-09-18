import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { getDb, audit } from '../db.js';
import { signToken, setAuthCookie, clearAuthCookie, requireAuth } from '../auth.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /api/auth/status — does the app need first-run setup?
router.get('/status', async (req, res) => {
  const db = await getDb();
  const { n } = await db.get('SELECT COUNT(*) AS n FROM users');
  res.json({ setupRequired: n === 0 });
});

// POST /api/auth/setup — create the first admin (only when no users exist)
router.post('/setup', loginLimiter, async (req, res) => {
  const db = await getDb();
  const { n } = await db.get('SELECT COUNT(*) AS n FROM users');
  if (n > 0) return res.status(403).json({ error: 'Setup already completed' });

  const { username, password, displayName } = req.body || {};
  if (!username || !password || password.length < 8) {
    return res.status(400).json({ error: 'Username and a password of at least 8 characters are required' });
  }

  const id = crypto.randomUUID();
  await db.run(
    'INSERT INTO users (id, username, password_hash, role, display_name, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
    id, username, await bcrypt.hash(password, 12), 'admin', displayName || username, new Date().toISOString()
  );
  await audit(id, username, 'setup_admin', 'Initial admin account created');

  const user = await db.get('SELECT id, username, role, display_name FROM users WHERE id = ?', id);
  setAuthCookie(res, signToken(user));
  res.json({ user });
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const db = await getDb();
  const user = await db.get('SELECT * FROM users WHERE username = ?', username);
  if (!user || !user.is_active || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  await db.run('UPDATE users SET last_login = ? WHERE id = ?', new Date().toISOString(), user.id);
  await audit(user.id, user.username, 'login', null);

  const safe = { id: user.id, username: user.username, role: user.role, display_name: user.display_name };
  setAuthCookie(res, signToken(user));
  res.json({ user: safe });
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
