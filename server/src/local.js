import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

// Local runtime: run game server exes directly on this machine instead of
// via Docker. Used on Windows (native exes) or any host where the binaries
// are present in the server's data dir.

const procs = new Map(); // serverId -> { proc, logs: string[], startedAt }

export function localExePath(server) {
  return server.type === 'acc'
    ? path.join(server.data_dir, 'acc', 'accServer.exe')
    : path.join(server.data_dir, 'serverfiles', 'acServer.exe');
}

export function localExePresent(server) {
  try {
    return fs.existsSync(localExePath(server));
  } catch {
    return false;
  }
}

export function localStatus(server) {
  const p = procs.get(server.id);
  const running = !!(p && p.proc && p.proc.exitCode === null && !p.proc.killed);
  return { running, pid: running ? p.proc.pid : null, startedAt: p?.startedAt };
}

export function localStart(server) {
  const exe = localExePath(server);
  if (!fs.existsSync(exe)) {
    throw new Error(`${path.basename(exe)} not found — place it at ${exe}`);
  }
  if (localStatus(server).running) return;

  const proc = spawn(exe, [], {
    cwd: path.dirname(exe),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = [];
  const push = (chunk) => {
    logs.push(chunk.toString());
    if (logs.length > 2000) logs.splice(0, logs.length - 2000);
  };
  proc.stdout.on('data', push);
  proc.stderr.on('data', push);
  proc.on('error', (e) => push(`\n[spawn error] ${e.message}\n`));
  proc.on('exit', (code, signal) => push(`\n[process exited: code=${code} signal=${signal}]\n`));

  procs.set(server.id, { proc, logs, startedAt: new Date().toISOString() });
}

export function localStop(server) {
  const p = procs.get(server.id);
  if (!p?.proc?.pid) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${p.proc.pid} /T /F`, { stdio: 'ignore' });
    } else {
      p.proc.kill('SIGTERM');
    }
  } catch { /* already dead */ }
  procs.delete(server.id);
}

export function localRestart(server) {
  localStop(server);
  localStart(server);
}

export function localLogs(server) {
  return (procs.get(server.id)?.logs || []).join('');
}
