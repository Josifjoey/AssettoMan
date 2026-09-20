import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDb, audit, getSetting } from '../db.js';
import { requireAuth } from '../auth.js';
import { SERVERS_DIR } from '../paths.js';
import { DEFAULT_PORTS, defaultAcConfig, defaultAccConfig, ACC_TRACKS, ACC_CARS, ACC_CAR_GROUPS } from '../constants.js';
import {
  dockerAvailable, createContainer, inspectContainer,
  startContainer, stopContainer, restartContainer, removeContainer, containerLogs,
} from '../docker.js';
import { localExePath, localExePresent, localStart, localStop, localRestart, localLogs } from '../local.js';
import { writeAcConfigs, listInstalledContent } from '../configAc.js';
import { writeAccConfigs, readAccConfigs, accServerExePresent } from '../configAcc.js';
import { getServerStatus, invalidateStatus } from '../status.js';
import { writeCmContent, cmContentStatus } from '../cmContent.js';
import { writeAssettoServerExtraCfg } from '../configAssettoServer.js';
import { listResults, getResult } from '../results.js';
import { startTelemetry, stopTelemetry, getSnapshot, telemetrySend, managerAddressFor } from '../telemetry.js';

const router = Router();
router.use(requireAuth);

const VALID_TYPES = ['ac', 'ac_modded', 'assettoserver', 'acc'];

function rowToServer(row) {
  const ports = JSON.parse(row.ports || '{}');
  // Older rows predate the telemetry ports — derive them from the game port.
  if (row.type !== 'acc' && !ports.plugin) {
    ports.plugin = (ports.game || 9600) + 100;
    ports.pluginListen = (ports.game || 9600) + 101;
  }
  return {
    ...row,
    ports,
    config: JSON.parse(row.config || '{}'),
    is_public: !!row.is_public,
  };
}

function writeConfigsFor(server) {
  if (server.type === 'acc') {
    writeAccConfigs(server.data_dir, { ...server.config, ports: server.ports });
  } else {
    writeAcConfigs(server.data_dir, { ...server.config, ports: server.ports }, { pluginAddress: managerAddressFor(server) });
  }
}

// Writes game configs + CM content.json. Async side effects are best-effort.
async function writeAllConfigs(server) {
  writeConfigsFor(server);
  if (server.type === 'assettoserver') {
    try {
      await writeAssettoServerExtraCfg(server.data_dir, server.config, {
        telemetryEnabled: server.config?.telemetry?.enabled !== false,
      });
    } catch { /* extra_cfg is best-effort */ }
  }
  if (server.type !== 'acc') {
    try {
      const baseUrl = String(await getSetting('public_base_url', '')).replace(/\/+$/, '');
      await writeCmContent(server, baseUrl);
    } catch { /* cm_content is best-effort */ }
  }
}

// GET /api/servers — list with live status
router.get('/', async (req, res) => {
  const db = await getDb();
  const rows = await db.all('SELECT * FROM servers ORDER BY created_at');
  const servers = [];
  for (const row of rows) {
    const s = rowToServer(row);
    s.live = await getServerStatus(s);
    // strip secrets
    if (s.config?.steam) s.config.steam = { username: s.config.steam.username ? '•••' : '', password: s.config.steam.password ? '•••' : '' };
    servers.push(s);
  }
  res.json({ servers, docker: await dockerAvailable() });
});

// GET /api/servers/meta — constants for forms (tracks, cars, groups)
router.get('/meta', (req, res) => {
  res.json({ accTracks: ACC_TRACKS, accCars: ACC_CARS, accCarGroups: ACC_CAR_GROUPS, defaultPorts: DEFAULT_PORTS });
});

