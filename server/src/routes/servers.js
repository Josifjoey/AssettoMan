import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDb, audit } from '../db.js';
import { requireAuth } from '../auth.js';
import { SERVERS_DIR } from '../paths.js';
import { DEFAULT_PORTS, defaultAcConfig, defaultAccConfig, ACC_TRACKS, ACC_CARS, ACC_CAR_GROUPS } from '../constants.js';
import {
  dockerAvailable, createContainer, inspectContainer,
  startContainer, stopContainer, restartContainer, removeContainer, containerLogs,
} from '../docker.js';
import { writeAcConfigs, listInstalledContent } from '../configAc.js';
import { writeAccConfigs, readAccConfigs, accServerExePresent } from '../configAcc.js';
import { getServerStatus, invalidateStatus } from '../status.js';

const router = Router();
router.use(requireAuth);

const VALID_TYPES = ['ac', 'ac_modded', 'acc'];

function rowToServer(row) {
  return {
    ...row,
    ports: JSON.parse(row.ports || '{}'),
    config: JSON.parse(row.config || '{}'),
    is_public: !!row.is_public,
  };
}

function writeConfigsFor(server) {
  if (server.type === 'acc') {
    writeAccConfigs(server.data_dir, { ...server.config, ports: server.ports });
  } else {
    writeAcConfigs(server.data_dir, { ...server.config, ports: server.ports });
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
  const { name, type, ports, steam, isPublic, publicBlurb } = req.body || {};
  if (!name || !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `name and type (${VALID_TYPES.join('/')}) required` });
  }

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
    container_name: `assettoman-${type}-${id.slice(0, 8)}`,
    ports: finalPorts,
    config,
    data_dir: path.join(SERVERS_DIR, id),
  };
  fs.mkdirSync(server.data_dir, { recursive: true });
  writeConfigsFor(server);

  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO servers (id, name, type, container_name, image, ports, config, data_dir, is_public, public_blurb, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'created', ?, ?, ?)`,
    id, name, type, server.container_name, null, JSON.stringify(finalPorts), JSON.stringify(config),
    server.data_dir, isPublic === false ? 0 : 1, publicBlurb || '', req.user.id, now, now
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
  writeConfigsFor(updated);

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

// POST /api/servers/:id/provision — (re)create the docker container
router.post('/:id/provision', async (req, res) => {
  const server = await loadServer(req, res);
  if (!server) return;
  if (!(await dockerAvailable())) return res.status(503).json({ error: 'Docker socket not reachable — mount /var/run/docker.sock' });

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

async function lifecycle(req, res, action, actionName) {
  const server = await loadServer(req, res);
  if (!server) return;
  const ref = server.container_id || server.container_name;
  if (!ref) return res.status(409).json({ error: 'Server not provisioned yet' });
  const db = await getDb();
  try {
    await action(ref);
    invalidateStatus(server.id);
    await audit(req.user.id, req.user.username, `server_${actionName}`, server.name);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}

router.post('/:id/start', (req, res) => lifecycle(req, res, startContainer, 'start'));
router.post('/:id/stop', (req, res) => lifecycle(req, res, (r) => stopContainer(r, 20), 'stop'));
router.post('/:id/restart', (req, res) => lifecycle(req, res, restartContainer, 'restart'));

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
  const ref = server.container_id || server.container_name;
  if (!ref) return res.status(409).json({ error: 'Server not provisioned' });
  try {
    const logs = await containerLogs(ref, Math.min(Number(req.query.tail) || 200, 1000));
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

// DELETE /api/servers/:id?keepFiles=1
router.delete('/:id', async (req, res) => {
  const server = await loadServer(req, res);
  if (!server) return;
  const ref = server.container_id || server.container_name;
  try {
    if (ref && (await inspectContainer(ref))) await removeContainer(ref);
  } catch { /* best effort */ }

  const db = await getDb();
  await db.run('DELETE FROM servers WHERE id = ?', server.id);
  await audit(req.user.id, req.user.username, 'server_deleted', server.name);

  if (req.query.keepFiles !== '1' && server.data_dir?.startsWith(SERVERS_DIR)) {
    fs.rmSync(server.data_dir, { recursive: true, force: true });
  }
  res.json({ ok: true });
});

export default router;
