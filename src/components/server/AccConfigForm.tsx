import React, { useEffect, useState } from 'react';
import { api, GameServer } from '../../api';
import { Card, Input, Select, Field, Check, Button } from '../ui';
import { Plus, Trash2 } from 'lucide-react';

// Full ACC cfg/*.json editor: settings, event, eventRules, assistRules,
// configuration. Entries & BoP live in EntriesEditor.

function setPath(obj: any, path: string[], value: any) {
  const clone = structuredClone(obj);
  let cur = clone;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
  cur[path[path.length - 1]] = value;
  return clone;
}

export default function AccConfigForm({ server, disabled, onSave }: { server: GameServer; disabled: boolean; onSave: (config: any, ports?: any) => void }) {
  const [cfg, setCfg] = useState<any>(server.config);
  const [meta, setMeta] = useState<any>(null);
  const [ports, setPorts] = useState(server.ports.game);
  const dirty = JSON.stringify(cfg) !== JSON.stringify(server.config) || ports !== server.ports.game;

  useEffect(() => {
    api.get('/servers/meta').then((r) => setMeta(r.data)).catch(() => {});
  }, []);

  const set = (path: string, value: any) => setCfg((c: any) => setPath(c, path.split('.'), value));
  const S = cfg.settings || {};
  const E = cfg.event || {};
  const R = cfg.eventRules || {};
  const A = cfg.assistRules || {};
  const C = cfg.configuration || {};

  const sessions: any[] = E.sessions || [];
  const setSession = (i: number, k: string, v: any) => {
    const next = sessions.map((s, j) => (j === i ? { ...s, [k]: v } : s));
    set('event.sessions', next);
  };

  return (
    <div className="space-y-4">
      <Card title="Server identity" subtitle="settings.json">
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Server name"><Input disabled={disabled} value={S.serverName || ''} onChange={(e) => set('settings.serverName', e.target.value)} /></Field>
          <Field label="Car group">
            <Select disabled={disabled} value={S.carGroup || 'FreeForAll'} onChange={(e) => set('settings.carGroup', e.target.value)}>
              {(meta?.accCarGroups || ['FreeForAll', 'GT3', 'GT4', 'GTC', 'TCX', 'GT2']).map((g: string) => <option key={g}>{g}</option>)}
            </Select>
          </Field>
          <Field label="Join password" hint="Empty = open server"><Input disabled={disabled} type="password" value={S.password || ''} onChange={(e) => set('settings.password', e.target.value)} autoComplete="new-password" /></Field>
          <Field label="Admin password"><Input disabled={disabled} type="password" value={S.adminPassword || ''} onChange={(e) => set('settings.adminPassword', e.target.value)} autoComplete="new-password" /></Field>
          <Field label="Spectator password"><Input disabled={disabled} type="password" value={S.spectatorPassword || ''} onChange={(e) => set('settings.spectatorPassword', e.target.value)} autoComplete="new-password" /></Field>
          <Field label="Max car slots"><Input disabled={disabled} type="number" value={S.maxCarSlots ?? 24} onChange={(e) => set('settings.maxCarSlots', +e.target.value)} /></Field>
          <Field label="Safety rating requirement" hint="-1 = none"><Input disabled={disabled} type="number" value={S.safetyRatingRequirement ?? -1} onChange={(e) => set('settings.safetyRatingRequirement', +e.target.value)} /></Field>
          <Field label="Track medals requirement" hint="-1 = none"><Input disabled={disabled} type="number" value={S.trackMedalsRequirement ?? -1} onChange={(e) => set('settings.trackMedalsRequirement', +e.target.value)} /></Field>
          <Field label="Racecraft rating requirement" hint="-1 = none"><Input disabled={disabled} type="number" value={S.racecraftRatingRequirement ?? -1} onChange={(e) => set('settings.racecraftRatingRequirement', +e.target.value)} /></Field>
          <Field label="Formation lap type"><Input disabled={disabled} type="number" value={S.formationLapType ?? 3} onChange={(e) => set('settings.formationLapType', +e.target.value)} /></Field>
        </div>
        <div className="grid md:grid-cols-3 gap-3 mt-3">
          <Check disabled={disabled} label="Register to server lobby" checked={!!C.registerToLobby} onChange={(v) => set('configuration.registerToLobby', v ? 1 : 0)} />
          <Check disabled={disabled} label="LAN discovery" checked={!!C.lanDiscovery} onChange={(v) => set('configuration.lanDiscovery', v ? 1 : 0)} />
          <Check disabled={disabled} label="Race locked (no mid-session join)" checked={!!S.isRaceLocked} onChange={(v) => set('settings.isRaceLocked', v ? 1 : 0)} />
          <Check disabled={disabled} label="Randomize track when empty" checked={!!S.randomizeTrackWhenEmpty} onChange={(v) => set('settings.randomizeTrackWhenEmpty', v ? 1 : 0)} />
          <Check disabled={disabled} label="Allow auto-DQ" checked={!!S.allowAutoDQ} onChange={(v) => set('settings.allowAutoDQ', v ? 1 : 0)} />
          <Check disabled={disabled} label="Short formation lap" checked={!!S.shortFormationLap} onChange={(v) => set('settings.shortFormationLap', v ? 1 : 0)} />
          <Check disabled={disabled} label="Dump leaderboards" checked={!!S.dumpLeaderboards} onChange={(v) => set('settings.dumpLeaderboards', v ? 1 : 0)} />
          <Check disabled={disabled} label="Dump entry list" checked={!!S.dumpEntryList} onChange={(v) => set('settings.dumpEntryList', v ? 1 : 0)} />
          <Check disabled={disabled} label="Ignore premature disconnects" checked={!!S.ignorePrematureDisconnects} onChange={(v) => set('settings.ignorePrematureDisconnects', v ? 1 : 0)} />
        </div>
      </Card>

      <Card title="Event" subtitle="event.json">
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Track">
            <Select disabled={disabled} value={E.track || 'spa'} onChange={(e) => set('event.track', e.target.value)}>
              {(meta?.accTracks || []).map((t: any) => <option key={t.id} value={t.id}>{t.label}{t.dlc !== 'base' ? ` (${t.dlc})` : ''}</option>)}
            </Select>
          </Field>
          <Field label="Ambient temp °C"><Input disabled={disabled} type="number" value={E.ambientTemp ?? 26} onChange={(e) => set('event.ambientTemp', +e.target.value)} /></Field>
          <Field label="Cloud level (0–1)"><Input disabled={disabled} type="number" step="0.05" min={0} max={1} value={E.cloudLevel ?? 0.3} onChange={(e) => set('event.cloudLevel', +e.target.value)} /></Field>
          <Field label="Rain (0–1)"><Input disabled={disabled} type="number" step="0.05" min={0} max={1} value={E.rain ?? 0} onChange={(e) => set('event.rain', +e.target.value)} /></Field>
          <Field label="Weather randomness (0–7)"><Input disabled={disabled} type="number" min={0} max={7} value={E.weatherRandomness ?? 1} onChange={(e) => set('event.weatherRandomness', +e.target.value)} /></Field>
          <Field label="Pre-race wait (sec)"><Input disabled={disabled} type="number" value={E.preRaceWaitingTimeSeconds ?? 80} onChange={(e) => set('event.preRaceWaitingTimeSeconds', +e.target.value)} /></Field>
          <Field label="Session over time (sec)"><Input disabled={disabled} type="number" value={E.sessionOverTimeSeconds ?? 120} onChange={(e) => set('event.sessionOverTimeSeconds', +e.target.value)} /></Field>
          <Field label="Post-qualy (sec)"><Input disabled={disabled} type="number" value={E.postQualySeconds ?? 60} onChange={(e) => set('event.postQualySeconds', +e.target.value)} /></Field>
          <Field label="Post-race (sec)"><Input disabled={disabled} type="number" value={E.postRaceSeconds ?? 90} onChange={(e) => set('event.postRaceSeconds', +e.target.value)} /></Field>
        </div>
        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <Check disabled={disabled} label="Simracer weather conditions" checked={!!E.simracerWeatherConditions} onChange={(v) => set('event.simracerWeatherConditions', v ? 1 : 0)} />
          <Check disabled={disabled} label="Fixed condition qualification" checked={!!E.isFixedConditionQualification} onChange={(v) => set('event.isFixedConditionQualification', v ? 1 : 0)} />
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium">Sessions (Practice / Qualy / Race)</h4>
            {!disabled && (
              <Button variant="ghost" type="button" onClick={() => set('event.sessions', [...sessions, { hourOfDay: 14, dayOfWeekend: 2, timeMultiplier: 1, sessionType: 'P', sessionDurationMinutes: 20 }])}>
                <Plus size={13} className="inline mr-1" />Add session
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {sessions.map((s, i) => (
              <div key={i} className={`grid grid-cols-6 gap-2 items-end bg-card-2 border border-border border-t-2 rounded-lg p-3 hover:border-border-strong transition-colors ${s.sessionType === 'R' ? 'border-t-danger' : s.sessionType === 'Q' ? 'border-t-warning' : 'border-t-info'}`}>
                <Field label="Type">
                  <Select disabled={disabled} value={s.sessionType} onChange={(e) => setSession(i, 'sessionType', e.target.value)}>
                    <option value="P">Practice</option><option value="Q">Qualifying</option><option value="R">Race</option>
                  </Select>
                </Field>
                <Field label="Duration (min)"><Input disabled={disabled} type="number" value={s.sessionDurationMinutes} onChange={(e) => setSession(i, 'sessionDurationMinutes', +e.target.value)} /></Field>
                <Field label="Hour of day"><Input disabled={disabled} type="number" min={0} max={23} value={s.hourOfDay} onChange={(e) => setSession(i, 'hourOfDay', +e.target.value)} /></Field>
                <Field label="Day of weekend"><Input disabled={disabled} type="number" min={1} max={3} value={s.dayOfWeekend} onChange={(e) => setSession(i, 'dayOfWeekend', +e.target.value)} /></Field>
                <Field label="Time multiplier"><Input disabled={disabled} type="number" min={1} max={24} value={s.timeMultiplier} onChange={(e) => setSession(i, 'timeMultiplier', +e.target.value)} /></Field>
                {!disabled && <Button variant="ghost" type="button" onClick={() => set('event.sessions', sessions.filter((_, j) => j !== i))}><Trash2 size={13} /></Button>}
              </div>
            ))}
            {!sessions.length && <div className="text-xs text-muted">No sessions — add at least one.</div>}
          </div>
        </div>
      </Card>

      <Card title="Event rules" subtitle="eventRules.json">
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Qualify standing type"><Input disabled={disabled} type="number" value={R.qualifyStandingType ?? 1} onChange={(e) => set('eventRules.qualifyStandingType', +e.target.value)} /></Field>
          <Field label="Pit window length (sec)" hint="-1 = none"><Input disabled={disabled} type="number" value={R.pitWindowLengthSec ?? -1} onChange={(e) => set('eventRules.pitWindowLengthSec', +e.target.value)} /></Field>
          <Field label="Driver stint time (sec)" hint="-1 = none"><Input disabled={disabled} type="number" value={R.driverStintTimeSec ?? -1} onChange={(e) => set('eventRules.driverStintTimeSec', +e.target.value)} /></Field>
          <Field label="Mandatory pitstops"><Input disabled={disabled} type="number" value={R.mandatoryPitstopCount ?? 0} onChange={(e) => set('eventRules.mandatoryPitstopCount', +e.target.value)} /></Field>
          <Field label="Max total driving time (sec)" hint="-1 = unlimited"><Input disabled={disabled} type="number" value={R.maxTotalDrivingTime ?? -1} onChange={(e) => set('eventRules.maxTotalDrivingTime', +e.target.value)} /></Field>
          <Field label="Max drivers per car"><Input disabled={disabled} type="number" value={R.maxDriversCount ?? 1} onChange={(e) => set('eventRules.maxDriversCount', +e.target.value)} /></Field>
          <Field label="Tyre set count"><Input disabled={disabled} type="number" value={R.tyreSetCount ?? 50} onChange={(e) => set('eventRules.tyreSetCount', +e.target.value)} /></Field>
        </div>
        <div className="grid md:grid-cols-3 gap-3 mt-3">
          <Check disabled={disabled} label="Refuelling allowed in race" checked={!!R.isRefuellingAllowedInRace} onChange={(v) => set('eventRules.isRefuellingAllowedInRace', v ? 1 : 0)} />
          <Check disabled={disabled} label="Fixed refuelling time" checked={!!R.isRefuellingTimeFixed} onChange={(v) => set('eventRules.isRefuellingTimeFixed', v ? 1 : 0)} />
          <Check disabled={disabled} label="Pitstop requires refuel" checked={!!R.isMandatoryPitstopRefuellingRequired} onChange={(v) => set('eventRules.isMandatoryPitstopRefuellingRequired', v ? 1 : 0)} />
          <Check disabled={disabled} label="Pitstop requires tyre change" checked={!!R.isMandatoryPitstopTyreChangeRequired} onChange={(v) => set('eventRules.isMandatoryPitstopTyreChangeRequired', v ? 1 : 0)} />
          <Check disabled={disabled} label="Pitstop requires driver swap" checked={!!R.isMandatoryPitstopSwapDriverRequired} onChange={(v) => set('eventRules.isMandatoryPitstopSwapDriverRequired', v ? 1 : 0)} />
        </div>
      </Card>

      <Card title="Assists" subtitle="assistRules.json">
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Max stability control %"><Input disabled={disabled} type="number" min={0} max={100} value={A.stabilityControlLevelMax ?? 25} onChange={(e) => set('assistRules.stabilityControlLevelMax', +e.target.value)} /></Field>
        </div>
        <div className="grid md:grid-cols-3 gap-3 mt-3">
          <Check disabled={disabled} label="Disable autosteer" checked={!!A.disableAutosteer} onChange={(v) => set('assistRules.disableAutosteer', v ? 1 : 0)} />
          <Check disabled={disabled} label="Disable auto lights" checked={!!A.disableAutoLights} onChange={(v) => set('assistRules.disableAutoLights', v ? 1 : 0)} />
          <Check disabled={disabled} label="Disable auto wiper" checked={!!A.disableAutoWiper} onChange={(v) => set('assistRules.disableAutoWiper', v ? 1 : 0)} />
          <Check disabled={disabled} label="Disable auto engine start" checked={!!A.disableAutoEngineStart} onChange={(v) => set('assistRules.disableAutoEngineStart', v ? 1 : 0)} />
          <Check disabled={disabled} label="Disable auto pit limiter" checked={!!A.disableAutoPitLimiter} onChange={(v) => set('assistRules.disableAutoPitLimiter', v ? 1 : 0)} />
          <Check disabled={disabled} label="Disable auto gear" checked={!!A.disableAutoGear} onChange={(v) => set('assistRules.disableAutoGear', v ? 1 : 0)} />
          <Check disabled={disabled} label="Disable auto clutch" checked={!!A.disableAutoClutch} onChange={(v) => set('assistRules.disableAutoClutch', v ? 1 : 0)} />
          <Check disabled={disabled} label="Disable ideal line" checked={!!A.disableIdealLine} onChange={(v) => set('assistRules.disableIdealLine', v ? 1 : 0)} />
        </div>
      </Card>

      <Card title="Network" subtitle="configuration.json">
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Game port (TCP+UDP)" hint="Also updates published container port — re-provision after change">
            <Input disabled={disabled} type="number" value={ports} onChange={(e) => setPorts(+e.target.value)} />
          </Field>
          <Field label="Max connections"><Input disabled={disabled} type="number" value={C.maxConnections ?? 24} onChange={(e) => set('configuration.maxConnections', +e.target.value)} /></Field>
        </div>
      </Card>

      {!disabled && (
        <div className="sticky bottom-0 -mx-1 px-1 py-3 bg-background/85 backdrop-blur border-t border-border flex items-center gap-3">
          <Button onClick={() => onSave(cfg, { game: ports })}>Save configuration</Button>
          {dirty && <span className="text-xs text-warning">Unsaved changes</span>}
        </div>
      )}
    </div>
  );
}
