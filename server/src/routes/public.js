import { Router } from 'express';
import fs from 'fs';
import { getDb, getSetting } from '../db.js';
import { getServerStatus } from '../status.js';
import { getSnapshot, subscribe, isLive } from '../telemetry.js';
import { listResults, getPublicResult, publicLeaderboard } from '../results.js';
import { safeId, trackUiJson, sendImage, carImagePath, trackImagePath, trackMapFor, carsMetaFor } from '../contentMeta.js';

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
      s.sessionType = live.sessionType || null;
      s.sessionPhase = live.sessionPhase || null;
      s.sessions = (cfg?.event?.sessions || []).map((x) => ({ type: x.sessionType, minutes: x.sessionDurationMinutes }));
      s.hasPassword = !!cfg?.settings?.password;
    } else {
      s.hasPassword = !!cfg?.server?.password;
      const carIds = String(cfg?.server?.cars || '').split(';').filter(Boolean);
      s.cars = carIds;
      s.carsMeta = carsMetaFor(row, (id) => `/api/public/content-image/${row.id}/car/${encodeURIComponent(id)}`);
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
      s.liveUrl = `/live/${row.id}`;
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

// GET /api/public/content-image/:serverId/car/:carId — car preview image
router.get('/content-image/:serverId/car/:carId', async (req, res) => {
  const server = await loadPublicAcServer(req, res);
  if (!server) return;
  const { carId } = req.params;
  if (!safeId(carId)) return res.status(400).json({ error: 'Invalid id' });
  sendImage(res, carImagePath(server, carId));
});

// GET /api/public/content-image/:serverId/track/:trackId(/:layout)? — preview, outline or map
router.get(['/content-image/:serverId/track/:trackId', '/content-image/:serverId/track/:trackId/:layout'], async (req, res) => {
  const server = await loadPublicAcServer(req, res);
  if (!server) return;
  const { trackId, layout } = req.params;
  if (!safeId(trackId) || (layout && !safeId(layout))) return res.status(400).json({ error: 'Invalid id' });
  sendImage(res, trackImagePath(server, trackId, layout, { map: req.query.map === '1', outline: req.query.outline === '1' }));
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
  const m = trackMapFor(server, (track, layout) => {
    const layoutPart = layout ? `/${encodeURIComponent(layout)}` : '';
    return `/api/public/content-image/${server.id}/track/${encodeURIComponent(track)}${layoutPart}?map=1`;
  });
  if (!m) return res.status(404).json({ error: 'No track map' });
  res.json(m);
});

async function loadPublicServer(req, res) {
  const db = await getDb();
  const server = await db.get('SELECT * FROM servers WHERE id = ? AND is_public = 1', req.params.serverId);
  if (!server) {
    res.status(404).json({ error: 'Not found' });
    return null;
  }
  return server;
}

// Results parsing is filesystem-heavy — cache per server for 15s since
// these endpoints are unauthenticated.
const resultsCache = new Map(); // key -> { ts, data }
function cachedResult(key, fn) {
  const hit = resultsCache.get(key);
  if (hit && Date.now() - hit.ts < 15000) return hit.data;
  const data = fn();
  resultsCache.set(key, { ts: Date.now(), data });
  return data;
}

// GET /api/public/results/:serverId — recent session results (list)
router.get('/results/:serverId', async (req, res) => {
  const server = await loadPublicServer(req, res);
  if (!server) return;
  res.json({ results: cachedResult(`list:${server.id}`, () => listResults(server, 50)) });
});

// GET /api/public/results/:serverId/:file — one result file (guid-stripped)
router.get('/results/:serverId/:file', async (req, res) => {
  const server = await loadPublicServer(req, res);
  if (!server) return;
  const r = cachedResult(`file:${server.id}:${req.params.file}`, () => getPublicResult(server, req.params.file));
  if (!r) return res.status(404).json({ error: 'Result not found' });
  res.json(r);
});

// GET /api/public/leaderboard/:serverId — best lap per driver/track/car
router.get('/leaderboard/:serverId', async (req, res) => {
  const server = await loadPublicServer(req, res);
  if (!server) return;
  res.json({ entries: cachedResult(`lb:${server.id}`, () => publicLeaderboard(server)) });
});

export default router;
