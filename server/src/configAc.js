import fs from 'fs';
import path from 'path';

// Writes AC dedicated server configs into <dataDir>/serverfiles/cfg/.
// dataDir is the manager-side path; the game container mounts it at
// /serverdata/serverfiles so cfg/ lands where acServer.exe expects it.

function bool(v) {
  return v ? 1 : 0;
}

export function writeAcConfigs(dataDir, config, opts = {}) {
  const cfgDir = path.join(dataDir, 'serverfiles', 'cfg');
  fs.mkdirSync(cfgDir, { recursive: true });

  const s = config.server || {};
  const lines = [];
  lines.push('[SERVER]');
  lines.push(`NAME=${s.name || 'AssettoMan Server'}`);
  lines.push(`CARS=${(s.cars || '').toString()}`);
  lines.push(`TRACK=${s.track || ''}`);
  if (s.trackConfig) lines.push(`CONFIG_TRACK=${s.trackConfig}`);
  lines.push(`SUN_ANGLE=${s.sunAngle ?? 16}`);
  lines.push(`MAX_CLIENTS=${s.maxClients ?? 12}`);
  lines.push(`RACE_OVER_TIME=${s.raceOverTime ?? 120}`);
  lines.push(`ALLOWED_TYRES_OUT=${s.allowedTyresOut ?? -1}`);
  if (s.password) lines.push(`PASSWORD=${s.password}`);
  lines.push(`ADMIN_PASSWORD=${s.adminPassword || 'admin'}`);
  lines.push(`LOOP_MODE=${bool(s.loopMode)}`);
  lines.push(`REGISTER_TO_LOBBY=${bool(s.registerToLobby)}`);
  lines.push(`PICKUP_MODE_ENABLED=${bool(s.pickupModeEnabled)}`);
  lines.push(`SLEEP_TIME=${s.sleepTime ?? 1}`);
  lines.push(`CLIENT_SEND_INTERVAL_HZ=${s.clientSendIntervalHz ?? 18}`);
  lines.push(`SEND_BUFFER_SIZE=${s.sendBufferSize ?? 0}`);
  lines.push(`RECV_BUFFER_SIZE=${s.recvBufferSize ?? 0}`);
  lines.push(`KICK_AFK_TIME=${s.kickAfkTime ?? 0}`);
  lines.push(`QUALIFY_MAX_WAIT_PERC=${s.qualifyMaxWaitPerc ?? 400}`);
  lines.push(`TYRE_WEAR_FACTOR=${s.tyreWearFactor ?? 1}`);
  lines.push(`FUEL_CONSUMPTION=${s.fuelConsumptionRate ?? 1}`);
  lines.push(`DAMAGE_MULTIPLIER=${s.damageMultiplier ?? 100}`);
  lines.push(`VOTING_QUORUM=${s.votingQuorum ?? 75}`);
  lines.push(`VOTE_DURATION=${s.voteDuration ?? 20}`);
  lines.push(`BLACKLIST_MODE=${s.blacklistMode ?? 0}`);
  lines.push(`TC_ALLOWED=${s.tcAllowed ?? 1}`);
  lines.push(`ABS_ALLOWED=${s.absAllowed ?? 1}`);
  lines.push(`STABILITY_ALLOWED=${bool(s.stabilityAllowed)}`);
  lines.push(`AUTOCLUTCH_ALLOWED=${bool(s.autoClutchAllowed)}`);
  lines.push(`FORCE_VIRTUAL_MIRROR=${bool(s.forceVirtualMirror)}`);
  if (s.legalTyres) lines.push(`LEGAL_TYRES=${s.legalTyres}`);
  lines.push(`MAX_BALLAST_KG=${s.maxBallastKg ?? 50}`);
  if (config.telemetry?.enabled !== false) {
    // Managed telemetry plugin — overrides the manual UDP plugin fields.
    lines.push(`UDP_PLUGIN_LOCAL_PORT=${config.ports?.plugin ?? 9700}`);
    if (opts.pluginAddress) {
      lines.push(`UDP_PLUGIN_ADDRESS=${opts.pluginAddress}:${config.ports?.pluginListen ?? 9701}`);
    }
  } else {
    if (s.udpPluginLocalPort) lines.push(`UDP_PLUGIN_LOCAL_PORT=${s.udpPluginLocalPort}`);
    if (s.udpPluginAddress) lines.push(`UDP_PLUGIN_ADDRESS=${s.udpPluginAddress}`);
  }
  if (s.authPluginAddress) lines.push(`AUTH_PLUGIN_ADDRESS=${s.authPluginAddress}`);
  lines.push(`START_RULE=${s.startRule ?? 0}`);
  lines.push(`RACE_GAS_PENALTY_DISABLED=${bool(s.raceGasPenaltyDisabled)}`);
  lines.push(`TIME_OF_DAY_MULT=${s.timeOfDayMult ?? 1}`);
  lines.push(`RESULT_SCREEN_TIME=${s.resultScreenTime ?? 0}`);
  lines.push(`LOCK_ENTRY_LIST=${bool(s.lockEntryList)}`);
  lines.push(`RACE_PIT_WINDOW_START=${s.racePitWindowStart ?? 0}`);
  lines.push(`RACE_PIT_WINDOW_END=${s.racePitWindowEnd ?? 0}`);
  lines.push(`REVERSED_GRID_RACE_POSITIONS=${s.reversedGridRacePositions ?? 0}`);
  lines.push(`NUM_THREADS=${s.numThreads ?? 2}`);
  lines.push(`UDP_PORT=${config.ports?.game ?? 9600}`);
  lines.push(`TCP_PORT=${config.ports?.game ?? 9600}`);
  lines.push(`HTTP_PORT=${config.ports?.http ?? 8081}`);
  lines.push('');

  // Sessions
  for (const [key, label] of [['practice', 'PRACTICE'], ['qualify', 'QUALIFY'], ['race', 'RACE']]) {
    const sess = config[key];
    if (!sess) continue;
    if (key !== 'race' && sess.enabled === false) continue;
    lines.push(`[${label}]`);
    lines.push(`NAME=${sess.name || label}`);
    if (key === 'race') {
      if (sess.laps) lines.push(`LAPS=${sess.laps}`);
      else lines.push(`TIME_MINUTES=${sess.timeMinutes ?? 0}`);
      lines.push(`WAIT_TIME=${sess.waitTime ?? 60}`);
    } else {
      lines.push(`TIME_MINUTES=${sess.timeMinutes ?? 15}`);
      lines.push(`IS_OPEN=${sess.isOpen ?? 1}`);
    }
    lines.push('');
  }

  // Dynamic track
  const dt = config.dynamicTrack;
  if (dt) {
    lines.push('[DYNAMIC_TRACK]');
    lines.push(`SESSION_START=${dt.sessionStart ?? 95}`);
    lines.push(`RANDOMNESS=${dt.randomness ?? 2}`);
    lines.push(`SESSION_TRANSFER=${dt.sessionTransfer ?? 90}`);
    lines.push(`LAP_GAIN=${dt.lapGain ?? 10}`);
    lines.push('');
  }

  // Weather slots
  const weathers = Array.isArray(config.weathers) ? config.weathers : [];
  weathers.forEach((w, i) => {
    lines.push(`[WEATHER_${i}]`);
    lines.push(`GRAPHICS=${w.graphics || '3_clear'}`);
    lines.push(`BASE_TEMPERATURE_AMBIENT=${w.baseTempAmbient ?? 22}`);
    lines.push(`BASE_TEMPERATURE_ROAD=${w.baseTempRoad ?? 4}`);
    lines.push(`VARIATION_AMBIENT=${w.variationAmbient ?? 1}`);
    lines.push(`VARIATION_ROAD=${w.variationRoad ?? 1}`);
    lines.push(`WIND_BASE_SPEED_MIN=${w.windBaseSpeedMin ?? 0}`);
    lines.push(`WIND_BASE_SPEED_MAX=${w.windBaseSpeedMax ?? 0}`);
    lines.push(`WIND_BASE_DIRECTION=${w.windBaseDirection ?? 0}`);
    lines.push(`WIND_VARIATION_DIRECTION=${w.windVariationDirection ?? 0}`);
    lines.push('');
  });

  // Booking sessions
  const booked = Array.isArray(config.booked) ? config.booked : [];
  booked.forEach((b, i) => {
    lines.push(`[BOOK_${i}]`);
    if (b.driverName) lines.push(`NAME=${b.driverName}`);
    if (b.team) lines.push(`TEAM=${b.team}`);
    if (b.car) lines.push(`MODEL=${b.car}`);
    if (b.skin) lines.push(`SKIN=${b.skin}`);
    if (b.guid) lines.push(`GUID=${b.guid}`);
    if (b.ballast) lines.push(`BALLAST=${b.ballast}`);
    if (b.restrictor) lines.push(`RESTRICTOR=${b.restrictor}`);
    lines.push('');
  });

  fs.writeFileSync(path.join(cfgDir, 'server_cfg.ini'), lines.join('\n'), 'utf8');

  // entry_list.ini
  const entries = Array.isArray(config.entries) ? config.entries : [];
  const el = [];
  entries.forEach((e, i) => {
    el.push(`[CAR_${i}]`);
    el.push(`MODEL=${e.car || e.model || ''}`);
    if (e.skin) el.push(`SKIN=${e.skin}`);
    el.push(`SPECTATOR_MODE=${bool(e.spectatorMode)}`);
    if (e.driverName) el.push(`DRIVERNAME=${e.driverName}`);
    if (e.team) el.push(`TEAM=${e.team}`);
    if (e.guid) el.push(`GUID=${e.guid}`);
    if (e.ballast) el.push(`BALLAST=${e.ballast}`);
    if (e.restrictor) el.push(`RESTRICTOR=${e.restrictor}`);
    el.push('');
  });
  fs.writeFileSync(path.join(cfgDir, 'entry_list.ini'), el.join('\n'), 'utf8');

  return cfgDir;
}

// Scan installed content folders so the UI can offer real car/track choices.
export function listInstalledContent(dataDir) {
  const contentDir = path.join(dataDir, 'serverfiles', 'content');
  const read = (sub) => {
    try {
      return fs.readdirSync(path.join(contentDir, sub), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();
    } catch {
      return [];
    }
  };
  return { cars: read('cars'), tracks: read('tracks') };
}
