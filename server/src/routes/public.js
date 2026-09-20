import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { getDb, getSetting } from '../db.js';
import { getServerStatus } from '../status.js';
import { getSnapshot, subscribe, isLive } from '../telemetry.js';

// Public-facing API — no auth. Powers the community page: live server
// status, mod downloads, server rules.

const router = Router();

const SAFE_ID = /^[A-Za-z0-9_\-. ]+$/;

function safeId(v) {
  return typeof v === 'string' && v.length > 0 && v.length < 128 && SAFE_ID.test(v);
}

// Some AC ui_*.json files carry a BOM or trailing commas — parse defensively.
function parseJsonLoose(file) {
  try {
    let text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
    text = text.replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function contentDir(server) {
  return path.join(server.data_dir, 'serverfiles', 'content');
}

function trackUiJson(server, trackId, layout) {
  const base = path.join(contentDir(server), 'tracks', trackId, 'ui');
  const candidates = layout
    ? [path.join(base, layout, 'ui_track.json'), path.join(base, 'ui_track.json')]
    : [path.join(base, 'ui_track.json')];
  for (const f of candidates) {
    const j = parseJsonLoose(f);
    if (j) return j;
  }
  return null;
}

// GET /api/public/site — site name, rules, about text
router.get('/site', async (req, res) => {
  res.json({
    siteName: await getSetting('public_site_name', 'AssettoMan'),
    about: await getSetting('public_about', ''),
    rules: await getSetting('public_rules', ''),
    discordUrl: await getSetting('public_discord_url', ''),
    joinInfo: await getSetting('public_join_info', ''),
    gameHost: await getSetting('public_game_host', ''),
    baseUrl: await getSetting('public_base_url', ''),
  });
});

// GET /api/public/servers — public servers with live status
router.get('/servers', async (req, res) => {
  const db = await getDb();
  const gameHost = await getSetting('public_game_host', '');
  const rows = await db.all('SELECT id, name, type, ports, config, public_blurb, container_name, container_id, data_dir, is_public FROM servers WHERE is_public = 1 ORDER BY created_at');
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
      s.liveAvailable = false;
      s.carGroup = cfg?.settings?.carGroup;
      s.sessions = (cfg?.event?.sessions || []).map((x) => ({ type: x.sessionType, minutes: x.sessionDurationMinutes }));
      s.hasPassword = !!cfg?.settings?.password;
    } else {
      s.hasPassword = !!cfg?.server?.password;
      const carIds = String(cfg?.server?.cars || '').split(';').filter(Boolean);
      s.cars = carIds;
      s.carsMeta = carIds.map((id) => {
        const ui = parseJsonLoose(path.join(contentDir(row), 'cars', id, 'ui', 'ui_car.json'));
        return {
          id,
          name: ui?.name || id,
          brand: ui?.brand || null,
          previewUrl: `/api/public/content-image/${row.id}/car/${encodeURIComponent(id)}`,
        };
      });
      const trackId = cfg?.server?.track || null;
      const trackLayout = cfg?.server?.trackConfig || null;
      if (trackId) {
        const ui = trackUiJson(row, trackId, trackLayout);
        const layoutPart = trackLayout ? `/${encodeURIComponent(trackLayout)}` : '';
        s.trackMeta = {
          id: trackId,
          layout: trackLayout,
          name: ui?.name || trackId,
          previewUrl: `/api/public/content-image/${row.id}/track/${encodeURIComponent(trackId)}${layoutPart}`,
          outlineUrl: `/api/public/content-image/${row.id}/track/${encodeURIComponent(trackId)}${layoutPart}?outline=1`,
        };
      }
      s.httpPort = ports.http || null;
      s.liveAvailable = isLive(row.id);
      s.liveUrl = `/public/live/${row.id}`;
      if (gameHost) {
        s.joinUrl = `acmanager://race/online/join?ip=${encodeURIComponent(gameHost)}&httpPort=${ports.http || ''}`;
      }
    }
    servers.push(s);
  }
  res.json({ servers });
});

