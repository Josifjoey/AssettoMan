import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

// Local runtime: run game server exes directly on this machine instead of
// via Docker. Used on Windows (native exes) or any host where the binaries
// are present in the server's data dir.
//
// Processes are spawned detached with output appended to <data_dir>/run/
// console.log and a run.pid file, so the game server keeps running (and we
// can still read logs, stop it, and report status) even if the manager
// itself restarts.

const procs = new Map(); // serverId -> { proc, startedAt } — this boot's spawns

export function localExePath(server) {
  if (server.type === 'acc') return path.join(server.data_dir, 'acc', 'accServer.exe');
  if (server.type === 'assettoserver') {
    return path.join(server.data_dir, 'serverfiles',
      process.platform === 'win32' ? 'AssettoServer.exe' : 'AssettoServer');
  }
  return path.join(server.data_dir, 'serverfiles', 'acServer.exe');
}

export function localExePresent(server) {
  try {
    return fs.existsSync(localExePath(server));
  } catch {
    return false;
  }
}

function runDir(server) { return path.join(server.data_dir, 'run'); }
function pidFile(server) { return path.join(runDir(server), 'run.pid'); }
function logFile(server) { return path.join(runDir(server), 'console.log'); }

function readPidFile(server) {
  try {
    const meta = JSON.parse(fs.readFileSync(pidFile(server), 'utf8'));
    return meta?.pid ? meta : null;
  } catch {
    return null;
  }
}

// Is `pid` alive — and is it the exe we think it is? (guards PID reuse)
function pidAliveAs(pid, exeName) {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  if (!exeName) return true;
  try {
    if (process.platform === 'win32') {
      const out = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      const image = out.trim().split('","')[0].replace(/^"/, '').toLowerCase();
      return image === exeName.toLowerCase();
    }
    const out = execSync(`ps -p ${pid} -o comm=`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().toLowerCase();
    return path.basename(out) === exeName.toLowerCase();
  } catch {
    return false;
  }
}

// Adopt a process started before the manager restarted, via the pid file.
function adoptedStatus(server) {
  const meta = readPidFile(server);
  if (!meta) return { running: false, pid: null, startedAt: null };
  if (pidAliveAs(meta.pid, meta.exe)) {
    return { running: true, pid: meta.pid, startedAt: meta.startedAt || null };
  }
  try { fs.unlinkSync(pidFile(server)); } catch { /* stale pid file */ }
  return { running: false, pid: null, startedAt: null };
}

export function localStatus(server) {
  const p = procs.get(server.id);
  if (p?.proc) {
    const running = p.proc.exitCode === null && !p.proc.killed;
    if (running) return { running: true, pid: p.proc.pid, startedAt: p.startedAt };
    procs.delete(server.id); // dead handle — fall through to pid file check
  }
  return adoptedStatus(server);
}

export function localStart(server) {
  const exe = localExePath(server);
  if (!fs.existsSync(exe)) {
    throw new Error(`${path.basename(exe)} not found — place it at ${exe}`);
  }
  if (localStatus(server).running) return;

  fs.mkdirSync(runDir(server), { recursive: true });
  const fd = fs.openSync(logFile(server), 'a');
  const proc = spawn(exe, [], {
    cwd: path.dirname(exe),
    windowsHide: true,
    detached: true,
    stdio: ['ignore', fd, fd],
  });
  proc.unref(); // don't keep the manager alive for the game server
  proc.on('error', () => { /* spawn failure surfaces via pid check */ });
  fs.closeSync(fd);

  const startedAt = new Date().toISOString();
  fs.writeFileSync(pidFile(server), JSON.stringify({ pid: proc.pid, exe: path.basename(exe), startedAt }));
  procs.set(server.id, { proc, startedAt });
}

export function localStop(server) {
  const pid = procs.get(server.id)?.proc?.pid || readPidFile(server)?.pid;
  if (pid) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
      } else {
        process.kill(pid, 'SIGTERM');
      }
    } catch { /* already dead */ }
  }
  procs.delete(server.id);
  try { fs.unlinkSync(pidFile(server)); } catch { /* none */ }
}

export function localRestart(server) {
  localStop(server);
  localStart(server);
}

export function localLogs(server) {
  // Tail of the on-disk console log (survives manager restarts).
  try {
    const st = fs.statSync(logFile(server));
    const MAX = 512 * 1024;
    const fd = fs.openSync(logFile(server), 'r');
    const start = Math.max(0, st.size - MAX);
    const buf = Buffer.alloc(Math.min(st.size, MAX));
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    return buf.toString();
  } catch {
    return '';
  }
}
