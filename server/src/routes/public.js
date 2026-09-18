import { Router } from 'express';
import fs from 'fs';
import { getDb, getSetting } from '../db.js';
import { getServerStatus } from '../status.js';

// Public-facing API — no auth. Powers the community page: live server
// status, mod downloads, server rules.

const router = Router();

// GET /api/public/site — site name, rules, about text
router.get('/site', async (req, res) => {
  res.json({
    siteName: await getSetting('public_site_name', 'AssettoMan'),
    about: await getSetting('public_about', ''),
    rules: await getSetting('public_rules', ''),
    discordUrl: await getSetting('public_discord_url', ''),
    joinInfo: await getSetting('public_join_info', ''),
  });
});

// GET /api/public/servers — public servers with live status
router.get('/servers', async (req, res) => {
  const db = await getDb();
  const rows = await db.all('SELECT id, name, type, ports, config, public_blurb FROM servers WHERE is_public = 1 ORDER BY created_at');
  const servers = [];
  for (const row of rows) {
    const cfg = JSON.parse(row.config || '{}');
    const ports = JSON.parse(row.ports || '{}');
    const live = await getServerStatus({ ...row, config: cfg, ports });

    const s = {
      id: row.id,
      name: row.name,
      type: row.type,
      blurb: row.public_blurb || '',
      game: row.type === 'acc' ? 'Assetto Corsa Competizione' : 'Assetto Corsa',
      running: live.running,
      track: live.track,
      players: live.players,
      maxPlayers: live.maxPlayers,
      connectPort: ports.game || null,
    };
    if (row.type === 'acc') {
      s.carGroup = cfg?.settings?.carGroup;
      s.sessions = (cfg?.event?.sessions || []).map((x) => ({ type: x.sessionType, minutes: x.sessionDurationMinutes }));
      s.hasPassword = !!cfg?.settings?.password;
    } else {
      s.hasPassword = !!cfg?.server?.password;
      s.cars = String(cfg?.server?.cars || '').split(';').filter(Boolean);
    }
    servers.push(s);
  }
  res.json({ servers });
});

// GET /api/public/downloads — public mod downloads (optionally ?serverId=)
router.get('/downloads', async (req, res) => {
  const db = await getDb();
  const rows = req.query.serverId
    ? await db.all('SELECT id, kind, name, version, size, created_at FROM content_items WHERE is_public_download = 1 AND enabled = 1 AND (server_id = ? OR server_id IS NULL) ORDER BY kind, name', req.query.serverId)
    : await db.all('SELECT id, kind, name, version, size, created_at FROM content_items WHERE is_public_download = 1 AND enabled = 1 ORDER BY kind, name');
  res.json({ items: rows });
});

// GET /api/public/download/:id — stream the zip
router.get('/download/:id', async (req, res) => {
  const db = await getDb();
  const item = await db.get('SELECT * FROM content_items WHERE id = ? AND is_public_download = 1 AND enabled = 1', req.params.id);
  if (!item || !item.file_path || !fs.existsSync(item.file_path)) {
    return res.status(404).json({ error: 'Download not found' });
  }
  res.download(item.file_path, item.filename || `${item.name}.zip`);
});

export default router;
