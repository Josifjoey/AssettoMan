import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getDb, audit } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';

const router = Router();
router.use(requireAuth, requireAdmin); // account management is admin-only

// GET /api/accounts
router.get('/', async (req, res) => {
  const db = await getDb();
  const users = await db.all(
    'SELECT id, username, role, display_name, is_active, created_at, last_login FROM users ORDER BY created_at'
  );
  res.json({ users });
});

// POST /api/accounts — create a manager (or another admin)
router.post('/', async (req, res) => {
  const { username, password, role, displayName } = req.body || {};
  if (!username || !password || password.length < 8) {
    return res.status(400).json({ error: 'Username and password (8+ chars) required' });
  }
  const safeRole = role === 'admin' ? 'admin' : 'manager';

  const db = await getDb();
  const existing = await db.get('SELECT id FROM users WHERE username = ?', username);
  if (existing) return res.status(409).json({ error: 'Username already exists' });

  const id = crypto.randomUUID();
  await db.run(
    'INSERT INTO users (id, username, password_hash, role, display_name, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
    id, username, await bcrypt.hash(password, 12), safeRole, displayName || username, new Date().toISOString()
  );
  await audit(req.user.id, req.user.username, 'account_created', `${username} (${safeRole})`);
  res.status(201).json({ id, username, role: safeRole });
});

// PATCH /api/accounts/:id — update role, display name, active flag, reset password
router.patch('/:id', async (req, res) => {
  const db = await getDb();
  const target = await db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const { role, displayName, isActive, password } = req.body || {};

  // Guard: can't demote/deactivate the last active admin
  if ((role && role !== 'admin' && target.role === 'admin') || (isActive === false && target.role === 'admin')) {
    const { n } = await db.get("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?", target.id);
    if (n === 0) return res.status(400).json({ error: 'Cannot remove the last active admin' });
  }

  const fields = [];
  const vals = [];
  if (role !== undefined) { fields.push('role = ?'); vals.push(role === 'admin' ? 'admin' : 'manager'); }
  if (displayName !== undefined) { fields.push('display_name = ?'); vals.push(displayName); }
  if (isActive !== undefined) { fields.push('is_active = ?'); vals.push(isActive ? 1 : 0); }
  if (password) { fields.push('password_hash = ?'); vals.push(await bcrypt.hash(password, 12)); }
  if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

  vals.push(target.id);
  await db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, ...vals);
  await audit(req.user.id, req.user.username, 'account_updated', `${target.username}: ${fields.join(', ')}`);
  res.json({ ok: true });
});

// DELETE /api/accounts/:id
router.delete('/:id', async (req, res) => {
  const db = await getDb();
  const target = await db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
  if (target.role === 'admin') {
    const { n } = await db.get("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?", target.id);
    if (n === 0) return res.status(400).json({ error: 'Cannot delete the last admin' });
  }
  await db.run('DELETE FROM users WHERE id = ?', target.id);
  await audit(req.user.id, req.user.username, 'account_deleted', target.username);
  res.json({ ok: true });
});

export default router;