// POST /api/servers — create a new managed server
router.post('/', async (req, res) => {
  const { name, type, ports, steam, isPublic, publicBlurb, runtime } = req.body || {};
  if (!name || !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `name and type (${VALID_TYPES.join('/')}) required` });
  }
  const finalRuntime = ['docker', 'local'].includes(runtime)
    ? runtime
    : (process.platform === 'win32' ? 'local' : 'docker');

  const db = await getDb();
  const id = crypto.randomUUID();
  const finalPorts = { ...DEFAULT_PORTS[type], ...(ports || {}) };
  const config = type === 'acc'
    ? { ...defaultAccConfig() }
    : { ...defaultAcConfig() };
  if (steam) config.steam = steam;

  const server = {
    id,
    name,
    type,
    runtime: finalRuntime,
    container_name: finalRuntime === 'docker' ? `assettoman-${type}-${id.slice(0, 8)}` : null,
    ports: finalPorts,
    config,
    data_dir: path.join(SERVERS_DIR, id),
  };
  fs.mkdirSync(server.data_dir, { recursive: true });
  await writeAllConfigs(server);

  const now = new Date().toISOString();
  const status = finalRuntime === 'local' ? 'provisioned' : 'created';
  await db.run(
    `INSERT INTO servers (id, name, type, runtime, container_name, image, ports, config, data_dir, is_public, public_blurb, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, name, type, finalRuntime, server.container_name, null, JSON.stringify(finalPorts), JSON.stringify(config),
    server.data_dir, isPublic === false ? 0 : 1, publicBlurb || '', status, req.user.id, now, now
  );
  await audit(req.user.id, req.user.username, 'server_created', `${name} (${type})`);
  const row = await db.get('SELECT * FROM servers WHERE id = ?', id);
  res.status(201).json({ server: rowToServer(row) });
});

async function loadServer(req, res) {
  const db = await getDb();
  const row = await db.get('SELECT * FROM servers WHERE id = ?', req.params.id);
  if (!row) {
    res.status(404).json({ error: 'Server not found' });
    return null;
  }
  return rowToServer(row);
}

// GET /api/servers/:id
router.get('/:id', async (req, res) => {
  const server = await loadServer(req, res);
  if (!server) return;
  server.live = await getServerStatus(server);
  if (server.type === 'acc') {
    server.accExePresent = accServerExePresent(server.data_dir);
    server.cfgOnDisk = readAccConfigs(server.data_dir);
  } else {
    server.installed = listInstalledContent(server.data_dir);
  }
  if (server.runtime === 'local') {
    server.exePath = localExePath(server);
    server.exePresent = localExePresent(server);
  }
  if (server.config?.steam) server.config.steam = { username: server.config.steam.username ? '•••' : '', password: server.config.steam.password ? '•••' : '' };
  res.json({ server });
});

// PUT /api/servers/:id/config — save full config object; writes files if not running
router.put('/:id/config', async (req, res) => {
  const server = await loadServer(req, res);
  if (!server) return;
  const { config, ports, name, isPublic, publicBlurb, steam } = req.body || {};

  const live = await getServerStatus(server);
  if (live.running) {
    return res.status(409).json({ error: 'Stop the server before changing configuration' });
  }

  const merged = { ...server.config, ...(config || {}) };
  if (steam?.username !== undefined) merged.steam = steam;
  // Never persist the masked placeholder sent back to clients — restore real creds.
  if (merged.steam && (merged.steam.password === '•••' || merged.steam.username === '•••')) {
    merged.steam = server.config.steam;
  }
  const mergedPorts = { ...server.ports, ...(ports || {}) };

  const updated = { ...server, config: merged, ports: mergedPorts };
  await writeAllConfigs(updated);

  const db = await getDb();
  await db.run(
    'UPDATE servers SET config = ?, ports = ?, name = COALESCE(?, name), is_public = COALESCE(?, is_public), public_blurb = COALESCE(?, public_blurb), updated_at = ? WHERE id = ?',
    JSON.stringify(merged), JSON.stringify(mergedPorts), name ?? null,
    isPublic === undefined ? null : (isPublic ? 1 : 0), publicBlurb ?? null,
    new Date().toISOString(), server.id
  );
  invalidateStatus(server.id);
  res.json({ ok: true });
});

// POST /api/servers/:id/provision — (re)create the docker container, or for
// local runtime just verify the game executable is in place
router.post('/:id/provision', async (req, res) => {
  const server = await loadServer(req, res);
  if (!server) return;

  if (server.runtime === 'local') {
    if (!localExePresent(server)) {
      return res.status(400).json({ error: `Executable not found — place it at ${localExePath(server)}` });
    }
    const db0 = await getDb();
    await db0.run('UPDATE servers SET status = ?, updated_at = ? WHERE id = ?', 'provisioned', new Date().toISOString(), server.id);
    return res.json({ ok: true });
  }

  if (!(await dockerAvailable())) return res.status(503).json({ error: 'Docker socket not reachable — mount /var/run/docker.sock' });

  await writeAllConfigs(server);
  const db = await getDb();
  try {
    const existing = await inspectContainer(server.container_id || server.container_name);
    if (existing) {
      if (existing.State?.Running) return res.status(409).json({ error: 'Server is running — stop it first' });
      await removeContainer(existing.Id);
    }
    const containerId = await createContainer(server);
    await db.run('UPDATE servers SET container_id = ?, status = ?, updated_at = ? WHERE id = ?',
      containerId, 'provisioned', new Date().toISOString(), server.id);
    invalidateStatus(server.id);
    res.json({ ok: true, containerId });
  } catch (err) {
    await db.run('UPDATE servers SET last_error = ?, updated_at = ? WHERE id = ?', String(err), new Date().toISOString(), server.id);
    res.status(500).json({ error: `Provisioning failed: ${err.message || err}` });
  }
});

async function lifecycle(req, res, localFn, dockerFn, actionName) {
  const server = await loadServer(req, res);
  if (!server) return;
  const db = await getDb();
  try {
    // Rewrite configs right before start/restart (telemetry manager address,
    // cm_content links can change between runs).
    if ((actionName === 'start' || actionName === 'restart') && server.type !== 'acc') {
      await writeAllConfigs(server);
    }
    if (server.runtime === 'local') {
      await localFn(server);
    } else {
      const ref = server.container_id || server.container_name;
      if (!ref) return res.status(409).json({ error: 'Server not provisioned yet' });
      await dockerFn(ref);
    }
    invalidateStatus(server.id);
    if (server.type !== 'acc') {
      try {
        if (actionName === 'start') await startTelemetry(server);
        else if (actionName === 'stop' || actionName === 'restart') {
          stopTelemetry(server.id);
          if (actionName === 'restart') await startTelemetry(server);
        }
      } catch { /* telemetry is best-effort */ }
    }
    await audit(req.user.id, req.user.username, `server_${actionName}`, server.name);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}

router.post('/:id/start', (req, res) => lifecycle(req, res, localStart, startContainer, 'start'));
router.post('/:id/stop', (req, res) => lifecycle(req, res, localStop, (r) => stopContainer(r, 20), 'stop'));
router.post('/:id/restart', (req, res) => lifecycle(req, res, localRestart, restartContainer, 'restart'));

// GET /api/servers/:id/status
router.get('/:id/status', async (req, res) => {
  const server = await loadServer(req, res);
  if (!server) return;
  res.json({ status: await getServerStatus(server) });
});

// GET /api/servers/:id/logs?tail=200
router.get('/:id/logs', async (req, res) => {
  const server = await loadServer(req, res);
  if (!server) return;
  try {
    if (server.runtime === 'local') {
      const full = localLogs(server);
      const tail = Math.min(Number(req.query.tail) || 200, 1000);
      return res.json({ logs: full.split('\n').slice(-tail).join('\n') });
    }
    const ref = server.container_id || server.container_name;
    if (!ref) return res.status(409).json({ error: 'Server not provisioned' });
    const logs = await containerLogs(ref, Math.min(Number(req.query.tail) || 200, 1000));
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

// ---- telemetry (AC only) ----

// GET /api/servers/:id/telemetry — admin snapshot (keeps driverGuid)
router.get('/:id/telemetry', async (req, res) => {
  const server = await loadServer(req, res);
  if (!server) return;
  if (server.type === 'acc') return res.status(400).json({ error: 'ACC has no plugin telemetry' });
  res.json(getSnapshot(server.id));
});

function telemetryAction(kind, payload, auditAction, detail) {
  return async (req, res) => {
    const server = await loadServer(req, res);
    if (!server) return;
    if (server.type === 'acc') return res.status(400).json({ error: 'ACC has no plugin telemetry' });
    const p = typeof payload === 'function' ? payload(req) : payload;
    if (!telemetrySend(server.id, kind, p)) {
      return res.status(409).json({ error: 'Telemetry not active — is the server running with telemetry enabled?' });
    }
    await audit(req.user.id, req.user.username, auditAction, typeof detail === 'function' ? detail(req, server) : `${server.name}`);
    res.json({ ok: true });
  };
}

router.post('/:id/telemetry/chat', telemetryAction('chat', (req) => ({ message: String(req.body?.message || '').slice(0, 200) }), 'telemetry_chat', (req, s) => `${s.name}: ${String(req.body?.message || '').slice(0, 80)}`));
router.post('/:id/telemetry/kick', telemetryAction('kick', (req) => ({ carId: +req.body?.carId }), 'telemetry_kick', (req, s) => `${s.name}: car ${req.body?.carId}`));
router.post('/:id/telemetry/next-session', telemetryAction('nextSession', {}, 'telemetry_next_session'));
router.post('/:id/telemetry/restart-session', telemetryAction('restartSession', {}, 'telemetry_restart_session'));
router.post('/:id/telemetry/admin', telemetryAction('admin', (req) => ({ command: String(req.body?.command || '').slice(0, 200) }), 'telemetry_admin', (req, s) => `${s.name}: ${String(req.body?.command || '').slice(0, 80)}`));

// GET /api/servers/:id/results — session result archive (list)
router.get('/:id/results', async (req, res) => {
  const server = await loadServer(req, res);
  if (!server) return;
  res.json({ results: listResults(server) });
});

// GET /api/servers/:id/results/:file — one result file (full)
router.get('/:id/results/:file', async (req, res) => {
  const server = await loadServer(req, res);
  if (!server) return;
  const r = getResult(server, req.params.file);
  if (!r) return res.status(404).json({ error: 'Result not found' });
  res.json(r);
});

// GET /api/servers/:id/cm-content — generated CM content.json + missing links
router.get('/:id/cm-content', async (req, res) => {
  const server = await loadServer(req, res);
  if (!server) return;
  if (server.type === 'acc') return res.status(400).json({ error: 'ACC servers have no mod content' });
  res.json(await cmContentStatus(server));
});

// DELETE /api/servers/:id?keepFiles=1
router.delete('/:id', async (req, res) => {
  const server = await loadServer(req, res);
  if (!server) return;
  if (server.runtime === 'local') {
    try { localStop(server); } catch { /* best effort */ }
  } else {
    const ref = server.container_id || server.container_name;
    try {
      if (ref && (await inspectContainer(ref))) await removeContainer(ref);
    } catch { /* best effort */ }
  }

  stopTelemetry(server.id);
  const db = await getDb();
  await db.run('DELETE FROM servers WHERE id = ?', server.id);
  await audit(req.user.id, req.user.username, 'server_deleted', server.name);

  if (req.query.keepFiles !== '1' && server.data_dir?.startsWith(SERVERS_DIR)) {
    fs.rmSync(server.data_dir, { recursive: true, force: true });
  }
  res.json({ ok: true });
});

export default router;
