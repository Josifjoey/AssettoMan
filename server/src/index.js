import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { getDb } from './db.js';
import { resumeTelemetry } from './telemetry.js';
import { SERVERS_DIR, MODS_DIR, UPLOADS_DIR } from './paths.js';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/accounts.js';
import serverRoutes from './routes/servers.js';
import contentRoutes from './routes/content.js';
import publicRoutes from './routes/public.js';
import systemRoutes from './routes/system.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3010;

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

const allowedOrigin = process.env.FRONTEND_URL;
app.use(cors({
  origin: allowedOrigin || true,
  credentials: true,
}));

app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/system', systemRoutes);

app.get('/ready', async (req, res) => {
  try {
    await getDb();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Static frontend (production build copied to server/public or ../public)
const candidates = [
  path.join(__dirname, '..', 'public'),
  path.join(__dirname, '..', '..', 'public'),
  path.join(__dirname, '..', '..', 'dist'),
];
const publicDir = candidates.find((p) => fs.existsSync(path.join(p, 'index.html')));
if (publicDir) {
  app.use(express.static(publicDir));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

for (const d of [SERVERS_DIR, MODS_DIR, UPLOADS_DIR]) fs.mkdirSync(d, { recursive: true });
await getDb();
resumeTelemetry();

app.listen(PORT, () => {
  console.log(`[assettoman] listening on :${PORT}`);
  if (publicDir) console.log(`[assettoman] serving frontend from ${publicDir}`);
});
