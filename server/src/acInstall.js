import fs from 'fs';
import path from 'path';
import { getSetting } from './db.js';
import { contentDir } from './contentMeta.js';

// Imports content *metadata* (ui/ folders, map.png, map.ini) from a local
// Assetto Corsa install into a server's content tree — gives us real names,
// previews and live track maps without copying gigabytes of game data.

const CANDIDATES = [
  'C:/Program Files (x86)/Steam/steamapps/common/assettocorsa',
  'C:/Program Files/Steam/steamapps/common/assettocorsa',
  'D:/Steam/steamapps/common/assettocorsa',
  'D:/SteamLibrary/steamapps/common/assettocorsa',
  'E:/Steam/steamapps/common/assettocorsa',
  'E:/SteamLibrary/steamapps/common/assettocorsa',
  'F:/Steam/steamapps/common/assettocorsa',
  'F:/SteamLibrary/steamapps/common/assettocorsa',
];

// Only copy small metadata files — never models/textures/packed data.
const COPY_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.json', '.ini', '.txt']);
const MAX_FILE = 8 * 1024 * 1024;

export function isAcRoot(p) {
  try { return !!p && fs.statSync(path.join(p, 'content', 'cars')).isDirectory(); } catch { return false; }
}

// Steam can keep games in extra libraries — read libraryfolders.vdf.
function steamLibraries(steamDir) {
  const libs = [];
  try {
    const vdf = fs.readFileSync(path.join(steamDir, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) {
      libs.push(m[1].replace(/\\\\/g, '/'));
    }
  } catch { /* no extra libraries */ }
  return libs;
}

export async function detectAcInstall() {
  const configured = await getSetting('ac_install_path', '');
  const candidates = [configured, ...CANDIDATES].filter(Boolean);
  // Expand each Steam dir into its extra libraries
  const seen = new Set();
  const expanded = [];
  for (const c of candidates) {
    const norm = c.replace(/\\/g, '/');
    if (seen.has(norm)) continue;
    seen.add(norm);
    expanded.push(norm);
    // if this looks like a Steam root or a library root, add sibling libraries
    const steamDir = norm.replace(/\/steamapps\/common\/assettocorsa$/i, '').replace(/\/common\/assettocorsa$/i, '');
    for (const lib of steamLibraries(steamDir)) {
      const p = `${lib}/steamapps/common/assettocorsa`;
      if (!seen.has(p)) { seen.add(p); expanded.push(p); }
    }
  }
  for (const p of expanded) {
    if (isAcRoot(p)) {
      const count = (sub) => {
        try { return fs.readdirSync(path.join(p, 'content', sub), { withFileTypes: true }).filter((d) => d.isDirectory()).length; } catch { return 0; }
      };
      return { found: true, path: p, cars: count('cars'), tracks: count('tracks') };
    }
  }
  return { found: false, checked: expanded };
}

function copyTreeSmall(src, dst) {
  let n = 0;
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) {
      n += copyTreeSmall(s, d);
    } else if (COPY_EXT.has(path.extname(e.name).toLowerCase())) {
      try {
        if (fs.statSync(s).size > MAX_FILE) continue;
        fs.mkdirSync(dst, { recursive: true });
        fs.copyFileSync(s, d);
        n++;
      } catch { /* skip */ }
    }
  }
  return n;
}

function copyIfExists(src, dst) {
  try {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    return 1;
  } catch { return 0; }
}

// Copy ui/ + map.png + data/map.ini for one track (and each layout subdir).
function importTrack(acRoot, server, trackId) {
  const srcRoot = path.join(acRoot, 'content', 'tracks', trackId);
  const dstRoot = path.join(contentDir(server), 'tracks', trackId);
  let n = 0;
  n += copyTreeSmall(path.join(srcRoot, 'ui'), path.join(dstRoot, 'ui'));
  n += copyIfExists(path.join(srcRoot, 'map.png'), path.join(dstRoot, 'map.png'));
  n += copyIfExists(path.join(srcRoot, 'data', 'map.ini'), path.join(dstRoot, 'data', 'map.ini'));
  // Layouts: subdirs containing their own ui/ or data/
  try {
    for (const sub of fs.readdirSync(srcRoot, { withFileTypes: true })) {
      if (!sub.isDirectory() || sub.name === 'ui' || sub.name === 'data') continue;
      const s = path.join(srcRoot, sub.name);
      const d = path.join(dstRoot, sub.name);
      n += copyTreeSmall(path.join(s, 'ui'), path.join(d, 'ui'));
      n += copyIfExists(path.join(s, 'map.png'), path.join(d, 'map.png'));
      n += copyIfExists(path.join(s, 'data', 'map.ini'), path.join(d, 'data', 'map.ini'));
    }
  } catch { /* no subdirs */ }
  return n;
}

function importCar(acRoot, server, carId) {
  const src = path.join(acRoot, 'content', 'cars', carId, 'ui');
  const dst = path.join(contentDir(server), 'cars', carId, 'ui');
  return copyTreeSmall(src, dst);
}

// Import metadata for the content ids a server is configured with.
// ids = { cars: [...], tracks: [...] } — null/absent means "everything in config".
export async function importMetadata(server, acRoot, ids) {
  const cfg = typeof server.config === 'string' ? JSON.parse(server.config || '{}') : (server.config || {});
  const carIds = ids?.cars || String(cfg?.server?.cars || '').split(';').filter(Boolean);
  const trackIds = ids?.tracks || [cfg?.server?.track].filter(Boolean);
  const out = { files: 0, cars: [], tracks: [], missing: [] };
  for (const id of carIds) {
    if (!isAcContentDir(acRoot, 'cars', id)) { out.missing.push(`car:${id}`); continue; }
    const n = importCar(acRoot, server, id);
    if (n > 0) { out.cars.push(id); out.files += n; } else out.missing.push(`car:${id}`);
  }
  for (const id of trackIds) {
    if (!isAcContentDir(acRoot, 'tracks', id)) { out.missing.push(`track:${id}`); continue; }
    const n = importTrack(acRoot, server, id);
    if (n > 0) { out.tracks.push(id); out.files += n; } else out.missing.push(`track:${id}`);
  }
  return out;
}

function isAcContentDir(acRoot, kind, id) {
  try { return fs.statSync(path.join(acRoot, 'content', kind, id)).isDirectory(); } catch { return false; }
}

// List all cars/tracks in the AC install (for a picker UI).
export function listAcContent(acRoot) {
  const ls = (sub) => {
    try { return fs.readdirSync(path.join(acRoot, 'content', sub), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch { return []; }
  };
  return { cars: ls('cars'), tracks: ls('tracks') };
}
