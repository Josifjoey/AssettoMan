import fs from 'fs';
import path from 'path';

// Writes ACC cfg/*.json files into <dataDir>/acc/cfg/.
// The game container mounts <dataDir>/acc at /acc so cfg/ lands correctly.

const FILES = {
  configuration: 'configuration.json',
  settings: 'settings.json',
  event: 'event.json',
  eventRules: 'eventRules.json',
  assistRules: 'assistRules.json',
  entrylist: 'entrylist.json',
  bop: 'bop.json',
};

export function writeAccConfigs(dataDir, config) {
  const cfgDir = path.join(dataDir, 'acc', 'cfg');
  fs.mkdirSync(cfgDir, { recursive: true });

  for (const [key, filename] of Object.entries(FILES)) {
    const data = config[key];
    if (!data) continue;
    // configuration.json ports must match the container's published port.
    if (key === 'configuration' && config.ports?.game) {
      data.udpPort = config.ports.game;
      data.tcpPort = config.ports.game;
    }
    fs.writeFileSync(path.join(cfgDir, filename), JSON.stringify(data, null, 4), 'utf8');
  }
  return cfgDir;
}

export function readAccConfigs(dataDir) {
  const cfgDir = path.join(dataDir, 'acc', 'cfg');
  const out = {};
  for (const [key, filename] of Object.entries(FILES)) {
    try {
      out[key] = JSON.parse(fs.readFileSync(path.join(cfgDir, filename), 'utf8'));
    } catch {
      out[key] = null;
    }
  }
  return out;
}

export function accServerExePresent(dataDir) {
  return fs.existsSync(path.join(dataDir, 'acc', 'accServer.exe'));
}
