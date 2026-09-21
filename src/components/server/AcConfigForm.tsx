import React, { useEffect, useState } from 'react';
import { GameServer } from '../../api';
import { Card, Input, Select, Field, Check, Button, Textarea, Badge } from '../ui';
import { Plus, Trash2, MapPin, X } from 'lucide-react';
import { ContentPickerModal, PickerButton, useAvailableContent } from './ContentPicker';

function setPath(obj: any, path: string[], value: any) {
  const clone = structuredClone(obj);
  let cur = clone;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
  cur[path[path.length - 1]] = value;
  return clone;
}

const WEATHER_PRESETS = ['1_heavy_fog', '2_light_fog', '3_clear', '4_mid_clear', '5_light_clouds', '6_mid_clouds', '7_heavy_clouds'];

export default function AcConfigForm({ server, disabled, onSave }: { server: GameServer; disabled: boolean; onSave: (config: any, ports?: any) => void }) {
  const initial = { telemetry: { enabled: true, forwardTo: '' }, ...server.config };
  const [cfg, setCfg] = useState<any>(() => initial);
  const [gamePort, setGamePort] = useState(server.ports.game);
  const [httpPort, setHttpPort] = useState(server.ports.http || 8081);
  const set = (path: string, value: any) => setCfg((c: any) => setPath(c, path.split('.'), value));
  const dirty = JSON.stringify(cfg) !== JSON.stringify(initial) || gamePort !== server.ports.game || httpPort !== (server.ports.http || 8081);

  const S = cfg.server || {};
  const DT = cfg.dynamicTrack || {};
  const weathers: any[] = cfg.weathers || [];
  const avail = useAvailableContent(server.id);
  const [picker, setPicker] = useState<null | 'track' | 'cars'>(null);
  const nameFor = (list: { value: string; name: string }[], id: string) => list.find((o) => o.value === id)?.name || id;

  const setWeather = (i: number, k: string, v: any) => set('weathers', weathers.map((w, j) => (j === i ? { ...w, [k]: v } : w)));
  const setSession = (key: string, k: string, v: any) => set(`${key}.${k}`, v);

  const selectedCars: string[] = String(S.cars || '').split(';').filter(Boolean);
  const toggleCar = (car: string) => {
    const next = selectedCars.includes(car) ? selectedCars.filter((c) => c !== car) : [...selectedCars, car];
    set('server.cars', next.join(';'));
  };

  return (
    <div className="space-y-4">
      <Card title="Server" subtitle="server_cfg.ini — SERVER">
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Server name"><Input disabled={disabled} value={S.name || ''} onChange={(e) => set('server.name', e.target.value)} /></Field>
          <Field label="Track" hint={S.trackConfig ? `Layout: ${S.trackConfig}` : 'Default layout'}>
            <PickerButton disabled={disabled} icon={<MapPin size={13} />}
              label={S.track ? nameFor(avail.tracks, S.track) : 'Choose a track…'}
              mono={S.track ? `${S.track}${S.trackConfig ? ` · ${S.trackConfig}` : ''}` : undefined}
              onClick={() => setPicker('track')} />
          </Field>
          <Field label="Max clients"><Input disabled={disabled} type="number" value={S.maxClients ?? 12} onChange={(e) => set('server.maxClients', +e.target.value)} /></Field>
          <Field label="Join password" hint="Empty = open"><Input disabled={disabled} type="password" value={S.password || ''} onChange={(e) => set('server.password', e.target.value)} autoComplete="new-password" /></Field>
          <Field label="Admin password"><Input disabled={disabled} type="password" value={S.adminPassword || ''} onChange={(e) => set('server.adminPassword', e.target.value)} autoComplete="new-password" /></Field>
          <Field label="Sun angle"><Input disabled={disabled} type="number" step="0.5" value={S.sunAngle ?? 16} onChange={(e) => set('server.sunAngle', +e.target.value)} /></Field>
          <Field label="Race over time (sec)"><Input disabled={disabled} type="number" value={S.raceOverTime ?? 120} onChange={(e) => set('server.raceOverTime', +e.target.value)} /></Field>
          <Field label="Time of day multiplier"><Input disabled={disabled} type="number" value={S.timeOfDayMult ?? 1} onChange={(e) => set('server.timeOfDayMult', +e.target.value)} /></Field>
          <Field label="Result screen time (sec)"><Input disabled={disabled} type="number" value={S.resultScreenTime ?? 0} onChange={(e) => set('server.resultScreenTime', +e.target.value)} /></Field>
        </div>
        <div className="grid md:grid-cols-3 gap-3 mt-3">
          <Check disabled={disabled} label="Register to lobby" checked={!!S.registerToLobby} onChange={(v) => set('server.registerToLobby', v ? 1 : 0)} />
          <Check disabled={disabled} label="Loop mode" checked={!!S.loopMode} onChange={(v) => set('server.loopMode', v ? 1 : 0)} />
          <Check disabled={disabled} label="Pickup mode" checked={!!S.pickupModeEnabled} onChange={(v) => set('server.pickupModeEnabled', v ? 1 : 0)} />
          <Check disabled={disabled} label="Lock entry list" checked={!!S.lockEntryList} onChange={(v) => set('server.lockEntryList', v ? 1 : 0)} />
          <Check disabled={disabled} label="Race gas penalty disabled" checked={!!S.raceGasPenaltyDisabled} onChange={(v) => set('server.raceGasPenaltyDisabled', v ? 1 : 0)} />
          <Check disabled={disabled} label="Force virtual mirror" checked={!!S.forceVirtualMirror} onChange={(v) => set('server.forceVirtualMirror', v ? 1 : 0)} />
        </div>
      </Card>

      <Card title="Cars allowed" subtitle="Entry list pool"
        actions={!disabled && <Button variant="secondary" size="sm" type="button" onClick={() => setPicker('cars')}>Browse cars</Button>}>
        {selectedCars.length === 0 ? (
          <div className="text-xs text-muted">No cars selected — the server won't accept any car. Browse to add.</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {selectedCars.map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card-2 pl-2.5 pr-1 py-1 text-xs">
                <span className="font-medium">{nameFor(avail.cars, c)}</span>
                <span className="font-mono text-[10px] text-muted">{c}</span>
                {!disabled && (
                  <button type="button" onClick={() => toggleCar(c)} className="p-0.5 rounded text-muted hover:text-danger"><X size={12} /></button>
                )}
              </span>
            ))}
          </div>
        )}
        <div className="text-xs text-muted mt-2">{selectedCars.length} car(s) selected</div>
      </Card>

      <Card title="Sessions" subtitle="Rotation">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-card-2 border border-border border-t-2 border-t-info rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Badge tone="blue">P</Badge>
              <Check disabled={disabled} label="Practice" checked={cfg.practice?.enabled !== false} onChange={(v) => set('practice.enabled', v)} />
            </div>
            <Field label="Name"><Input disabled={disabled} value={cfg.practice?.name || 'Free Practice'} onChange={(e) => setSession('practice', 'name', e.target.value)} /></Field>
            <Field label="Duration (min)"><Input disabled={disabled} type="number" value={cfg.practice?.timeMinutes ?? 20} onChange={(e) => setSession('practice', 'timeMinutes', +e.target.value)} /></Field>
            <Check disabled={disabled} label="Open join" checked={cfg.practice?.isOpen !== 0} onChange={(v) => setSession('practice', 'isOpen', v ? 1 : 0)} />
          </div>
          <div className="bg-card-2 border border-border border-t-2 border-t-warning rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Badge tone="amber">Q</Badge>
              <Check disabled={disabled} label="Qualify" checked={cfg.qualify?.enabled !== false} onChange={(v) => set('qualify.enabled', v)} />
            </div>
            <Field label="Name"><Input disabled={disabled} value={cfg.qualify?.name || 'Qualifying'} onChange={(e) => setSession('qualify', 'name', e.target.value)} /></Field>
            <Field label="Duration (min)"><Input disabled={disabled} type="number" value={cfg.qualify?.timeMinutes ?? 15} onChange={(e) => setSession('qualify', 'timeMinutes', +e.target.value)} /></Field>
            <Field label="Max wait %"><Input disabled={disabled} type="number" value={S.qualifyMaxWaitPerc ?? 400} onChange={(e) => set('server.qualifyMaxWaitPerc', +e.target.value)} /></Field>
          </div>
          <div className="bg-card-2 border border-border border-t-2 border-t-danger rounded-lg p-4 space-y-3">
            <Badge tone="red">R</Badge>
            <Field label="Laps" hint="0 = timed race"><Input disabled={disabled} type="number" value={cfg.race?.laps ?? 10} onChange={(e) => setSession('race', 'laps', +e.target.value)} /></Field>
            <Field label="Time (min)" hint="used when laps = 0"><Input disabled={disabled} type="number" value={cfg.race?.timeMinutes ?? 0} onChange={(e) => setSession('race', 'timeMinutes', +e.target.value)} /></Field>
            <Field label="Wait time (sec)"><Input disabled={disabled} type="number" value={cfg.race?.waitTime ?? 60} onChange={(e) => setSession('race', 'waitTime', +e.target.value)} /></Field>
          </div>
        </div>
      </Card>

      <Card title="Physics & rules">
        <div className="grid md:grid-cols-4 gap-3">
          <Field label="Damage multiplier %"><Input disabled={disabled} type="number" value={S.damageMultiplier ?? 100} onChange={(e) => set('server.damageMultiplier', +e.target.value)} /></Field>
          <Field label="Fuel rate"><Input disabled={disabled} type="number" step="0.1" value={S.fuelConsumptionRate ?? 1} onChange={(e) => set('server.fuelConsumptionRate', +e.target.value)} /></Field>
          <Field label="Tyre wear factor"><Input disabled={disabled} type="number" step="0.1" value={S.tyreWearFactor ?? 1} onChange={(e) => set('server.tyreWearFactor', +e.target.value)} /></Field>
          <Field label="Allowed tyres out" hint="-1 = unlimited"><Input disabled={disabled} type="number" value={S.allowedTyresOut ?? -1} onChange={(e) => set('server.allowedTyresOut', +e.target.value)} /></Field>
          <Field label="Max ballast (kg)"><Input disabled={disabled} type="number" value={S.maxBallastKg ?? 50} onChange={(e) => set('server.maxBallastKg', +e.target.value)} /></Field>
          <Field label="Voting quorum %"><Input disabled={disabled} type="number" value={S.votingQuorum ?? 75} onChange={(e) => set('server.votingQuorum', +e.target.value)} /></Field>
          <Field label="Vote duration (sec)"><Input disabled={disabled} type="number" value={S.voteDuration ?? 20} onChange={(e) => set('server.voteDuration', +e.target.value)} /></Field>
          <Field label="Kick AFK (sec)" hint="0 = off"><Input disabled={disabled} type="number" value={S.kickAfkTime ?? 0} onChange={(e) => set('server.kickAfkTime', +e.target.value)} /></Field>
        </div>
        <div className="grid md:grid-cols-3 gap-3 mt-3">
          <Field label="Traction control" hint="0 = off, 1 = factory, 2 = on">
            <Select disabled={disabled} value={S.tcAllowed ?? 1} onChange={(e) => set('server.tcAllowed', +e.target.value)}>
              <option value={0}>Off</option><option value={1}>Factory</option><option value={2}>On</option>
            </Select>
          </Field>
          <Field label="ABS">
            <Select disabled={disabled} value={S.absAllowed ?? 1} onChange={(e) => set('server.absAllowed', +e.target.value)}>
              <option value={0}>Off</option><option value={1}>Factory</option><option value={2}>On</option>
            </Select>
          </Field>
          <Field label="Blacklist mode">
            <Select disabled={disabled} value={S.blacklistMode ?? 0} onChange={(e) => set('server.blacklistMode', +e.target.value)}>
              <option value={0}>Kick</option><option value={1}>Ban & kick</option><option value={2}>Kick only this session</option>
            </Select>
          </Field>
        </div>
        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <Check disabled={disabled} label="Stability control allowed" checked={!!S.stabilityAllowed} onChange={(v) => set('server.stabilityAllowed', v ? 1 : 0)} />
          <Check disabled={disabled} label="Auto clutch allowed" checked={!!S.autoClutchAllowed} onChange={(v) => set('server.autoClutchAllowed', v ? 1 : 0)} />
        </div>
      </Card>

      <Card title="Dynamic track">
        <div className="grid md:grid-cols-4 gap-3">
          <Field label="Session start grip %"><Input disabled={disabled} type="number" value={DT.sessionStart ?? 95} onChange={(e) => set('dynamicTrack.sessionStart', +e.target.value)} /></Field>
          <Field label="Randomness"><Input disabled={disabled} type="number" value={DT.randomness ?? 2} onChange={(e) => set('dynamicTrack.randomness', +e.target.value)} /></Field>
          <Field label="Session transfer %"><Input disabled={disabled} type="number" value={DT.sessionTransfer ?? 90} onChange={(e) => set('dynamicTrack.sessionTransfer', +e.target.value)} /></Field>
          <Field label="Lap gain"><Input disabled={disabled} type="number" value={DT.lapGain ?? 10} onChange={(e) => set('dynamicTrack.lapGain', +e.target.value)} /></Field>
        </div>
      </Card>

      <Card title="Weather" subtitle="Slots" actions={!disabled && <Button variant="secondary" size="sm" type="button" icon={<Plus size={12} />} onClick={() => set('weathers', [...weathers, { graphics: '3_clear', baseTempAmbient: 22, baseTempRoad: 4, variationAmbient: 1, variationRoad: 1, windBaseSpeedMin: 0, windBaseSpeedMax: 0, windBaseDirection: 0, windVariationDirection: 0 }])}>Add slot</Button>}>
        {weathers.length === 0 && <div className="text-xs text-muted">No weather slots — server uses default conditions.</div>}
        <div className="space-y-2">
          {weathers.map((w, i) => (
            <div key={i} className="grid grid-cols-4 md:grid-cols-8 gap-2 items-end bg-card-2 border border-border rounded-lg p-3 hover:border-border-strong transition-colors">
              <Field label={`Slot ${i} graphics`}>
                <Select disabled={disabled} value={w.graphics} onChange={(e) => setWeather(i, 'graphics', e.target.value)}>
                  {WEATHER_PRESETS.map((p) => <option key={p}>{p}</option>)}
                  {!WEATHER_PRESETS.includes(w.graphics) && <option>{w.graphics}</option>}
                </Select>
              </Field>
              <Field label="Ambient °C"><Input disabled={disabled} type="number" value={w.baseTempAmbient} onChange={(e) => setWeather(i, 'baseTempAmbient', +e.target.value)} /></Field>
              <Field label="Road Δ°C"><Input disabled={disabled} type="number" value={w.baseTempRoad} onChange={(e) => setWeather(i, 'baseTempRoad', +e.target.value)} /></Field>
              <Field label="Amb. var"><Input disabled={disabled} type="number" value={w.variationAmbient} onChange={(e) => setWeather(i, 'variationAmbient', +e.target.value)} /></Field>
              <Field label="Wind min"><Input disabled={disabled} type="number" value={w.windBaseSpeedMin} onChange={(e) => setWeather(i, 'windBaseSpeedMin', +e.target.value)} /></Field>
              <Field label="Wind max"><Input disabled={disabled} type="number" value={w.windBaseSpeedMax} onChange={(e) => setWeather(i, 'windBaseSpeedMax', +e.target.value)} /></Field>
              <Field label="Wind dir"><Input disabled={disabled} type="number" value={w.windBaseDirection} onChange={(e) => setWeather(i, 'windBaseDirection', +e.target.value)} /></Field>
              {!disabled && <Button variant="ghost" size="sm" type="button" onClick={() => set('weathers', weathers.filter((_, j) => j !== i))}><Trash2 size={13} /></Button>}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Network" subtitle="Ports">
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Game port (TCP+UDP)" hint="Re-provision after change"><Input disabled={disabled} type="number" value={gamePort} onChange={(e) => setGamePort(+e.target.value)} /></Field>
          <Field label="HTTP port" hint="Status API"><Input disabled={disabled} type="number" value={httpPort} onChange={(e) => setHttpPort(+e.target.value)} /></Field>
          <Field label="UDP plugin local port" hint="0 = off — ignored when live telemetry is enabled"><Input disabled={disabled || !!cfg.telemetry?.enabled} type="number" value={S.udpPluginLocalPort ?? 0} onChange={(e) => set('server.udpPluginLocalPort', +e.target.value)} /></Field>
        </div>
      </Card>

      <Card title="Live telemetry" subtitle="UDP plugin">
        <p className="text-xs text-muted mb-3">Built-in UDP plugin feed powering the live timing page and admin controls.</p>
        <div className="space-y-3">
          <Check disabled={disabled} label="Enable live telemetry" checked={cfg.telemetry?.enabled !== false} onChange={(v) => set('telemetry.enabled', v)} hint="Writes UDP_PLUGIN_* into server_cfg.ini at start — manual UDP plugin fields are ignored while enabled" />
          <div className="grid md:grid-cols-3 gap-3">
            <Field label="Plugin port (server)" hint="UDP_PLUGIN_LOCAL_PORT"><Input disabled type="number" value={server.ports.plugin ?? (server.ports.game + 100)} /></Field>
            <Field label="Listener port (manager)" hint="UDP_PLUGIN_ADDRESS port"><Input disabled type="number" value={server.ports.pluginListen ?? (server.ports.game + 101)} /></Field>
            <Field label="Forward plugin traffic to" hint="optional ip:port for sTracker etc."><Input disabled={disabled || cfg.telemetry?.enabled === false} value={cfg.telemetry?.forwardTo || ''} onChange={(e) => set('telemetry.forwardTo', e.target.value)} placeholder="192.168.1.50:12000" /></Field>
          </div>
          {cfg.telemetry?.enabled === false && (
            <div className="grid md:grid-cols-3 gap-3 pt-1">
              <Field label="UDP plugin address" hint="UDP_PLUGIN_ADDRESS — manual plugin target"><Input disabled={disabled} value={S.udpPluginAddress || ''} onChange={(e) => set('server.udpPluginAddress', e.target.value)} placeholder="127.0.0.1:11000" /></Field>
              <Field label="UDP plugin local port" hint="UDP_PLUGIN_LOCAL_PORT"><Input disabled={disabled} type="number" value={S.udpPluginLocalPort ?? 0} onChange={(e) => set('server.udpPluginLocalPort', +e.target.value)} /></Field>
              <Field label="Auth plugin address" hint="AUTH_PLUGIN_ADDRESS"><Input disabled={disabled} value={S.authPluginAddress || ''} onChange={(e) => set('server.authPluginAddress', e.target.value)} placeholder="127.0.0.1:12000" /></Field>
            </div>
          )}
        </div>
      </Card>

      {server.type === 'assettoserver' && (
        <Card title="AssettoServer" subtitle="extra_cfg.yml">
          <div className="grid md:grid-cols-3 gap-3">
            <Field label="Minimum CSP version" hint="0 = don't require CSP"><Input disabled={disabled} type="number" value={cfg.extra?.minimumCspVersion ?? 0} onChange={(e) => set('extra.minimumCspVersion', +e.target.value)} /></Field>
            <Field label="Vote-kick min. players"><Input disabled={disabled} type="number" value={cfg.extra?.voteKickMinimumConnectedPlayers ?? 3} onChange={(e) => set('extra.voteKickMinimumConnectedPlayers', +e.target.value)} /></Field>
            <Field label="Server description" hint="Shown in CM server details"><Input disabled={disabled} value={cfg.extra?.serverDescription || ''} onChange={(e) => set('extra.serverDescription', e.target.value)} /></Field>
          </div>
          <div className="grid md:grid-cols-3 gap-3 mt-3">
            <Check disabled={disabled} label="Steam auth" checked={!!cfg.extra?.useSteamAuth} onChange={(v) => set('extra.useSteamAuth', v)} />
            <Check disabled={disabled} label="AI traffic" checked={!!cfg.extra?.enableAi} onChange={(v) => set('extra.enableAi', v)} />
            <Check disabled={disabled} label="WeatherFX" checked={!!cfg.extra?.enableWeatherFx} onChange={(v) => set('extra.enableWeatherFx', v)} />
            <Check disabled={disabled} label="Real time" checked={!!cfg.extra?.enableRealTime} onChange={(v) => set('extra.enableRealTime', v)} />
            <Check disabled={disabled} label="Car reset (CM reset key)" checked={!!cfg.extra?.enableCarReset} onChange={(v) => set('extra.enableCarReset', v)} />
            <Check disabled={disabled} label="Session vote" checked={!!cfg.extra?.enableSessionVote} onChange={(v) => set('extra.enableSessionVote', v)} />
            <Check disabled={disabled} label="Kick player vote" checked={!!cfg.extra?.enableKickPlayerVote} onChange={(v) => set('extra.enableKickPlayerVote', v)} />
            <Check disabled={disabled} label="Force lights" checked={!!cfg.extra?.forceLights} onChange={(v) => set('extra.forceLights', v)} />
            <Check disabled={disabled} label="Global DRS" checked={!!cfg.extra?.enableGlobalDrs} onChange={(v) => set('extra.enableGlobalDrs', v)} />
            <Check disabled={disabled} label="Unlimited P2P" checked={!!cfg.extra?.enableUnlimitedP2P} onChange={(v) => set('extra.enableUnlimitedP2P', v)} />
          </div>
          <div className="grid md:grid-cols-2 gap-3 mt-3">
            <Field label="Loading image URLs" hint="One URL per line">
              <Textarea disabled={disabled} rows={3} value={(cfg.extra?.loadingImageUrls || []).join('\n')} onChange={(e) => set('extra.loadingImageUrls', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))} />
            </Field>
            <Field label="Enabled plugins" hint="One plugin name per line (e.g. AiPlugin, WeatherPlugin)">
              <Textarea disabled={disabled} rows={3} value={(cfg.extra?.enablePlugins || []).join('\n')} onChange={(e) => set('extra.enablePlugins', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))} />
            </Field>
          </div>
        </Card>
      )}

      {!disabled && (
        <div className="sticky bottom-0 -mx-1 px-1 py-3 bg-background/85 backdrop-blur border-t border-border flex items-center gap-3">
          <Button onClick={() => onSave(cfg, { game: gamePort, http: httpPort })}>Save configuration</Button>
          {dirty && <span className="text-xs text-warning">Unsaved changes</span>}
        </div>
      )}

      <ContentPickerModal open={picker === 'track'} onClose={() => setPicker(null)} title="Choose track" kind="track"
        options={avail.tracks} loading={avail.loading} selected={S.track ? [S.track] : []}
        onApply={({ value, layout }: any) => { set('server.track', value); set('server.trackConfig', layout || ''); }} />
      <ContentPickerModal open={picker === 'cars'} onClose={() => setPicker(null)} title="Allowed cars" kind="car"
        options={avail.cars} loading={avail.loading} multi selected={selectedCars}
        onApply={(vals: string[]) => set('server.cars', vals.join(';'))} />
    </div>
  );
}
