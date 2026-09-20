import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { DATA_DIR } from './paths.js';

let db;

export async function getDb() {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = await open({
    filename: path.join(DATA_DIR, 'assettoman.db'),
    driver: sqlite3.Database,
  });
  await db.exec('PRAGMA journal_mode = WAL;');
  await db.exec('PRAGMA foreign_keys = ON;');
  await migrate(db);
  return db;
}

async function migrate(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'manager',
      display_name TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      last_login TEXT
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      container_name TEXT UNIQUE,
      container_id TEXT,
      image TEXT,
      ports TEXT NOT NULL DEFAULT '{}',
      config TEXT NOT NULL DEFAULT '{}',
      data_dir TEXT,
      is_public INTEGER NOT NULL DEFAULT 1,
      public_blurb TEXT,
      runtime TEXT NOT NULL DEFAULT 'docker',
      status TEXT NOT NULL DEFAULT 'created',
      last_error TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS content_items (
      id TEXT PRIMARY KEY,
      server_id TEXT,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      version TEXT,
      filename TEXT,
      file_path TEXT,
      size INTEGER,
      enabled INTEGER NOT NULL DEFAULT 1,
      is_public_download INTEGER NOT NULL DEFAULT 0,
      preview_image TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      username TEXT,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Additive column migrations for existing databases
  const cols = await db.all('PRAGMA table_info(servers)');
  if (!cols.some((c) => c.name === 'runtime')) {
    await db.exec("ALTER TABLE servers ADD COLUMN runtime TEXT NOT NULL DEFAULT 'docker'");
  }

  const ccols = await db.all('PRAGMA table_info(content_items)');
  const addContentCol = async (name, def) => {
    if (!ccols.some((c) => c.name === name)) {
      await db.exec(`ALTER TABLE content_items ADD COLUMN ${name} ${def}`);
    }
  };
  await addContentCol('source_type', "TEXT NOT NULL DEFAULT 'hosted'");
  await addContentCol('external_url', 'TEXT');
  await addContentCol('content_id', 'TEXT');
  await addContentCol('description', 'TEXT');
}

export async function getSetting(key, fallback = null) {
  const db = await getDb();
  const row = await db.get('SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  const db = await getDb();
  await db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, String(value)
  );
}

export async function audit(userId, username, action, details = null) {
  const db = await getDb();
  await db.run(
    'INSERT INTO audit_log (id, user_id, username, action, details, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    crypto.randomUUID(), userId, username, action, details, new Date().toISOString()
  );
}
