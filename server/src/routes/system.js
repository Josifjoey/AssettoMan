import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { getDb, getSetting, setSetting, audit } from '../db.js';
import { requireAuth } from '../auth.js';
import { dockerAvailable } from '../docker.js';
import { DATA_DIR, HOST_DATA_DIR } from '../paths.js';

const router = Router();
router.use(requireAuth);

const PUBLIC_KEYS = ['public_site_name', 'public_about', 'public_rules', 'public_discord_url', 'public_join_info', 'public_base_url', 'public_game_host'];

// GET /api/system/health — docker connectivity + path mapping sanity
router.get('/health', async (req, res) => {
  res.json({
    docker: await dockerAvailable(),
    dataDir: DATA_DIR,
    hostDataDir: HOST_DATA_DIR,
    hostMapping: HOST_DATA_DIR !== DATA_DIR,
  });
});

// GET /api/system/settings
router.get('/settings', async (req, res) => {
  const out = {};
  for (const k of PUBLIC_KEYS) out[k] = await getSetting(k, '');
  res.json({ settings: out });
});

// PUT /api/system/settings
router.put('/settings', async (req, res) => {
  const body = req.body || {};
  for (const k of PUBLIC_KEYS) {
    if (body[k] !== undefined) await setSetting(k, body[k]);
  }
  await audit(req.user.id, req.user.username, 'settings_updated', PUBLIC_KEYS.filter((k) => body[k] !== undefined).join(','));
  res.json({ ok: true });
});

// GET /api/system/audit — recent audit log entries
router.get('/audit', async (req, res) => {
  const db = await getDb();
  const rows = await db.all('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200');
  res.json({ entries: rows });
});

// GET /api/system/files/:serverId — browse a server's data dir (light file manager)
router.get('/files/:serverId', async (req, res) => {
  const db = await getDb();
  const server = await db.get('SELECT * FROM servers WHERE id = ?', req.params.serverId);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const rel = (req.query.path || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const base = server.data_dir;
  const dir = path.join(base, rel);
  if (!dir.startsWith(base)) return res.status(400).json({ error: 'Invalid path' });

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).map((d) => ({
      name: d.name,
      dir: d.isDirectory(),
      size: d.isFile() ? fs.statSync(path.join(dir, d.name)).size : null,
    }));
    res.json({ path: rel, entries });
  } catch {
    res.status(404).json({ error: 'Path not found' });
  }
});

export default router;
