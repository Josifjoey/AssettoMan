import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Where the manager keeps its own data (db, uploads, server files, mods).
// In the container this is /app/server/data; locally ./server/data.
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

// Host-side path that corresponds to DATA_DIR. Needed because we create
// sibling containers via the Docker socket and bind mounts must reference
// host paths, not container paths.
export const HOST_DATA_DIR = process.env.HOST_DATA_DIR || DATA_DIR;

export const SERVERS_DIR = path.join(DATA_DIR, 'servers');
export const MODS_DIR = path.join(DATA_DIR, 'mods');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const STEAMCMD_DIR = path.join(DATA_DIR, 'steamcmd');

// Translate a path inside this container to the host equivalent, used when
// creating bind mounts for sibling game containers.
export function toHostPath(containerPath) {
  if (containerPath.startsWith(DATA_DIR)) {
    return path.join(HOST_DATA_DIR, containerPath.slice(DATA_DIR.length)).replace(/\\/g, '/');
  }
  return containerPath;
}