// GET /api/public/downloads — public mod downloads (optionally ?serverId=)
router.get('/downloads', async (req, res) => {
  const db = await getDb();
  const cols = 'id, kind, name, version, size, created_at, source_type, external_url, preview_image, content_id, description, server_id';
  const rows = req.query.serverId
    ? await db.all(`SELECT ${cols} FROM content_items WHERE is_public_download = 1 AND enabled = 1 AND (server_id = ? OR server_id IS NULL) ORDER BY kind, name`, req.query.serverId)
    : await db.all(`SELECT ${cols} FROM content_items WHERE is_public_download = 1 AND enabled = 1 ORDER BY kind, name`);
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

async function loadPublicAcServer(req, res) {
  const db = await getDb();
  const server = await db.get("SELECT * FROM servers WHERE id = ? AND is_public = 1 AND type != 'acc'", req.params.serverId);
  if (!server) {
    res.status(404).json({ error: 'Not found' });
    return null;
  }
  return server;
}

function sendImage(res, file) {
  if (!file || !fs.existsSync(file)) return res.status(404).json({ error: 'Image not found' });
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(file);
}

// GET /api/public/content-image/:serverId/car/:carId — car preview image
router.get('/content-image/:serverId/car/:carId', async (req, res) => {
  const server = await loadPublicAcServer(req, res);
  if (!server) return;
  const { carId } = req.params;
  if (!safeId(carId)) return res.status(400).json({ error: 'Invalid id' });
  const dir = path.join(contentDir(server), 'cars', carId, 'ui');
  if (!dir.startsWith(contentDir(server))) return res.status(400).json({ error: 'Invalid path' });

  let file = null;
  try {
    const skinsDir = path.join(dir, 'skins');
    const firstSkin = fs.readdirSync(skinsDir, { withFileTypes: true }).find((d) => d.isDirectory())?.name;
    if (firstSkin && safeId(firstSkin)) {
      const p = path.join(skinsDir, firstSkin, 'preview.jpg');
      if (fs.existsSync(p)) file = p;
    }
  } catch { /* no skins dir */ }
  if (!file) {
    const badge = path.join(dir, 'badge.png');
    if (fs.existsSync(badge)) file = badge;
  }
  sendImage(res, file);
});

// GET /api/public/content-image/:serverId/track/:trackId(/:layout)? — preview, outline or map
router.get(['/content-image/:serverId/track/:trackId', '/content-image/:serverId/track/:trackId/:layout'], async (req, res) => {
  const server = await loadPublicAcServer(req, res);
  if (!server) return;
  const { trackId, layout } = req.params;
  if (!safeId(trackId) || (layout && !safeId(layout))) return res.status(400).json({ error: 'Invalid id' });
  const base = path.join(contentDir(server), 'tracks', trackId, 'ui');
  const dir = layout ? path.join(base, layout) : base;
  if (!dir.startsWith(contentDir(server))) return res.status(400).json({ error: 'Invalid path' });

  let file;
  if (req.query.map === '1') {
    // map.png sits next to data/map.ini (track root or layout root)
    const mapDir = layout ? path.join(contentDir(server), 'tracks', trackId, layout) : path.join(contentDir(server), 'tracks', trackId);
    file = path.join(mapDir, 'map.png');
  } else {
    const name = req.query.outline === '1' ? 'outline.png' : 'preview.png';
    file = path.join(dir, name);
    if (!fs.existsSync(file) && layout) file = path.join(base, name); // fall back to base ui/
  }
  sendImage(res, file);
});

// GET /api/public/live/:serverId — one-shot telemetry snapshot (guid stripped)
router.get('/live/:serverId', async (req, res) => {
  const server = await loadPublicAcServer(req, res);
  if (!server) return;
  res.json(getSnapshot(server.id, { stripGuid: true }));
});

// GET /api/public/live/:serverId/stream — SSE stream of snapshots
router.get('/live/:serverId/stream', async (req, res) => {
  const server = await loadPublicAcServer(req, res);
  if (!server) return;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  const send = (snap) => res.write(`event: snapshot\ndata: ${JSON.stringify(stripGuids(snap))}\n\n`);
  send(getSnapshot(server.id));
  const unsub = subscribe(server.id, send);
  const heartbeat = setInterval(() => res.write(': hb\n\n'), 15000);
  req.on('close', () => {
    clearInterval(heartbeat);
    unsub();
    res.end();
  });
});

function stripGuids(snap) {
  if (!snap?.cars) return snap;
  return { ...snap, cars: snap.cars.map(({ driverGuid, ...c }) => c) };
}

// GET /api/public/track-map/:serverId — map.png URL + map.ini projection params
router.get('/track-map/:serverId', async (req, res) => {
  const server = await loadPublicAcServer(req, res);
  if (!server) return;

  const cfg = JSON.parse(server.config || '{}');
  const snap = getSnapshot(server.id);
  const track = snap?.session?.track || cfg?.server?.track;
  const layout = snap?.session?.trackConfig || cfg?.server?.trackConfig || '';
  if (!track || !safeId(track) || (layout && !safeId(layout))) {
    return res.status(404).json({ error: 'No track map' });
  }

  const trackDir = path.join(contentDir(server), 'tracks', track);
  const iniCandidates = [
    layout ? path.join(trackDir, layout, 'data', 'map.ini') : null,
    path.join(trackDir, 'data', 'map.ini'),
  ].filter(Boolean);
  let ini = null;
  for (const f of iniCandidates) {
    try { ini = fs.readFileSync(f, 'utf8'); break; } catch { /* try next */ }
  }
  if (!ini) return res.status(404).json({ error: 'No track map' });

  const num = (key) => {
    const m = ini.match(new RegExp(`^${key}\\s*=\\s*([-\\d.]+)`, 'mi'));
    return m ? +m[1] : null;
  };
  const layoutPart = layout ? `/${encodeURIComponent(layout)}` : '';
  res.json({
    image: `/api/public/content-image/${server.id}/track/${encodeURIComponent(track)}${layoutPart}?map=1`,
    track, layout,
    params: {
      width: num('WIDTH'), height: num('HEIGHT'),
      xOffset: num('X_OFFSET'), zOffset: num('Z_OFFSET'),
      scaleFactor: num('SCALE_FACTOR'), margin: num('MARGIN'),
    },
  });
});

export default router;
