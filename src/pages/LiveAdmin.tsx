import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, GameServer } from '../api';
import { TrackMapCanvas, LiveEvents, LiveSnapshot, TrackMap, LiveCar, carColor, fmtMs, fmtClock } from '../components/live/LiveView';
import { Button, Input, Badge, useToast, ConfirmDialog } from '../components/ui';
import { Radio, Maximize, ChevronRight, Users, Thermometer, CloudRain, Flag } from 'lucide-react';

// Staff live-timing page: pick any AC server at the top, get the expanded
// spectator view (map + timing tower + per-car detail + admin controls).
// ACC is listed but flagged — its dedicated server exposes no telemetry.

export default function LiveAdminPage() {
  const { serverId } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [servers, setServers] = useState<GameServer[]>([]);
  const [snap, setSnap] = useState<LiveSnapshot>({ active: false });
  const [trackMap, setTrackMap] = useState<TrackMap | null>(null);
  const [carNames, setCarNames] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [chat, setChat] = useState('');
  const [cmd, setCmd] = useState('');
  const [kickId, setKickId] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const lastDataRef = useRef(Date.now());
  const mapRef = useRef<HTMLDivElement>(null);

  const acServers = servers.filter((s) => s.type !== 'acc');
  const accServers = servers.filter((s) => s.type === 'acc');
  const server = servers.find((s) => s.id === serverId) || null;

  // Server list for the picker
  useEffect(() => {
    let dead = false;
    const load = () => api.get('/servers').then((r) => { if (!dead) setServers(r.data.servers || []); }).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => { dead = true; clearInterval(t); };
  }, []);

  // Auto-select: first running AC server, else first AC server
  useEffect(() => {
    if (serverId || servers.length === 0) return;
    const pick = acServers.find((s) => s.live?.running) || acServers[0];
    if (pick) nav(`/admin/live/${pick.id}`, { replace: true });
  }, [serverId, servers]);

  // Telemetry polling
  useEffect(() => {
    if (!serverId || server?.type === 'acc') return;
    let dead = false;
    const load = async () => {
      try {
        const { data } = await api.get(`/servers/${serverId}/telemetry`);
        if (!dead) { lastDataRef.current = Date.now(); setSnap(data); }
      } catch { /* keep polling */ }
    };
    load();
    const t = setInterval(load, 1500);
    return () => { dead = true; clearInterval(t); };
  }, [serverId, server?.type]);

  // Track map + car names (admin route works for non-public servers too)
  useEffect(() => {
    if (!serverId || server?.type === 'acc') return;
    api.get(`/servers/${serverId}/track-map`)
      .then((r) => {
        setTrackMap(r.data);
        const names: Record<string, string> = {};
        for (const c of r.data.carsMeta || []) names[c.id] = c.name;
        setCarNames(names);
      })
      .catch(() => { setTrackMap(null); setCarNames({}); });
  }, [serverId, server?.type, snap.session?.track]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const act = async (path: string, body?: any) => {
    try {
      await api.post(`/servers/${serverId}/telemetry/${path}`, body || {});
      toast.success('Sent');
    } catch (e: any) { toast.error(e.message); }
  };

  const s = snap.session;
  const stale = Date.now() - lastDataRef.current > 10000;
  const remaining = useMemo(() => {
    if (snap.sessionTimeRemainingMs == null) return null;
    return snap.sessionTimeRemainingMs - (Date.now() - lastDataRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.sessionTimeRemainingMs, tick]);
  const cars = snap.cars || [];
  const selCar = cars.find((c) => c.carId === selected) || null;

  return (
    <div className="space-y-4">
      {/* Server picker */}
      <div>
        <div className="eyebrow mb-2">Live timing</div>
        <div className="flex items-center gap-2 flex-wrap">
          {acServers.map((sv) => {
            const active = sv.id === serverId;
            return (
              <button key={sv.id} onClick={() => { setSelected(null); setSnap({ active: false }); nav(`/admin/live/${sv.id}`); }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border text-sm transition-colors ${
                  active ? 'border-primary/60 bg-primary/10 font-medium' : 'border-border bg-card hover:border-border/80 hover:bg-accent/60 text-muted hover:text-foreground'
                }`}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${sv.live?.running ? 'bg-green-500 animate-pulse' : 'bg-muted'}`} />
                <span className="truncate max-w-[12rem]">{sv.name}</span>
                {sv.live?.players != null && sv.live.running && <span className="text-[11px] text-muted tabular-nums">{sv.live.players}p</span>}
              </button>
            );
          })}
          {acServers.length === 0 && (
            <div className="text-sm text-muted">No AC servers yet — <Link to="/admin/servers/new" className="text-primary hover:underline">create one</Link>.</div>
          )}
          {accServers.map((sv) => (
            <span key={sv.id} title="ACC exposes no telemetry — live timing unavailable"
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border/50 bg-card/50 text-sm text-muted/60 cursor-not-allowed">
              <span className="w-2 h-2 rounded-full bg-muted/50" />
              <span className="truncate max-w-[10rem] line-through decoration-muted/40">{sv.name}</span>
              <span className="text-[10px] uppercase tracking-wide">no telemetry</span>
            </span>
          ))}
        </div>
      </div>

      {server?.type === 'acc' && (
        <div className="text-sm text-muted bg-card border border-border rounded-lg px-4 py-3">
          ACC dedicated servers expose no telemetry — live timing isn't possible for this server. Pick an AC server above.
        </div>
      )}

      {server && server.type !== 'acc' && (
        <>
          {/* Session header */}
          <div className="flex items-center gap-4 flex-wrap bg-card border border-border rounded-lg px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              {stale || !snap.active
                ? <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" title="waiting for data" />
                : <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" title="LIVE" />}
              <span className="font-semibold text-sm truncate">{s?.serverName || server.name}</span>
            </div>
            {s && (
              <>
                <Badge tone="brand">{s.typeName || s.name}</Badge>
                <span className="text-sm font-mono tabular-nums">{remaining != null ? fmtClock(remaining) : (s.laps ? `${s.laps} laps` : '')}</span>
                <span className="text-sm text-muted flex items-center gap-1.5"><Flag size={12} />{s.track}{s.trackConfig ? `/${s.trackConfig}` : ''}</span>
                <span className="text-sm text-muted flex items-center gap-1.5"><Thermometer size={12} />{s.ambientTemp}°C · {s.roadTemp}°C</span>
                {s.weather && <span className="text-sm text-muted flex items-center gap-1.5"><CloudRain size={12} />{s.weather}</span>}
              </>
            )}
            <span className="text-sm text-muted ml-auto flex items-center gap-1.5"><Users size={13} />{snap.connectedCount ?? 0}</span>
            <button onClick={() => mapRef.current?.requestFullscreen?.().catch(() => {})} className="text-muted hover:text-foreground" title="Fullscreen map">
              <Maximize size={15} />
            </button>
          </div>

          {(!snap.active || (stale && cars.length === 0)) && (
            <div className="px-4 py-2 text-xs text-amber-300 bg-amber-900/20 border border-amber-900/40 rounded-lg flex items-center gap-2">
              <Radio size={12} /> Waiting for live data — start the server with live telemetry enabled, then join a session.
            </div>
          )}

          {/* Expanded view */}
          <div className="flex gap-4 min-h-[30rem]">
            <div ref={mapRef} className="flex-1 min-w-0 bg-black/40 rounded-lg overflow-hidden border border-border relative">
              {trackMap
                ? <TrackMapCanvas snap={snap} trackMap={trackMap} />
                : <div className="h-full min-h-[30rem] grid place-items-center text-muted text-sm">No track map — the server's content needs a track with map.png</div>}
            </div>

            <div className="w-[26rem] shrink-0 flex flex-col gap-3 min-h-0">
              {/* Timing tower */}
              <div className="bg-card border border-border rounded-lg overflow-auto flex-1 min-h-0 max-h-[26rem]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="text-left text-muted border-b border-border">
                      <th className="px-2 py-1.5 w-8">P</th>
                      <th className="px-2 py-1.5">Driver</th>
                      <th className="px-2 py-1.5">Car</th>
                      <th className="px-2 py-1.5 text-right">Laps</th>
                      <th className="px-2 py-1.5 text-right">Best</th>
                      <th className="px-2 py-1.5 text-right">Last</th>
                      <th className="px-2 py-1.5 text-right">Gap</th>
                      <th className="px-2 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {cars.map((c) => (
                      <tr key={c.carId} onClick={() => setSelected(selected === c.carId ? null : c.carId)}
                        className={`border-b border-border/50 cursor-pointer transition-colors ${selected === c.carId ? 'bg-primary/10' : 'hover:bg-accent/50'} ${!c.connected ? 'opacity-40' : ''}`}>
                        <td className="px-2 py-1.5 font-bold" style={{ color: carColor(c.carId) }}>{c.position}</td>
                        <td className="px-2 py-1.5 truncate max-w-[8rem]">{c.driverName || `Car ${c.carId}`}</td>
                        <td className="px-2 py-1.5 text-muted truncate max-w-[7rem]" title={c.model || ''}>{(c.model && carNames[c.model]) || c.model || '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{c.laps}</td>
                        <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtMs(c.bestLapMs)}</td>
                        <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtMs(c.lastLapMs)}</td>
                        <td className="px-2 py-1.5 text-right text-muted font-mono">{c.gapToLeader || ''}</td>
                        <td className="px-1.5 py-1.5 text-muted"><ChevronRight size={11} /></td>
                      </tr>
                    ))}
                    {cars.length === 0 && (
                      <tr><td colSpan={8} className="px-3 py-6 text-center text-muted">No cars on track</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Selected car detail */}
              {selCar && <CarDetail car={selCar} carNames={carNames} onKick={() => setKickId(selCar.carId)} />}

              <LiveEvents events={snap.events || []} heightClass={selCar ? 'h-28' : 'h-40'} />
            </div>
          </div>

          {/* Admin controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <Input className="w-64" placeholder="Broadcast chat…" value={chat} onChange={(e) => setChat(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && chat) { act('chat', { message: chat }); setChat(''); } }} />
            <Button variant="secondary" size="sm" disabled={!chat} onClick={() => { act('chat', { message: chat }); setChat(''); }}>Send</Button>
            <Button variant="secondary" size="sm" onClick={() => act('next-session')}>Next session</Button>
            <Button variant="secondary" size="sm" onClick={() => act('restart-session')}>Restart session</Button>
            <div className="flex-1" />
            <Input className="w-72" placeholder="Admin command (e.g. /ballast 3 20)" value={cmd} onChange={(e) => setCmd(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && cmd) { act('admin', { command: cmd }); setCmd(''); } }} />
            <Button variant="outline" size="sm" disabled={!cmd} onClick={() => { act('admin', { command: cmd }); setCmd(''); }}>Run</Button>
          </div>

          {kickId != null && (
            <ConfirmDialog danger title={`Kick car ${kickId}?`} confirmLabel="Kick"
              body="The driver will be removed from the session."
              onCancel={() => setKickId(null)}
              onConfirm={() => { act('kick', { carId: kickId }); setKickId(null); }} />
          )}
        </>
      )}
    </div>
  );
}

function CarDetail({ car, carNames, onKick }: { car: LiveCar; carNames: Record<string, string>; onKick: () => void }) {
  const laps = car.lapHistory || [];
  return (
    <div className="bg-card border border-primary/40 rounded-lg p-3 space-y-2 shrink-0">
      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: carColor(car.carId) }} />
        <span className="font-semibold text-sm truncate flex-1">{car.driverName || `Car ${car.carId}`}</span>
        <Badge tone={car.connected ? 'green' : 'neutral'}>{car.connected ? 'on track' : 'left'}</Badge>
        <button onClick={onKick} className="text-red-400 hover:text-red-300 text-[11px] font-medium">kick</button>
      </div>
      <div className="text-xs text-muted">{(car.model && carNames[car.model]) || car.model || '—'}{car.skin ? ` · ${car.skin}` : ''}</div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <Stat label="km/h" v={String(Math.round(car.speedKmh))} />
        <Stat label="Gear" v={String(car.gear)} />
        <Stat label="RPM" v={car.rpm ? String(Math.round(car.rpm)) : '—'} />
        <Stat label="Track" v={`${Math.round((car.splinePos || 0) * 100)}%`} />
      </div>
      {laps.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted mb-1">Recent laps</div>
          <div className="flex flex-wrap gap-1 font-mono text-[11px] tabular-nums">
            {laps.slice(-8).map((l, i) => (
              <span key={i} className={`px-1.5 py-0.5 rounded bg-card-2 ${l.cuts ? 'text-danger' : l.ms === car.bestLapMs ? 'text-purple-400' : ''}`} title={l.cuts ? `${l.cuts} cuts` : ''}>
                {fmtMs(l.ms)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return (
    <div className="bg-card-2 rounded px-1 py-1.5">
      <div className="text-sm font-semibold tabular-nums">{v}</div>
      <div className="text-[9px] uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}
