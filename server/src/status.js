import { inspectContainer } from './docker.js';
import { localStatus } from './local.js';

// Live status per server: container state + (for AC) the built-in HTTP API
// which reports track, connected clients and more.

const cache = new Map(); // serverId -> { ts, data }
const CACHE_MS = 8000;

function containerIp(inspect) {
  const nets = inspect?.NetworkSettings?.Networks || {};
  for (const n of Object.values(nets)) {
    if (n.IPAddress) return n.IPAddress;
  }
  return inspect?.NetworkSettings?.IPAddress || null;
}

async function fetchJson(url, timeoutMs = 4000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const text = await res.text();
    try { return JSON.parse(text); } catch { return null; }
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// AC's acServer exposes a small HTTP API on HTTP_PORT: /INFO, /ENTRY etc.
async function queryAcApi(containerIpAddr, httpPort) {
  const hosts = [containerIpAddr, process.env.GAME_HOST, 'host.docker.internal'].filter(Boolean);
  for (const host of hosts) {
    const info = await fetchJson(`http://${host}:${httpPort}/INFO`);
    if (info) return info;
  }
  return null;
}

export async function getServerStatus(server) {
  const cached = cache.get(server.id);
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.data;

  const data = await computeStatus(server);
  cache.set(server.id, { ts: Date.now(), data });
  return data;
}

async function computeStatus(server) {
  // Local runtime — game exe runs as a child process on this machine.
  if (server.runtime === 'local') {
    const st = localStatus(server);
    const base = {
      state: st.running ? 'running' : 'stopped',
      running: st.running,
      pid: st.pid,
      startedAt: st.startedAt,
      players: null,
      maxPlayers: null,
      track: trackFromConfig(server),
    };
    if (st.running && server.type !== 'acc') {
      const cfg = typeof server.config === 'string' ? JSON.parse(server.config) : server.config;
      const httpPort = server.ports?.http || cfg?.ports?.http || 8081;
      const info = await fetchJson(`http://127.0.0.1:${httpPort}/INFO`);
      if (info) {
        base.players = info.clients ?? info.Clients ?? null;
        base.maxPlayers = info.maxclients ?? info.maxClients ?? null;
        if (info.track) base.track = info.track;
        if (info.name) base.serverName = info.name;
        base.apiReachable = true;
      } else {
        base.apiReachable = false;
      }
    }
    return base;
  }

  const containerRef = server.container_id || server.container_name;
  if (!containerRef) {
    return { state: 'not_provisioned', running: false, players: null, maxPlayers: null, track: trackFromConfig(server) };
  }

  const inspect = await inspectContainer(containerRef);
  if (!inspect) {
    return { state: 'missing', running: false, players: null, maxPlayers: null, track: trackFromConfig(server), note: 'Container not found — provision it first.' };
  }

  const running = !!inspect.State?.Running;
  const base = {
    state: running ? 'running' : (inspect.State?.Status || 'stopped'),
    running,
    startedAt: inspect.State?.StartedAt,
    exitCode: inspect.State?.ExitCode,
    players: null,
    maxPlayers: null,
    track: trackFromConfig(server),
  };

  if (running && server.type !== 'acc') {
    const cfg = typeof server.config === 'string' ? JSON.parse(server.config) : server.config;
    const httpPort = server.parsedPorts?.http || cfg?.ports?.http || 8081;
    const info = await queryAcApi(containerIp(inspect), httpPort);
    if (info) {
      base.players = info.clients ?? info.Clients ?? null;
      base.maxPlayers = info.maxclients ?? info.maxClients ?? null;
      if (info.track) base.track = info.track;
      if (info.name) base.serverName = info.name;
      base.apiReachable = true;
    } else {
      base.apiReachable = false;
    }
  }

  return base;
}

function trackFromConfig(server) {
  try {
    const cfg = typeof server.config === 'string' ? JSON.parse(server.config) : server.config;
    if (server.type === 'acc') return cfg?.event?.track || null;
    return cfg?.server?.track || null;
  } catch {
    return null;
  }
}

export function invalidateStatus(serverId) {
  cache.delete(serverId);
}
