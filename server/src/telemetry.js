import dgram from 'dgram';
import os from 'os';
import { inspectContainer } from './docker.js';
import { getDb } from './db.js';
import { getServerStatus } from './status.js';
import {
  parsePacket,
  buildRealtimeInterval, buildGetSessionInfo, buildBroadcastChat,
  buildSendChat, buildKick, buildNextSession, buildRestartSession, buildAdminCommand,
} from './acPlugin.js';

// Per-AC-server UDP telemetry listeners. acServer sends plugin events to
// UDP_PLUGIN_ADDRESS (us); we reply to UDP_PLUGIN_LOCAL_PORT (the server).

const sessions = new Map(); // serverId -> state

const EVENT_CAP = 100;
const LAP_HISTORY_CAP = 200;
const HANDSHAKE_INTERVAL_MS = 5000;
const HANDSHAKE_GIVEUP_MS = 120000;
const BROADCAST_THROTTLE_MS = 250;

export function managerAddressFor(server) {
  if (server.runtime === 'local') return '127.0.0.1';
  if (process.env.PLUGIN_ADDRESS) return process.env.PLUGIN_ADDRESS;
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return '127.0.0.1';
}

function containerIp(inspect) {
  const nets = inspect?.NetworkSettings?.Networks || {};
  for (const n of Object.values(nets)) {
    if (n.IPAddress) return n.IPAddress;
  }
  return inspect?.NetworkSettings?.IPAddress || null;
}

async function targetFor(st) {
  const port = st.server.ports?.plugin || (st.server.ports?.game || 9600) + 100;
  if (st.server.runtime === 'local') return { host: '127.0.0.1', port };
  const ref = st.server.container_id || st.server.container_name;
  try {
    const inspect = await inspectContainer(ref);
    const ip = containerIp(inspect);
    if (ip) return { host: ip, port };
  } catch { /* fall through */ }
  return st.target || { host: '127.0.0.1', port };
}

function pushEvent(st, ev) {
  st.events.push({ at: new Date().toISOString(), ...ev });
  if (st.events.length > EVENT_CAP) st.events.splice(0, st.events.length - EVENT_CAP);
  st.dirty = true;
}

function carRow(carId) {
  return {
    carId, driverName: null, driverGuid: null, driverTeam: null, model: null, skin: null,
    connected: false, loaded: false,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, speedKmh: 0,
    gear: 0, rpm: 0, splinePos: 0,
    laps: 0, bestLapMs: null, lastLapMs: null, lastLapCuts: 0, totalTimeMs: null,
    lapHistory: [], lastUpdate: null, disconnectAt: null,
  };
}

