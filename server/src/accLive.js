import { inspectContainer, containerLogs } from './docker.js';
import { localLogs } from './local.js';

// ACC's dedicated server exposes no telemetry API — we replay its stdout
// log tail to derive connected drivers + session phase.
//
// Verified against real accServer.exe output:
//   https://gist.github.com/pedrofaria/ab057054e31eb5c7960a79fe3116c3d9
//   https://www.overtake.gg/threads/some-problem-with-dedicated-server.235725/
//   https://github.com/CubeCoders/AMPTemplates/blob/main/assetto-corsa-comp.kvp

const RE_CONNECT = /New connection request: id (?<connId>\d+) (?<name>.+?) (?<steam>S\d+) on car model (?<model>\d+)/;
const RE_CARLINK = /Creating new car connection: carId (?<carId>\d+), carModel (?<model>\d+), raceNumber #?(?<race>\d+)/;
const RE_CLOSE = /Client (?<connId>\d+) closed the connection/;
const RE_DEAD = /Removing dead connection (?<connId>\d+)/;
const RE_CAR_GONE = /car (?<carId>\d+) has no driving connection anymore/;
const RE_CONNID_GONE = /Disconnecting connId (?<connId>\d+)/;
const RE_SESSION = /Session changed: (?<from>.+?) -> (?<to>.+?) (?<idx>\d+)/;
const RE_PHASE = /Detected sessionPhase(?: .+?)? -> \((?<phase>\w+)\)/;
const RE_TRACK = /Track (?<track>\w+) was set/;
// Printed once when accServer boots — anything before it is a previous run.
const RE_STARTUP = /Listening to TCP \d+ \| UDP \d+/;

export function parseAccLog(text) {
  const conns = new Map(); // connId -> { name, steamId, carModel }
  const carIds = new Map(); // carId -> connId (last pending conn)
  let pendingConnId = null;
  let sessionType = null;
  let sessionPhase = null;
  let track = null;

  for (const line of text.split('\n')) {
    let m;
    if (RE_STARTUP.test(line)) {
      // Server restarted inside the log tail — drop everything before it.
      conns.clear(); carIds.clear(); pendingConnId = null;
      sessionType = null; sessionPhase = null; track = null;
      continue;
    }
    m = RE_CONNECT.exec(line);
    if (m) {
      pendingConnId = m.groups.connId;
      conns.set(m.groups.connId, { name: m.groups.name.trim(), steamId: m.groups.steam, carModel: +m.groups.model, carId: null });
      continue;
    }
    m = RE_CARLINK.exec(line);
    if (m) {
      carIds.set(+m.groups.carId, pendingConnId);
      if (pendingConnId && conns.has(pendingConnId)) conns.get(pendingConnId).carId = +m.groups.carId;
      continue;
    }
    m = RE_CLOSE.exec(line) || RE_DEAD.exec(line) || RE_CONNID_GONE.exec(line);
    if (m) {
      conns.delete(m.groups.connId);
      continue;
    }
    m = RE_CAR_GONE.exec(line);
    if (m) {
      const connId = carIds.get(+m.groups.carId);
      if (connId) conns.delete(connId);
      carIds.delete(+m.groups.carId);
      continue;
    }
    m = RE_SESSION.exec(line);
    if (m) { sessionType = m.groups.to.trim(); continue; }
    m = RE_PHASE.exec(line);
    if (m) { sessionPhase = m.groups.phase; continue; }
    m = RE_TRACK.exec(line);
    if (m) { track = m.groups.track; continue; }
  }

  return {
    sessionType,
    sessionPhase,
    track,
    drivers: [...conns.values()],
    connectedCount: conns.size,
  };
}

const cache = new Map(); // serverId -> { ts, data }
const CACHE_MS = 5000;
const TAIL_LINES = 2000;

async function logTail(server) {
  if (server.runtime === 'local') {
    const logs = localLogs(server);
    return logs.split('\n').slice(-TAIL_LINES).join('\n');
  }
  const ref = server.container_id || server.container_name;
  if (!ref) return '';
  try {
    return await containerLogs(ref, TAIL_LINES);
  } catch {
    return '';
  }
}

export async function getAccLive(server) {
  const cached = cache.get(server.id);
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.data;
  const data = { ...parseAccLog(await logTail(server)), updatedAt: new Date().toISOString() };
  cache.set(server.id, { ts: Date.now(), data });
  return data;
}
