import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import yauzl from 'yauzl';
import { getDb, audit } from '../db.js';
import { requireAuth } from '../auth.js';
import { MODS_DIR, SERVERS_DIR } from '../paths.js';

const router = Router();
router.use(requireAuth);

fs.mkdirSync(MODS_DIR, { recursive: true });

const upload = multer({
  dest: MODS_DIR,
  limits: { fileSize: 4 * 1024 * 1024 * 1024 }, // 4GB
});

// Extract a mod zip into a server's content tree.
// Handles the common layouts: content/cars/..., cars/..., or a bare folder.
function extractModZip(zipPath, serverDataDir, kind) {
  const contentDir = path.join(serverDataDir, 'serverfiles', 'content');
  fs.mkdirSync(contentDir, { recursive: true });
  const zipBase = path.basename(zipPath).replace(/\.zip$/i, '');

  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      const planned = [];

      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        const name = entry.fileName.replace(/\\/g, '/');
        if (/\/$/.test(name)) { zipfile.readEntry(); return; }

        // Decide destination relative to contentDir
        let rel;
        if (/^content\/(cars|tracks)\//i.test(name)) {
          rel = name.replace(/^content\//i, '');
        } else if (/^(cars|tracks)\//i.test(name)) {
          rel = name;
        } else {
          rel = `${kind === 'track' ? 'tracks' : 'cars'}/${zipBase}/${name.replace(/^[^/]*\//, '')}`;
        }
        planned.push({ entry, rel });
        zipfile.readEntry();
      });

      zipfile.on('end', async () => {
        try {
          for (const { entry, rel } of planned) {
            const dest = path.join(contentDir, rel);
            if (!dest.startsWith(contentDir)) continue; // zip-slip guard
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            await new Promise((res2, rej2) => {
              zipfile.openReadStream(entry, (e2, stream) => {
                if (e2) return rej2(e2);
                const out = fs.createWriteStream(dest);
                stream.pipe(out);
                out.on('finish', res2);
                out.on('error', rej2);
              });
            });
          }
          resolve(planned.length);
        } catch (e) {
          reject(e);
        }
      });
      zipfile.on('error', reject);
    });
  });
}

// GET /api/content?serverId= — list mods (global + per-server)
router.get('/', async (req, res) => {
  const db = await getDb();
  const { serverId } = req.query;
  const rows = serverId
    ? await db.all('SELECT * FROM content_items WHERE server_id = ? OR server_id IS NULL ORDER BY created_at DESC', serverId)
    : await db.all('SELECT * FROM content_items ORDER BY created_at DESC');
  res.json({ items: rows });
});

// POST /api/content — upload a zip (multipart: file, kind, name, version, serverId?, publicDownload?)
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'zip file required' });
  const { kind = 'car', name, version, serverId } = req.body || {};
  if (!['car', 'track', 'mod'].includes(kind)) {
    fs.rmSync(req.file.path, { force: true });
    return res.status(400).json({ error: 'kind must be car|track|mod' });
  }

  const db = await getDb();
  const id = crypto.randomUUID();

  // If a target server is given, install immediately into its content tree.
  let installedError = null;
  if (serverId) {
    const server = await db.get('SELECT * FROM servers WHERE id = ?', serverId);
    if (!server) {
      fs.rmSync(req.file.path, { force: true });
      return res.status(404).json({ error: 'Server not found' });
    }
    if (server.type === 'acc') {
      fs.rmSync(req.file.path, { force: true });
      return res.status(400).json({ error: 'ACC does not support mod content — official content only' });
    }
    try {
      await extractModZip(req.file.path, server.data_dir, kind);
    } catch (e) {
      installedError = String(e.message || e);
    }
  }

  await db.run(
    `INSERT INTO content_items (id, server_id, kind, name, version, filename, file_path, size, enabled, is_public_download, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    id, serverId || null, kind, name || req.file.originalname.replace(/\.zip$/i, ''),
    version || null, req.file.originalname, req.file.path, req.file.size,
    req.body.publicDownload === 'true' ? 1 : 0, new Date().toISOString()
  );
  await audit(req.user.id, req.user.username, 'mod_uploaded', name || req.file.originalname);
  const item = await db.get('SELECT * FROM content_items WHERE id = ?', id);
  res.status(201).json({ item, installedError });
});

// POST /api/content/:id/install — install an uploaded mod into a server
router.post('/:id/install', async (req, res) => {
  const { serverId } = req.body || {};
  const db = await getDb();
  const item = await db.get('SELECT * FROM content_items WHERE id = ?', req.params.id);
  if (!item) return res.status(404).json({ error: 'Mod not found' });
  const server = await db.get('SELECT * FROM servers WHERE id = ?', serverId);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  if (server.type === 'acc') return res.status(400).json({ error: 'ACC does not support mods' });

  try {
    const n = await extractModZip(item.file_path, server.data_dir, item.kind);
    await audit(req.user.id, req.user.username, 'mod_installed', `${item.name} -> ${server.name}`);
    res.json({ ok: true, files: n });
  } catch (e) {
    res.status(500).json({ error: `Extraction failed: ${e.message || e}` });
  }
});

// PATCH /api/content/:id — rename, toggle public download
router.patch('/:id', async (req, res) => {
  const db = await getDb();
  const item = await db.get('SELECT * FROM content_items WHERE id = ?', req.params.id);
  if (!item) return res.status(404).json({ error: 'Mod not found' });
  const { name, version, publicDownload, enabled } = req.body || {};
  await db.run(
    'UPDATE content_items SET name = COALESCE(?, name), version = COALESCE(?, version), is_public_download = COALESCE(?, is_public_download), enabled = COALESCE(?, enabled) WHERE id = ?',
    name ?? null, version ?? null,
    publicDownload === undefined ? null : (publicDownload ? 1 : 0),
    enabled === undefined ? null : (enabled ? 1 : 0),
    item.id
  );
  res.json({ ok: true });
});

// DELETE /api/content/:id
router.delete('/:id', async (req, res) => {
  const db = await getDb();
  const item = await db.get('SELECT * FROM content_items WHERE id = ?', req.params.id);
  if (!item) return res.status(404).json({ error: 'Mod not found' });
  await db.run('DELETE FROM content_items WHERE id = ?', item.id);
  if (item.file_path?.startsWith(MODS_DIR)) fs.rmSync(item.file_path, { force: true });
  await audit(req.user.id, req.user.username, 'mod_deleted', item.name);
  res.json({ ok: true });
});

export default router;