function handlePacket(st, msg) {
  const p = parsePacket(msg);
  if (!p || p.type === 'malformed' || p.type === 'unknown') return;
  st.lastPacketAt = Date.now();
  st.dirty = true;

  switch (p.type) {
    case 'version':
      st.protocolVersion = p.protocolVersion;
      break;

    case 'new_session':
    case 'session_info': {
      const isNew = p.type === 'new_session';
      st.session = {
        index: p.sessionIndex, currentIndex: p.currentSessionIndex, count: p.sessionCount,
        name: p.sessionName, type: p.sessionType, typeName: p.sessionTypeName,
        timeMinutes: p.timeMinutes, laps: p.laps, waitTime: p.waitTime,
        ambientTemp: p.ambientTemp, roadTemp: p.roadTemp, weather: p.weatherGraphics,
        elapsedMs: p.elapsedMs, receivedAt: Date.now(),
        track: p.track, trackConfig: p.trackConfig, serverName: p.serverName,
      };
      if (isNew) {
        for (const c of st.cars.values()) {
          c.laps = 0; c.bestLapMs = null; c.lastLapMs = null; c.totalTimeMs = null;
          c.lapHistory = []; c.loaded = false;
        }
        pushEvent(st, { type: 'session', text: `Session started: ${p.sessionName} (${p.sessionTypeName})` });
      }
      break;
    }

    case 'end_session':
      pushEvent(st, { type: 'session', text: 'Session ended' });
      break;

    case 'new_connection': {
      const c = st.cars.get(p.carId) || carRow(p.carId);
      c.driverName = p.driverName; c.driverGuid = p.driverGuid;
      c.model = p.carModel; c.skin = p.carSkin;
      c.connected = true; c.loaded = false; c.disconnectAt = null;
      st.cars.set(p.carId, c);
      pushEvent(st, { type: 'join', carId: p.carId, text: `${p.driverName} connected (${p.carModel})` });
      break;
    }

    case 'connection_closed': {
      const c = st.cars.get(p.carId);
      if (c) { c.connected = false; c.loaded = false; c.disconnectAt = Date.now(); }
      pushEvent(st, { type: 'leave', carId: p.carId, text: `${p.driverName || `Car ${p.carId}`} left` });
      break;
    }

    case 'client_loaded': {
      const c = st.cars.get(p.carId);
      if (c) c.loaded = true;
      break;
    }

    case 'car_update': {
      const c = st.cars.get(p.carId) || carRow(p.carId);
      c.pos = p.pos; c.vel = p.vel;
      c.speedKmh = Math.sqrt(p.vel.x ** 2 + p.vel.y ** 2 + p.vel.z ** 2) * 3.6;
      c.gear = p.gear; c.rpm = p.engineRpm; c.splinePos = p.normalizedSplinePos;
      c.lastUpdate = Date.now();
      st.cars.set(p.carId, c);
      break;
    }

    case 'car_info': {
      const c = st.cars.get(p.carId) || carRow(p.carId);
      c.driverName = p.driverName; c.driverGuid = p.driverGuid; c.driverTeam = p.driverTeam;
      c.model = p.carModel; c.skin = p.carSkin; c.connected = p.isConnected;
      st.cars.set(p.carId, c);
      break;
    }

    case 'lap_completed': {
      const c = st.cars.get(p.carId) || carRow(p.carId);
      c.lastLapMs = p.lapTimeMs; c.lastLapCuts = p.cuts;
      if (!c.bestLapMs || p.lapTimeMs < c.bestLapMs) c.bestLapMs = p.lapTimeMs;
      c.lapHistory.push({ ms: p.lapTimeMs, cuts: p.cuts, at: new Date().toISOString() });
      if (c.lapHistory.length > LAP_HISTORY_CAP) c.lapHistory.splice(0, c.lapHistory.length - LAP_HISTORY_CAP);
      c.laps += 1;
      st.cars.set(p.carId, c);
      for (const e of p.leaderboard) {
        const ec = st.cars.get(e.carId) || carRow(e.carId);
        ec.totalTimeMs = e.totalTimeMs; ec.laps = e.laps;
        st.cars.set(e.carId, ec);
      }
      pushEvent(st, { type: 'lap', carId: p.carId, text: `${c.driverName || `Car ${p.carId}`} lap ${fmtMs(p.lapTimeMs)}${p.cuts ? ` (${p.cuts} cuts)` : ''}` });
      break;
    }

    case 'chat': {
      const c = st.cars.get(p.carId);
      pushEvent(st, { type: 'chat', carId: p.carId, text: `${c?.driverName || `Car ${p.carId}`}: ${p.message}` });
      break;
    }

    case 'client_event': {
      if (p.eventType === 10 || p.eventType === 11) {
        const a = st.cars.get(p.carId)?.driverName || `Car ${p.carId}`;
        const b = p.eventType === 10 ? (st.cars.get(p.otherCarId)?.driverName || `Car ${p.otherCarId}`) : 'the wall';
        pushEvent(st, { type: 'collision', carId: p.carId, text: `${a} hit ${b} at ${p.impactSpeed.toFixed(0)} km/h` });
      }
      break;
    }

    case 'error':
      pushEvent(st, { type: 'session', text: `Server error: ${p.message}` });
      break;
  }
}

