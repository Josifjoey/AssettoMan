import fs from 'fs';
import path from 'path';
import { ACC_CARS } from './constants.js';

// Reads session result files written by acServer / accServer and
// normalizes them into one shape for the admin + public APIs.

const SAFE_FILE = /^[A-Za-z0-9_\-. ]+\.json$/;

export function resultsDir(server) {
  return server.type === 'acc'
    ? path.join(server.data_dir, 'acc', 'results')
    : path.join(server.data_dir, 'serverfiles', 'results');
}

function readJson(file) {
  const buf = fs.readFileSync(file);
  let text;
  if ((buf[0] === 0xff && buf[1] === 0xfe) || (buf.length > 3 && buf[1] === 0 && buf[3] === 0)) {
    text = buf.toString('utf16le').replace(/^﻿/, '');
  } else {
    text = buf.toString('utf8').replace(/^﻿/, '');
  }
  text = text.replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(text);
}

function saneMs(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n >= 999999999) return null;
  return n;
}

// AC: 240830_211530_R.json / 2024_8_30_21_15_FP.json style names — lenient.
function dateFromName(name, mtime) {
  let m = name.match(/(\d{4})_(\d{1,2})_(\d{1,2})_(\d{1,2})_(\d{1,2})(?:_(\d{1,2}))?/);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    if (!isNaN(d)) return d.toISOString();
  }
  m = name.match(/(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  if (m) {
    const d = new Date(2000 + +m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    if (!isNaN(d)) return d.toISOString();
  }
  return mtime.toISOString();
}

function orderResults(rows, isRace) {
  if (isRace) rows.sort((a, b) => (b.lapCount - a.lapCount) || ((a.totalTimeMs ?? Infinity) - (b.totalTimeMs ?? Infinity)));
  else rows.sort((a, b) => (a.bestLapMs ?? Infinity) - (b.bestLapMs ?? Infinity));
  const leader = rows[0];
  rows.forEach((r, i) => {
    r.position = i + 1;
    r.gapMs = i === 0 ? null
      : isRace && leader.totalTimeMs != null && r.totalTimeMs != null ? r.totalTimeMs - leader.totalTimeMs
      : !isRace && leader.bestLapMs != null && r.bestLapMs != null ? r.bestLapMs - leader.bestLapMs
      : null;
  });
  return rows;
}

function normalizeAc(json, file, mtime) {
  const carById = new Map((json.Cars || []).map((c) => [c.CarId, c]));
  const typeMap = { PRACTICE: 'practice', QUALIFY: 'qualify', RACE: 'race' };
  const type = typeMap[String(json.Type || '').toUpperCase()] || 'practice';
  const results = (json.Result || []).map((r) => ({
    position: 0,
    driverName: r.DriverName || null,
    driverGuid: r.DriverGuid || null,
    team: carById.get(r.CarId)?.Driver?.Team || null,
    carModel: r.CarModel || carById.get(r.CarId)?.Model || null,
    raceNumber: carById.get(r.CarId)?.RaceNumber ?? null,
    bestLapMs: saneMs(r.BestLap),
    totalTimeMs: saneMs(r.TotalTime),
    lapCount: (json.Laps || []).filter((l) => l.CarId === r.CarId).length,
    gapMs: null,
  }));
  const laps = (json.Laps || []).map((l) => ({
    driverName: l.DriverName || null,
    carModel: l.CarModel || carById.get(l.CarId)?.Model || null,
    lapTimeMs: saneMs(l.LapTime),
    valid: !(l.Cuts > 0),
    cuts: l.Cuts ?? 0,
    sectorsMs: Array.isArray(l.Sectors) ? l.Sectors.map(saneMs) : undefined,
  }));
  return {
    id: file, game: 'ac', type,
    track: json.TrackName || null, trackConfig: json.TrackConfig || null,
    date: dateFromName(file, mtime),
    durationSecs: json.DurationSecs ?? null,
    raceLaps: json.RaceLaps ?? null,
    results: orderResults(results, type === 'race'),
    laps,
    events: (json.Events || []).map((e) => ({ type: e.Type, carId: e.CarId, otherCarId: e.OtherCarId, speed: e.ImpactSpeed })),
  };
}

const ACC_TYPE_MAP = { FP: 'practice', Q: 'qualify', R: 'race' };

function normalizeAcc(json, file, mtime) {
  const type = ACC_TYPE_MAP[json.sessionType] || 'practice';
  const accCarLabel = (id) => ACC_CARS.find((c) => c.id === id)?.label || (id != null ? `car ${id}` : null);
  const results = (json.sessionResult?.leaderBoardLines || []).map((line) => {
    const drv = line.car?.drivers?.[line.currentDriverIndex ?? 0];
    const driverName = drv ? [drv.firstName, drv.lastName].filter(Boolean).join(' ') : null;
    return {
      position: 0,
      driverName,
      team: line.car?.teamName || null,
      carModel: accCarLabel(line.car?.carModel),
      raceNumber: line.car?.raceNumber ?? null,
      bestLapMs: saneMs(line.timing?.bestLap),
      totalTimeMs: saneMs(line.timing?.totalTime),
      lapCount: line.timing?.lapCount ?? 0,
      gapMs: null,
    };
  });
  const carName = new Map();
  for (const line of json.sessionResult?.leaderBoardLines || []) {
    const drv = line.car?.drivers?.[line.currentDriverIndex ?? 0];
    carName.set(line.car?.carId, { name: drv ? [drv.firstName, drv.lastName].filter(Boolean).join(' ') : null, model: accCarLabel(line.car?.carModel) });
  }
  const laps = (json.laps || []).map((l) => ({
    driverName: carName.get(l.carId)?.name || null,
    carModel: carName.get(l.carId)?.model || null,
    lapTimeMs: saneMs(l.laptime),
    valid: l.isValidForBest !== false,
    sectorsMs: Array.isArray(l.splits) ? l.splits.map(saneMs) : undefined,
  }));
  return {
    id: file, game: 'acc', type,
    track: json.trackName || null, trackConfig: null,
    date: dateFromName(file, mtime),
    durationSecs: null,
    raceLaps: null,
    results: orderResults(results, type === 'race'),
    laps,
    isWetSession: json.sessionResult?.isWetSession ?? null,
    serverName: json.serverName || null,
  };
}

export function listResults(server, limit = 200) {
  const dir = resultsDir(server);
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const out = [];
  for (const f of files) {
    try {
      const fp = path.join(dir, f);
      const st = fs.statSync(fp);
      const norm = normalizeFile(server.type, f, readJson(fp), st.mtime);
      out.push({
        id: norm.id, type: norm.type, track: norm.track, date: norm.date,
        driverCount: norm.results.length,
        winner: norm.results[0]?.driverName || null,
      });
    } catch { /* skip unreadable file */ }
  }
  out.sort((a, b) => b.date.localeCompare(a.date));
  return out.slice(0, limit);
}

export function getResult(server, file) {
  if (!SAFE_FILE.test(file)) return null;
  const dir = resultsDir(server);
  const fp = path.join(dir, file);
  if (!path.resolve(fp).startsWith(path.resolve(dir))) return null;
  try {
    return normalizeFile(server.type, file, readJson(fp), fs.statSync(fp).mtime);
  } catch {
    return null;
  }
}

function normalizeFile(type, file, json, mtime) {
  return type === 'acc' ? normalizeAcc(json, file, mtime) : normalizeAc(json, file, mtime);
}

function stripPrivate(norm) {
  return { ...norm, results: norm.results.map(({ driverGuid, ...r }) => r) };
}

export function getPublicResult(server, file) {
  const n = getResult(server, file);
  return n ? stripPrivate(n) : null;
}

// Aggregate best lap per driver per (track+carModel) across recent results.
export function publicLeaderboard(server, scan = 200, limit = 100) {
  const dir = resultsDir(server);
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const best = new Map(); // track|car|driver -> entry
  const sorted = files
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, scan);
  for (const { f, mtime } of sorted) {
    try {
      const norm = normalizeFile(server.type, f, readJson(path.join(dir, f)), mtime);
      for (const r of norm.results) {
        if (!r.driverName || r.bestLapMs == null) continue;
        const key = `${norm.track}|${r.carModel}|${r.driverName}`;
        const cur = best.get(key);
        if (!cur || r.bestLapMs < cur.bestLapMs) {
          best.set(key, { track: norm.track, carModel: r.carModel, driverName: r.driverName, bestLapMs: r.bestLapMs, date: norm.date });
        }
      }
    } catch { /* skip */ }
  }
  return [...best.values()].sort((a, b) => a.bestLapMs - b.bestLapMs).slice(0, limit);
}
