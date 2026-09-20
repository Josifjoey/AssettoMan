import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, GameServer } from '../api';
import { TrackMapCanvas, LiveSnapshot, TrackMap, LiveCar, carColor, fmtMs, fmtClock } from '../components/live/LiveView';
import { Button, Badge, useToast, ConfirmDialog } from '../components/ui';
import { Radio, Maximize, Users, Thermometer, CloudRain, Flag, Send, SkipForward, RotateCcw, MessageSquare } from 'lucide-react';

// Staff live-timing — broadcast layout: the map fills the page, chrome is
// edge-docked translucent strips (top bar / right timing column / bottom
// controls) instead of floating islands. ACC servers show but can't stream.

const TOWER_W = 'w-[23rem]';

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
  const isAcc = server?.type === 'acc';

  useEffect(() => {
    let dead = false;
    const load = () => api.get('/servers').then((r) => { if (!dead) setServers(r.data.servers || []); }).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => { dead = true; clearInterval(t); };
  }, []);

  useEffect(() => {
    if (serverId || servers.length === 0) return;
    const pick = acServers.find((s) => s.live?.running) || acServers[0];
    if (pick) nav(`/admin/live/${pick.id}`, { replace: true });
  }, [serverId, servers]);

  useEffect(() => {
    if (!serverId || isAcc) return;
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
  }, [serverId, isAcc]);

  useEffect(() => {
    if (!serverId || isAcc) return;
    api.get(`/servers/${serverId}/track-map`)
      .then((r) => {
        setTrackMap(r.data);
        const names: Record<string, string> = {};
        for (const c of r.data.carsMeta || []) names[c.id] = c.name;
        setCarNames(names);
      })
      .catch(() => { setTrackMap(null); setCarNames({}); });
  }, [serverId, isAcc, snap.session?.track]);

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
  const events = snap.events || [];
  const selCar = cars.find((c) => c.carId === selected) || null;

  return (
    <div ref={mapRef} className="h-full min-h-0 relative rounded-xl overflow-hidden border border-border bg-[#05060a]">

      {/* ============ MAP (fills everything) ============ */}
      {trackMap && !isAcc
        ? <div className="absolute inset-0"><TrackMapCanvas snap={snap} trackMap={trackMap} /></div>
        : <div className={`absolute inset-0 ${isAcc ? '' : 'pr-[23rem]'} grid place-items-center px-6`}>
            <div className="text-center text-muted text-sm max-w-sm">
              {isAcc
                ? 'ACC dedicated servers expose no telemetry — pick an AC server above.'
                : 'No track map — the server needs a track with map.png + map.ini (Content tab → "Import names, images & maps").'}
            </div>
          </div>}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(120% 120% at 45% 50%, transparent 55%, rgba(0,0,0,0.5) 100%)' }} />

      {/* ============ TOP STRIP (docked, full width) ============ */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center gap-2 h-12 px-3 bg-card/80 backdrop-blur-md border-b border-border/60">
        {/* picker */}
        <div className="flex items-center gap-1 overflow-x-auto min-w-0">
          {acServers.map((sv) => (
            <button key={sv.id} onClick={() => { setSelected(null); setSnap({ active: false }); nav(`/admin/live/${sv.id}`); }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-colors ${
                sv.id === serverId ? 'bg-red-500/15 text-foreground font-medium ring-1 ring-red-500/50' : 'text-muted hover:text-foreground hover:bg-accent/60'
              }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sv.live?.running ? 'bg-green-500 animate-pulse' : 'bg-muted'}`} />
              {sv.name}
              {sv.live?.players != null && sv.live.running && <span className="text-[10px] text-muted tabular-nums">{sv.live.players}</span>}
            </button>
          ))}
          {acServers.length === 0 && <span className="text-xs text-muted px-1">No AC servers — <Link to="/admin/servers/new" className="text-primary">create one</Link></span>}
          {accServers.map((sv) => (
            <span key={sv.id} title="ACC exposes no telemetry" className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-muted/50 cursor-not-allowed whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-muted/50" /><span className="line-through">{sv.name}</span>
            </span>
          ))}
        </div>

        {/* session info — right aligned in same bar */}
        <div className="ml-auto flex items-center gap-3 shrink-0">
          {stale || !snap.active
            ? <span className="w-2 h-2 rounded-full bg-amber-400" title="waiting for data" />
            : <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title="LIVE" />}
          <span className="font-semibold text-sm truncate max-w-[12rem] hidden sm:inline">{s?.serverName || server?.name || 'Live timing'}</span>
          {s && (
            <>
              <span className="w-px h-4 bg-border" />
              <span className="text-xs text-muted">{s.typeName || s.name}</span>
              <span className="text-sm font-mono tabular-nums font-semibold text-red-400">{remaining != null ? fmtClock(remaining) : (s.laps ? `${s.laps}L` : '')}</span>
              <span className="text-xs text-muted hidden md:flex items-center gap-1"><Flag size={11} />{s.track}{s.trackConfig ? `/${s.trackConfig}` : ''}</span>
              <span className="text-xs text-muted hidden lg:flex items-center gap-1"><Thermometer size={11} />{s.ambientTemp}°/{s.roadTemp}°</span>
              {s.weather && <span className="text-xs text-muted hidden lg:flex items-center gap-1"><CloudRain size={11} />{s.weather}</span>}
              <span className="text-xs text-muted hidden sm:flex items-center gap-1"><Users size={11} />{snap.connectedCount ?? 0}</span>
            </>
          )}
          <button onClick={() => mapRef.current?.requestFullscreen?.().catch(() => {})} className="text-muted hover:text-foreground" title="Fullscreen"><Maximize size={14} /></button>
        </div>
      </div>

      {/* ============ RIGHT TOWER (docked, flush below top strip) ============ */}
      {!isAcc && server && (
        <div className={`absolute top-12 right-0 bottom-0 ${TOWER_W} z-10 flex flex-col bg-card/80 backdrop-blur-md border-l border-border/60`}>
          <div className="eyebrow px-3 py-2 border-b border-border/60 flex items-center justify-between">
            <span>Timing</span>
            <span className="text-muted normal-case tracking-normal">{cars.filter((c) => c.connected).length} cars</span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card/95 backdrop-blur z-10">
                <tr className="text-left text-muted border-b border-border">
                  <th className="px-3 py-2 w-8">P</th>
                  <th className="px-2 py-2">Driver</th>
                  <th className="px-2 py-2">Car</th>
                  <th className="px-2 py-2 text-right">Laps</th>
                  <th className="px-2 py-2 text-right">Best</th>
                  <th className="px-2 py-2 text-right">Last</th>
                  <th className="px-3 py-2 text-right">Gap</th>
                </tr>
              </thead>
              <tbody>
                {cars.map((c) => (
                  <tr key={c.carId} onClick={() => setSelected(selected === c.carId ? null : c.carId)}
                    className={`border-b border-border/40 cursor-pointer transition-colors ${selected === c.carId ? 'bg-primary/15' : 'hover:bg-accent/50'} ${!c.connected ? 'opacity-40' : ''}`}>
                    <td className="px-3 py-1.5 font-bold" style={{ color: carColor(c.carId) }}>{c.position}</td>
                    <td className="px-2 py-1.5 truncate max-w-[8rem]">{c.driverName || `Car ${c.carId}`}</td>
                    <td className="px-2 py-1.5 text-muted truncate max-w-[6rem]" title={c.model || ''}>{(c.model && carNames[c.model]) || c.model || '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{c.laps}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtMs(c.bestLapMs)}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtMs(c.lastLapMs)}</td>
                    <td className="px-3 py-1.5 text-right text-muted font-mono">{c.gapToLeader || ''}</td>
                  </tr>
                ))}
                {cars.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-muted">No cars on track</td></tr>}
              </tbody>
            </table>
          </div>

          {selCar && <CarDetail car={selCar} carNames={carNames} onKick={() => setKickId(selCar.carId)} />}

          {/* events docked at tower bottom */}
          <div className="border-t border-border/60 shrink-0">
            <div className="eyebrow px-3 py-1.5">Events</div>
            <div className="h-28 overflow-auto px-1 pb-1">
              {events.slice(0, 10).map((e, i) => (
                <div key={i} className="flex gap-2 text-xs px-2 py-0.5">
                  <span className="text-muted shrink-0">{e.type === 'chat' ? <MessageSquare size={10} className="inline" /> : e.type === 'lap' ? <Flag size={10} className="inline" /> : '·'}</span>
                  <span className="truncate">{e.text}</span>
                </div>
              ))}
              {events.length === 0 && <div className="text-xs text-muted px-2">No events yet.</div>}
            </div>
          </div>
        </div>
      )}

      {/* ============ BOTTOM STRIP — admin controls, docked over map area ============ */}
      {!isAcc && server && (
        <div className="absolute bottom-0 left-0 right-[23rem] z-10 flex items-center gap-2 px-3 py-2 bg-card/80 backdrop-blur-md border-t border-border/60">
          <div className="relative flex-1 min-w-[9rem]">
            <Send size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input value={chat} onChange={(e) => setChat(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && chat) { act('chat', { message: chat }); setChat(''); } }}
              placeholder="Broadcast chat…"
              className="w-full bg-black/30 border border-border/60 rounded-md pl-7 pr-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/60 placeholder:text-muted" />
          </div>
          <Button variant="secondary" size="sm" disabled={!chat} onClick={() => { act('chat', { message: chat }); setChat(''); }}>Send</Button>
          <span className="w-px h-5 bg-border" />
          <Button variant="secondary" size="sm" icon={<SkipForward size={12} />} onClick={() => act('next-session')}>Next</Button>
          <Button variant="secondary" size="sm" icon={<RotateCcw size={12} />} onClick={() => act('restart-session')}>Restart</Button>
          <span className="w-px h-5 bg-border" />
          <input value={cmd} onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && cmd) { act('admin', { command: cmd }); setCmd(''); } }}
            placeholder="/admin command"
            className="w-40 bg-black/30 border border-border/60 rounded-md px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary/60 placeholder:text-muted" />
          <Button variant="outline" size="sm" disabled={!cmd} onClick={() => { act('admin', { command: cmd }); setCmd(''); }}>Run</Button>
        </div>
      )}

      {/* waiting pill — floats over the map area only */}
      {(!snap.active || (stale && cars.length === 0)) && !isAcc && server && (
        <div className="absolute top-16 left-0 right-[23rem] z-10 flex justify-center pointer-events-none">
          <div className="px-4 py-1.5 text-xs text-amber-300 bg-amber-950/70 border border-amber-900/60 rounded-full backdrop-blur flex items-center gap-2">
            <Radio size={12} /> Waiting for live data — start the server with telemetry enabled, then join a session.
          </div>
        </div>
      )}

      {kickId != null && (
        <ConfirmDialog danger title={`Kick car ${kickId}?`} confirmLabel="Kick"
          body="The driver will be removed from the session."
          onCancel={() => setKickId(null)}
          onConfirm={() => { act('kick', { carId: kickId }); setKickId(null); }} />
      )}
    </div>
  );
}

function CarDetail({ car, carNames, onKick }: { car: LiveCar; carNames: Record<string, string>; onKick: () => void }) {
  const laps = car.lapHistory || [];
  return (
    <div className="border-t border-border/60 p-3 space-y-2 shrink-0 bg-card-2/60">
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
        <div className="flex flex-wrap gap-1 font-mono text-[11px] tabular-nums">
          {laps.slice(-8).map((l, i) => (
            <span key={i} className={`px-1.5 py-0.5 rounded bg-black/30 ${l.cuts ? 'text-danger' : l.ms === car.bestLapMs ? 'text-purple-400' : ''}`} title={l.cuts ? `${l.cuts} cuts` : ''}>
              {fmtMs(l.ms)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return (
    <div className="bg-black/30 rounded px-1 py-1.5">
      <div className="text-sm font-semibold tabular-nums">{v}</div>
      <div className="text-[9px] uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}