function fmtMs(ms) {
  if (ms == null) return '—';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mm = String(ms % 1000).padStart(3, '0');
  return `${m}:${String(s).padStart(2, '0')}.${mm}`;
}

export function getSnapshot(serverId, { stripGuid = false } = {}) {
  const st = sessions.get(serverId);
  if (!st) return { active: false };
  // Drop cars that disconnected more than 60s ago.
  for (const [id, c] of st.cars) {
    if (!c.connected && c.disconnectAt && Date.now() - c.disconnectAt > 60000) st.cars.delete(id);
  }
  const cars = [...st.cars.values()];
  const isRace = st.session?.type === 3;
  if (isRace) {
    cars.sort((a, b) => (b.laps - a.laps) || (b.splinePos - a.splinePos));
  } else {
    cars.sort((a, b) => (a.bestLapMs ?? Infinity) - (b.bestLapMs ?? Infinity) || (b.laps - a.laps));
  }
  const leader = cars[0];
  const leaderboard = cars.map((c, i) => {
    let gapToLeader = '';
    if (i > 0 && leader) {
      if (isRace) gapToLeader = leader.laps > c.laps ? `+${leader.laps - c.laps} lap${leader.laps - c.laps > 1 ? 's' : ''}` : '';
      else if (c.bestLapMs && leader.bestLapMs) gapToLeader = `+${((c.bestLapMs - leader.bestLapMs) / 1000).toFixed(3)}`;
    }
    const row = { position: i + 1, gapToLeader, ...c };
    if (stripGuid) delete row.driverGuid;
    return row;
  });

  let sessionTimeRemainingMs = null;
  if (st.session && st.session.timeMinutes > 0 && st.session.laps === 0) {
    sessionTimeRemainingMs = st.session.timeMinutes * 60000 - st.session.elapsedMs - (Date.now() - st.session.receivedAt);
  }

  return {
    active: true,
    session: st.session,
    cars: leaderboard,
    events: st.events.slice(-30).reverse(),
    connectedCount: cars.filter((c) => c.connected).length,
    sessionTimeRemainingMs,
    lastPacketAt: st.lastPacketAt ? new Date(st.lastPacketAt).toISOString() : null,
    trackMapTrack: st.session?.track || null,
    trackMapLayout: st.session?.trackConfig || null,
  };
}

export function subscribe(serverId, fn) {
  const st = sessions.get(serverId);
  if (!st) return () => {};
  st.subscribers.add(fn);
  return () => st.subscribers.delete(fn);
}

function scheduleBroadcast(st) {
  if (!st.dirty || st.broadcastTimer) return;
  st.broadcastTimer = setTimeout(() => {
    st.broadcastTimer = null;
    if (!st.dirty) return;
    st.dirty = false;
    const snap = getSnapshot(st.server.id);
    for (const fn of st.subscribers) {
      try { fn(snap); } catch { /* subscriber error */ }
    }
  }, BROADCAST_THROTTLE_MS);
}

async function send(st, buf) {
  if (!st.target) st.target = await targetFor(st);
  st.socket.send(buf, st.target.port, st.target.host, async (err) => {
    if (err) st.target = await targetFor(st); // re-resolve on failure
  });
}

export function telemetrySend(serverId, kind, payload) {
  const st = sessions.get(serverId);
  if (!st) return false;
  const builders = {
    chat: () => buildBroadcastChat(payload.message),
    sendChat: () => buildSendChat(payload.carId, payload.message),
    kick: () => buildKick(payload.carId),
    nextSession: () => buildNextSession(),
    restartSession: () => buildRestartSession(),
    admin: () => buildAdminCommand(payload.command),
  };
  const b = builders[kind];
  if (!b) return false;
  send(st, b());
  return true;
}

