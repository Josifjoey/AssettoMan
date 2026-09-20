import fs from 'fs';
import path from 'path';
import { getDb, getSetting } from './db.js';

// Generates Content Manager's cm_content/content.json so players get a
// "download missing content" button in CM. Cars/track map to content_items
// (external links or hosted public downloads) via content_id.

function neededContent(config) {
  const cfg = config || {};
  const cars = new Set(String(cfg?.server?.cars || '').split(';').map((s) => s.trim()).filter(Boolean));
  for (const e of cfg?.entries || []) {
    const m = e.car || e.model;
    if (m) cars.add(m);
  }
  return { cars: [...cars], track: cfg?.server?.track || null };
}

function contentIdMatches(itemContentId, wanted) {
  if (!itemContentId || !wanted) return false;
  const a = itemContentId.toLowerCase();
  const b = wanted.toLowerCase();
  return a === b || b.startsWith(a + '/') || a === b.split('/')[0];
}

export async function writeCmContent(server, baseUrl) {
  if (server.type === 'acc') return;
  const cfg = typeof server.config === 'string' ? JSON.parse(server.config || '{}') : (server.config || {});
  const { cars, track } = neededContent(cfg);

  const db = await getDb();
  const items = await db.all(
    'SELECT * FROM content_items WHERE enabled = 1 AND content_id IS NOT NULL AND (server_id = ? OR server_id IS NULL)',
    server.id
  );

  const pick = (wanted) => {
    const matches = items.filter((it) => contentIdMatches(it.content_id, wanted));
    if (!matches.length) return null;
    const scoped = matches.filter((it) => it.server_id === server.id);
    const pool = scoped.length ? scoped : matches.filter((it) => it.server_id === null);
    if (!pool.length) return null;
    // Prefer a public hosted download; external link when hosted isn't usable.
    const hosted = pool.find((it) => it.source_type !== 'external' && it.is_public_download);
    if (hosted && baseUrl) {
      return { url: `${baseUrl}/api/public/download/${hosted.id}`, version: hosted.version || undefined };
    }
    const external = pool.find((it) => it.source_type === 'external' && it.external_url);
    if (external) return { url: external.external_url, version: external.version || undefined };
    return null;
  };

  const out = { cars: {} };
  for (const carId of cars) {
    const hit = pick(carId);
    if (hit) out.cars[carId] = hit;
  }
  if (track) {
    const hit = pick(track);
    if (hit) out.track = hit;
  }

  const dir = path.join(server.data_dir, 'serverfiles', 'cfg', 'cm_content');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'content.json'), JSON.stringify(out, null, 2), 'utf8');
  return out;
}

// After any content change, regenerate content.json for the affected server
// (or every AC server when the change is global / server was deleted).
export async function regenerateCmContent(db, serverIdOrNull, baseUrlOverride) {
  const baseUrl = baseUrlOverride !== undefined
    ? baseUrlOverride
    : String(await getSetting('public_base_url', '')).replace(/\/+$/, '');
  const rows = serverIdOrNull
    ? await db.all("SELECT * FROM servers WHERE id = ? AND type != 'acc'", serverIdOrNull)
    : await db.all("SELECT * FROM servers WHERE type != 'acc'");
  for (const row of rows) {
    try {
      await writeCmContent({ ...row, config: JSON.parse(row.config || '{}') }, baseUrl);
    } catch { /* best effort per server */ }
  }
}

// Report for the UI: which cars/track have a working link, which are missing.
export async function cmContentStatus(server) {
  const cfg = typeof server.config === 'string' ? JSON.parse(server.config || '{}') : (server.config || {});
  const { cars, track } = neededContent(cfg);
  const dir = path.join(server.data_dir, 'serverfiles', 'cfg', 'cm_content');
  let json = { cars: {} };
  try {
    json = JSON.parse(fs.readFileSync(path.join(dir, 'content.json'), 'utf8'));
  } catch { /* not written yet */ }
  const missingCars = cars.filter((c) => !json.cars?.[c]?.url);
  const missingTrack = track && !json.track?.url ? track : null;
  return { ...json, missing: [...missingCars, ...(missingTrack ? [missingTrack] : [])] };
}
