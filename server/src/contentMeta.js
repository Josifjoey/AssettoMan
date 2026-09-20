import fs from 'fs';
import path from 'path';
import { getSnapshot } from './telemetry.js';

// Shared helpers for reading AC content metadata (ui_car/ui_track json,
// images, track map projection). Used by both public and admin routes.

const SAFE_ID = /^[A-Za-z0-9_\-. ]+$/;

export function safeId(v) {
  return typeof v === 'string' && v.length > 0 && v.length < 128 && SAFE_ID.test(v);
}

// Some AC ui_*.json files carry a BOM or trailing commas — parse defensively.
export function parseJsonLoose(file) {
  try {
    let text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
    text = text.replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function contentDir(server) {
  return path.join(server.data_dir, 'serverfiles', 'content');
}

export function trackUiJson(server, trackId, layout) {
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

export function sendImage(res, file) {
  if (!file || !fs.existsSync(file)) return res.status(404).json({ error: 'Image not found' });
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(file);
}

// Car preview: first skin preview.jpg, else ui badge.png.
export function carImagePath(server, carId) {
  const dir = path.join(contentDir(server), 'cars', carId, 'ui');
  if (!dir.startsWith(contentDir(server))) return null;
  try {
    const skinsDir = path.join(dir, 'skins');
    const firstSkin = fs.readdirSync(skinsDir, { withFileTypes: true }).find((d) => d.isDirectory())?.name;
    if (firstSkin && safeId(firstSkin)) {
      const p = path.join(skinsDir, firstSkin, 'preview.jpg');
      if (fs.existsSync(p)) return p;
    }
  } catch { /* no skins dir */ }
  const badge = path.join(dir, 'badge.png');
  return fs.existsSync(badge) ? badge : null;
}

// Track ui image (preview/outline) or map.png from the track/layout root.
export function trackImagePath(server, trackId, layout, { map = false, outline = false } = {}) {
  const base = path.join(contentDir(server), 'tracks', trackId, 'ui');
  const dir = layout ? path.join(base, layout) : base;
  if (!dir.startsWith(contentDir(server))) return null;
  if (map) {
    const mapDir = layout ? path.join(contentDir(server), 'tracks', trackId, layout) : path.join(contentDir(server), 'tracks', trackId);
    return path.join(mapDir, 'map.png');
  }
  const name = outline ? 'outline.png' : 'preview.png';
  const file = path.join(dir, name);
  if (!fs.existsSync(file) && layout) return path.join(base, name);
  return file;
}

// Track + layout currently in use (telemetry session wins over config).
export function activeTrack(server, cfg) {
  const snap = getSnapshot(server.id);
  return {
    track: snap?.session?.track || cfg?.server?.track || null,
    layout: snap?.session?.trackConfig || cfg?.server?.trackConfig || '',
  };
}

// map.png projection params from map.ini. imageUrlFor(track, layout) builds
// the URL the canvas should load (public vs admin route).
export function trackMapFor(server, imageUrlFor) {
  const cfg = typeof server.config === 'string' ? JSON.parse(server.config || '{}') : (server.config || {});
  const { track, layout } = activeTrack(server, cfg);
  if (!track || !safeId(track) || (layout && !safeId(layout))) return null;

  const trackDir = path.join(contentDir(server), 'tracks', track);
  const iniCandidates = [
    layout ? path.join(trackDir, layout, 'data', 'map.ini') : null,
    path.join(trackDir, 'data', 'map.ini'),
  ].filter(Boolean);
  let ini = null;
  for (const f of iniCandidates) {
    try { ini = fs.readFileSync(f, 'utf8'); break; } catch { /* try next */ }
  }
  if (!ini) return null;

  const num = (key) => {
    const m = ini.match(new RegExp(`^${key}\\s*=\\s*([-\\d.]+)`, 'mi'));
    return m ? +m[1] : null;
  };
  return {
    image: imageUrlFor(track, layout),
    track, layout,
    params: {
      width: num('WIDTH'), height: num('HEIGHT'),
      xOffset: num('X_OFFSET'), zOffset: num('Z_OFFSET'),
      scaleFactor: num('SCALE_FACTOR'), margin: num('MARGIN'),
    },
  };
}

// id → display name/brand from ui_car.json for the configured cars.
export function carsMetaFor(server, imageUrlFor) {
  const cfg = typeof server.config === 'string' ? JSON.parse(server.config || '{}') : (server.config || {});
  const carIds = String(cfg?.server?.cars || '').split(';').filter(Boolean);
  return carIds.map((id) => {
    const ui = parseJsonLoose(path.join(contentDir(server), 'cars', id, 'ui', 'ui_car.json'));
    return { id, name: ui?.name || id, brand: ui?.brand || null, previewUrl: imageUrlFor ? imageUrlFor(id) : undefined };
  });
}
