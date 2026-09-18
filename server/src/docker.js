import Docker from 'dockerode';
import { toHostPath, SERVERS_DIR } from './paths.js';
import { IMAGES } from './constants.js';
import path from 'path';
import fs from 'fs';

const socketPath = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
const docker = new Docker({ socketPath });

export function dockerAvailable() {
  return docker.ping().then(() => true).catch(() => false);
}

export async function pullImage(image, onProgress) {
  return new Promise((resolve, reject) => {
    docker.pull(image, (err, stream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (err2, output) => {
        if (err2) reject(err2); else resolve(output);
      }, (event) => {
        if (onProgress) onProgress(event);
      });
    });
  });
}

export async function imageExists(image) {
  try {
    await docker.getImage(image).inspect();
    return true;
  } catch {
    return false;
  }
}

export async function ensureImage(image) {
  if (!(await imageExists(image))) {
    await pullImage(image);
  }
}

function gamePortBindings(type, ports) {
  const bindings = {};
  if (type === 'acc') {
    bindings[`${ports.game}/tcp`] = [{ HostPort: String(ports.game) }];
    bindings[`${ports.game}/udp`] = [{ HostPort: String(ports.game) }];
  } else {
    bindings[`${ports.game}/tcp`] = [{ HostPort: String(ports.game) }];
    bindings[`${ports.game}/udp`] = [{ HostPort: String(ports.game) }];
    bindings[`${ports.http}/tcp`] = [{ HostPort: String(ports.http) }];
  }
  return bindings;
}

function exposedPorts(type, ports) {
  const exposed = {};
  for (const key of Object.keys(gamePortBindings(type, ports))) exposed[key] = {};
  return exposed;
}

// Build the Docker create-options for a managed server record.
export function buildContainerSpec(server) {
  const { type, container_name, ports, config } = server;
  const dataDir = server.data_dir; // container-side path under SERVERS_DIR
  const hostServerDir = toHostPath(dataDir);
  const hostSteamcmd = toHostPath(path.join(SERVERS_DIR, '..', 'steamcmd'));

  if (type === 'acc') {
    fs.mkdirSync(path.join(dataDir, 'acc'), { recursive: true });
    return {
      Image: IMAGES.acc,
      name: container_name,
      Env: ['UID=99', 'GID=100', 'UMASK=000', 'DATA_PERM=770'],
      ExposedPorts: exposedPorts(type, ports),
      HostConfig: {
        Binds: [`${hostServerDir}/acc:/acc`],
        PortBindings: gamePortBindings(type, ports),
        RestartPolicy: { Name: 'unless-stopped' },
      },
    };
  }

  // ac / ac_modded — ich777 steamcmd image, runs acServer.exe via wine.
  fs.mkdirSync(path.join(dataDir, 'serverfiles'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'steamcmd'), { recursive: true });
  const env = [
    'GAME_ID=302550',
    'UID=99',
    'GID=100',
    'UMASK=000',
    'DATA_PERM=770',
  ];
  if (config?.steam?.username) env.push(`USERNAME=${config.steam.username}`);
  if (config?.steam?.password) env.push(`PASSWRD=${config.steam.password}`);
  if (config?.steam?.validate) env.push('VALIDATE=true');

  return {
    Image: IMAGES[type],
    name: container_name,
    Env: env,
    ExposedPorts: exposedPorts(type, ports),
    HostConfig: {
      Binds: [
        `${hostServerDir}/serverfiles:/serverdata/serverfiles`,
        `${hostSteamcmd}:/serverdata/steamcmd`,
      ],
      PortBindings: gamePortBindings(type, ports),
      RestartPolicy: { Name: 'unless-stopped' },
    },
  };
}

export async function createContainer(server) {
  const spec = buildContainerSpec(server);
  await ensureImage(spec.Image);
  const container = await docker.createContainer(spec);
  return container.id;
}

export async function inspectContainer(containerIdOrName) {
  try {
    return await docker.getContainer(containerIdOrName).inspect();
  } catch {
    return null;
  }
}

export async function startContainer(containerIdOrName) {
  const c = docker.getContainer(containerIdOrName);
  await c.start();
}

export async function stopContainer(containerIdOrName, timeout = 15) {
  const c = docker.getContainer(containerIdOrName);
  await c.stop({ t: timeout });
}

export async function restartContainer(containerIdOrName) {
  const c = docker.getContainer(containerIdOrName);
  await c.restart({ t: 15 });
}

export async function removeContainer(containerIdOrName) {
  const c = docker.getContainer(containerIdOrName);
  try { await c.stop({ t: 5 }); } catch { /* already stopped */ }
  await c.remove({ force: true });
}

export async function containerLogs(containerIdOrName, tail = 200) {
  const c = docker.getContainer(containerIdOrName);
  const buf = await c.logs({ stdout: true, stderr: true, tail, timestamps: false });
  // dockerode returns a Buffer with multiplexed stream headers; strip them.
  return buf.toString('utf8').replace(/[\x00-\x08\x0e-\x1f]/g, '');
}

export function getDocker() {
  return docker;
}
