import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, GameServer } from '../api';
import { TrackMapCanvas, TimingTable, LiveEvents, LiveSnapshot, TrackMap, LiveCar, carColor, fmtMs, fmtClock } from '../components/live/LiveView';
import { Button, Badge, useToast, ConfirmDialog } from '../components/ui';
import { Radio, Maximize, Users, Thermometer, CloudRain, Flag, Send, SkipForward, RotateCcw, PanelRightClose, PanelRightOpen } from 'lucide-react';

// Staff live-timing — broadcast layout: the map fills the page, chrome is
// edge-docked translucent strips (top bar / right timing column / bottom
// controls) instead of floating islands. ACC servers show but can't stream.

const TOWER_OPEN = '23rem';
const TOWER_SHUT = '2.25rem';

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
  const [towerOpen, setTowerOpen] = useState(true);
  const [tick, setTick] = useState(0);
  const lastDataRef = useRef(Date.now());
  const speedHist = useRef(new Map<number, number[]>()).current;
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
        if (!dead) {
          lastDataRef.current = Date.now();
          setSnap(data);
          for (const c of data.cars || []) {
            const h = speedHist.get(c.carId) || [];
            h.push(Math.round(c.speedKmh));
            if (h.length > 40) h.shift();
            speedHist.set(c.carId, h);
          }
        }
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
  const towerW = towerOpen ? TOWER_OPEN : TOWER_SHUT;

  return (
    <div ref={mapRef} className="h-full relative overflow-hidden bg-[#05060a] text-foreground">

      {/* ============ MAP (fills everything) ============ */}
      {trackMap && !isAcc
        ? <div className="absolute inset-0"><TrackMapCanvas snap={snap} trackMap={trackMap} selectedId={selected} /></div>
        : <div className="absolute inset-0 grid place-items-center px-6" style={{ paddingRight: isAcc ? 0 : towerW }}>
            <div className="hero-band absolute inset-0 opacity-30" />
            <div className="relative text-center text-muted text-sm max-w-sm">
              {isAcc
                ? 'ACC dedicated servers expose no telemetry — pick an AC server above.'
                : 'No track map — the server needs a track with map.png + map.ini (Content tab → "Import names, images & maps").'}
            </div>
          </div>}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(120% 120% at 45% 50%, transparent 55%, rgba(0,0,0,0.5) 100%)' }} />

      {/* ============ TOP STRIP (docked, full width) ============ */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center gap-3 h-12 px-3 bg-card/80 backdrop-blur-md border-b border-border/60">
        {/* picker */}
        <div className="flex items-center gap-1 overflow-x-auto min-w-0 flex-1">
          {acServers.map((sv) => {
            const active = sv.id === serverId;
            return (
              <button key={sv.id} onClick={() => { setSelected(null); setSnap({ active: false }); nav(`/admin/live/${sv.id}`); }}
                className={`flex items-center gap-2 h-7 px-3 rounded-md text-xs font-medium whitespace-nowrap transition-all border ${
                  active ? 'border-red-500/60 bg-red-500/15 text-foreground' : 'border-transparent text-muted hover:text-foreground hover:bg-white/5'
                }`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sv.live?.running ? 'bg-green-500 animate-pulse' : 'bg-muted'}`} />
                {sv.name}
                {sv.live?.players != null && sv.live.running && <span className="text-[10px] text-muted tabular-nums">{sv.live.players}</span>}
              </button>
            );
          })}
          {acServers.length === 0 && <span className="text-xs text-muted px-1">No AC servers — <Link to="/admin/servers/new" className="text-primary">create one</Link></span>}
          {accServers.map((sv) => (
            <span key={sv.id} title="ACC exposes no telemetry" className="flex items-center gap-1.5 h-7 px-3 text-xs text-muted/50 cursor-not-allowed whitespace-nowrap">
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

      {/* ============ RIGHT TOWER (docked, flush below top strip, collapsible) ============ */}
      {!isAcc && server && (
        <div className={`absolute top-12 right-0 bottom-0 z-10 flex flex-col bg-card/80 backdrop-blur-md border-l border-border/60 transition-[width] duration-200 ${towerOpen ? 'w-[23rem] max-w-[88vw]' : 'w-9'}`}>
          <div className={`eyebrow border-b border-border/60 flex items-center justify-between ${towerOpen ? 'px-3 py-2' : 'px-0 py-2 flex-col gap-1'}`}>
            {towerOpen ? (
              <>
                <span>Timing</span>
                <span className="flex items-center gap-2">
                  <span className="text-muted normal-case tracking-normal">{cars.filter((c) => c.connected).length} cars</span>
                  <button onClick={() => setTowerOpen(false)} className="text-muted hover:text-foreground" title="Hide timing"><PanelRightClose size={13} /></button>
                </span>
              </>
            ) : (
              <button onClick={() => setTowerOpen(true)} className="text-muted hover:text-foreground py-1" title="Show timing"><PanelRightOpen size={13} /></button>
            )}
          </div>
          {/* collapsed: mini leaderboard of position chips */}
          {!towerOpen && (
            <div className="flex flex-col items-center gap-1.5 py-2 overflow-hidden">
              {cars.filter((c) => c.connected).sort((a, b) => (a.position ?? 99) - (b.position ?? 99)).slice(0, 10).map((c) => (
                <button key={c.carId} onClick={() => { setSelected(c.carId); setTowerOpen(true); }}
                  className={`w-5 h-5 rounded-full grid place-items-center text-[9px] font-bold text-black ${selected === c.carId ? 'ring-2 ring-white' : ''}`}
                  style={{ background: carColor(c.carId) }} title={c.driverName || `Car ${c.carId}`}>
                  {c.position ?? '·'}
                </button>
              ))}
            </div>
          )}
          {towerOpen && (
            <>
              <div className="flex-1 min-h-0 overflow-auto">
                <TimingTable cars={cars} carNames={carNames} selectedId={selected} onSelect={(id) => setSelected(selected === id ? null : id)} />
              </div>

              {selCar && <CarDetail car={selCar} carNames={carNames} speeds={speedHist.get(selCar.carId)} onKick={() => setKickId(selCar.carId)} />}

              {/* events docked at tower bottom */}
              <div className="border-t border-border/60 shrink-0">
                <div className="eyebrow px-3 py-1.5">Events</div>
                <LiveEvents events={events} bare heightClass="h-28" />
              </div>
            </>
          )}
        </div>
      )}

      {/* ============ BOTTOM STRIP — admin controls, docked over map area ============ */}
      {!isAcc && server && (
        <div className="absolute bottom-0 left-0 z-10 flex items-center gap-2 px-3 py-2 bg-card/80 backdrop-blur-md border-t border-border/60" style={{ right: towerW }}>
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
        <div className="absolute top-16 left-0 z-10 flex justify-center pointer-events-none" style={{ right: towerW }}>
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

function CarDetail({ car, carNames, speeds, onKick }: { car: LiveCar; carNames: Record<string, string>; speeds?: number[]; onKick: () => void }) {
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
      {speeds && speeds.length > 2 && (
        <div>
          <div className="text-[9px] uppercase tracking-wide text-muted mb-0.5">km/h — last minute</div>
          <Sparkline data={speeds} color={carColor(car.carId)} />
        </div>
      )}
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

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${23 - (v / max) * 21 - 1}`).join(' ');
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="w-full h-6 bg-black/30 rounded">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
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