export async function startTelemetry(server) {
  if (server.type === 'acc' || sessions.has(server.id)) return;
  if (server.config?.telemetry && server.config.telemetry.enabled === false) return;

  const ports = server.ports || {};
  const listenPort = ports.pluginListen || (ports.game || 9600) + 101;

  const st = {
    server,
    socket: dgram.createSocket('udp4'),
    fwdSocket: null,
    target: null,
    session: null,
    cars: new Map(),
    events: [],
    lastPacketAt: null,
    protocolVersion: null,
    subscribers: new Set(),
    dirty: false,
    broadcastTimer: null,
    handshakeTimer: null,
    startedAt: Date.now(),
    gotFirstPacket: false,
  };
  st.socket.on('error', (e) => {
    pushEvent(st, { type: 'session', text: `Telemetry socket error: ${e.message}` });
  });

  st.socket.on('message', (msg, rinfo) => {
    if (!st.gotFirstPacket) {
      st.gotFirstPacket = true;
      // Ask for position updates + current session.
      send(st, buildRealtimeInterval(250));
      send(st, buildGetSessionInfo(-1));
      if (st.handshakeTimer) { clearInterval(st.handshakeTimer); st.handshakeTimer = null; }
    }
    // Relay raw packet to forward target (sTracker etc.)
    if (st.fwdTarget) {
      st.socket.send(msg, st.fwdTarget.port, st.fwdTarget.host, () => {});
    }
    try {
      handlePacket(st, msg);
      scheduleBroadcast(st);
    } catch { /* defensive — never let a packet kill the listener */ }
  });

  try {
    await new Promise((resolve, reject) => {
      st.socket.once('error', reject);
      st.socket.bind(listenPort, '0.0.0.0', () => {
        st.socket.off('error', reject);
        resolve();
      });
    });
  } catch (e) {
    sessions.delete(server.id);
    try { st.socket.close(); } catch { /* ignore */ }
    throw e;
  }
  sessions.set(server.id, st);
  st.target = await targetFor(st);

  // Retry handshake until the server answers (or give up after ~2min).
  st.handshakeTimer = setInterval(() => {
    if (st.gotFirstPacket || Date.now() - st.startedAt > HANDSHAKE_GIVEUP_MS) {
      clearInterval(st.handshakeTimer); st.handshakeTimer = null;
      return;
    }
    send(st, buildGetSessionInfo(-1));
  }, HANDSHAKE_INTERVAL_MS);

  // Optional bidirectional forward (sTracker, pTracker…)
  const fwd = server.config?.telemetry?.forwardTo;
  if (fwd && /^[^:]+:\d+$/.test(fwd.trim())) {
    const [host, portStr] = fwd.trim().split(':');
    st.fwdTarget = { host, port: +portStr };
    st.fwdSocket = dgram.createSocket('udp4');
    st.fwdSocket.on('message', (msg) => {
      if (st.target) st.socket.send(msg, st.target.port, st.target.host, () => {});
    });
    st.fwdSocket.on('error', () => {});
    st.fwdSocket.bind(0, '0.0.0.0');
  }
}

export function stopTelemetry(serverId) {
  const st = sessions.get(serverId);
  if (!st) return;
  sessions.delete(serverId);
  try { st.socket.close(); } catch { /* already closed */ }
  try { st.fwdSocket?.close(); } catch { /* already closed */ }
  if (st.handshakeTimer) clearInterval(st.handshakeTimer);
  if (st.broadcastTimer) clearTimeout(st.broadcastTimer);
}

export function isLive(serverId) {
  const st = sessions.get(serverId);
  return !!(st && st.lastPacketAt && Date.now() - st.lastPacketAt < 30000);
}

// On backend boot: start listeners for AC servers that are already running.
export async function resumeTelemetry() {
  try {
    const db = await getDb();
    const rows = await db.all("SELECT * FROM servers WHERE type != 'acc'");
    for (const row of rows) {
      const server = { ...row, ports: JSON.parse(row.ports || '{}'), config: JSON.parse(row.config || '{}') };
      try {
        const status = await getServerStatus(server);
        if (status.running) await startTelemetry(server);
      } catch { /* per-server best effort */ }
    }
  } catch { /* db not ready — skip */ }
}
