import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { api } from '../api';
import LiveView, { TrackMapCanvas, LiveSnapshot, TrackMap, fmtClock } from '../components/live/LiveView';
import { Maximize, Radio, Gauge, Users, Thermometer, CloudRain, Flag, MessageSquare } from 'lucide-react';

// Public spectator page — broadcast layout: map fills the screen, chrome is
// edge-docked translucent strips (top bar + right timing column).
// /live (no id) auto-selects a live server; ?hud=1 strips chrome for OBS.
// Data: SSE stream with a polling fallback.

interface LivePickerServer { id: string; name: string; type: string; running?: boolean; liveAvailable?: boolean }

export default function LivePage() {
  const { serverId } = useParams();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const hud = params.get('hud') === '1';
  const [snap, setSnap] = useState<LiveSnapshot>({ active: false });
  const [trackMap, setTrackMap] = useState<TrackMap | null>(null);
  const [carNames, setCarNames] = useState<Record<string, string>>({});
  const [serverName, setServerName] = useState('');
  const [tick, setTick] = useState(0);
  const [picker, setPicker] = useState<LivePickerServer[]>([]);
  const lastDataRef = useRef(Date.now());
  const rootRef = useRef<HTMLDivElement>(null);

  // Server picker list (all public AC servers)
  useEffect(() => {
    let dead = false;
    const load = () => api.get('/public/servers')
      .then((r) => { if (!dead) setPicker((r.data.servers || []).filter((s: any) => s.type !== 'acc')); })
      .catch(() => {});
    load();
    const t = setInterval(load, 20000);
    return () => { dead = true; clearInterval(t); };
  }, []);

  // Hub mode: auto-select a live server (or the first one)
  useEffect(() => {
    if (serverId || picker.length === 0) return;
    const pick = picker.find((s) => s.liveAvailable) || picker.find((s) => s.running) || picker[0];
    if (pick) nav(`/live/${pick.id}`, { replace: true });
  }, [serverId, picker]);

  // SSE with polling fallback
  useEffect(() => {
    if (!serverId) return;
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let dead = false;

    const startPoll = () => {
      if (poll || dead) return;
      poll = setInterval(async () => {
        try {
          const { data } = await api.get(`/public/live/${serverId}`);
          lastDataRef.current = Date.now();
          setSnap(data);
        } catch { /* keep polling */ }
      }, 2000);
    };

    try {
      es = new EventSource(`/api/public/live/${serverId}/stream`);
      es.addEventListener('snapshot', (e) => {
        try {
          lastDataRef.current = Date.now();
          setSnap(JSON.parse((e as MessageEvent).data));
        } catch { /* bad frame */ }
      });
      es.onerror = () => { startPoll(); };
    } catch {
      startPoll();
    }
    return () => { dead = true; es?.close(); if (poll) clearInterval(poll); };
  }, [serverId]);

  // Track map + car names
  useEffect(() => {
    if (!serverId) return;
    setSnap({ active: false });
    api.get(`/public/track-map/${serverId}`).then((r) => setTrackMap(r.data)).catch(() => setTrackMap(null));
    api.get('/public/servers').then((r) => {
      const s = (r.data.servers || []).find((x: any) => x.id === serverId);
      if (s) {
        setServerName(s.name);
        const names: Record<string, string> = {};
        for (const c of s.carsMeta || []) names[c.id] = c.name;
        setCarNames(names);
      } else {
        setServerName('');
        setCarNames({});
      }
    }).catch(() => {});
  }, [serverId, snap.session?.track]);

  // 1s ticker for countdown + staleness
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const s = snap.session;
  const stale = Date.now() - lastDataRef.current > 10000;
  const remaining = useMemo(() => {
    if (snap.sessionTimeRemainingMs == null) return null;
    return snap.sessionTimeRemainingMs - (Date.now() - lastDataRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.sessionTimeRemainingMs, tick]);
  const towerRight = hud ? 'right-0' : 'right-[23rem]';

  return (
    <div ref={rootRef} className="h-screen bg-[#05060a] text-foreground relative overflow-hidden">

      {/* ============ MAP ============ */}
      {trackMap
        ? <div className="absolute inset-0"><TrackMapCanvas snap={snap} trackMap={trackMap} /></div>
        : <div className={`absolute inset-0 ${hud ? '' : 'pr-[23rem]'} grid place-items-center px-6`}>
            <div className="hero-band absolute inset-0 opacity-30" />
            <div className="relative text-muted text-sm">No track map available</div>
          </div>}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(120% 120% at 45% 50%, transparent 55%, rgba(0,0,0,0.5) 100%)' }} />

      {/* ============ TOP STRIP ============ */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center gap-2 h-12 px-3 bg-card/80 backdrop-blur-md border-b border-border/60">
        <Link to="/" className="text-muted hover:text-foreground shrink-0" title="Back to site"><Gauge size={15} className="text-primary" /></Link>
        {!hud && picker.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto min-w-0">
            {picker.map((sv) => (
              <button key={sv.id} onClick={() => nav(`/live/${sv.id}`)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-colors ${
                  sv.id === serverId ? 'bg-red-500/15 text-foreground font-medium ring-1 ring-red-500/50' : 'text-muted hover:text-foreground hover:bg-accent/60'
                }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${sv.liveAvailable ? 'bg-red-500 animate-pulse' : sv.running ? 'bg-green-500' : 'bg-muted'}`} />
                {sv.name}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-3 shrink-0">
          {stale || !snap.active
            ? <span className="w-2 h-2 rounded-full bg-amber-400" title="waiting for data" />
            : <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title="LIVE" />}
          <span className="font-semibold text-sm truncate max-w-[12rem] hidden sm:inline">{s?.serverName || serverName || 'Live timing'}</span>
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
          <button onClick={() => rootRef.current?.requestFullscreen?.().catch(() => {})} className="text-muted hover:text-foreground" title="Fullscreen"><Maximize size={14} /></button>
        </div>
      </div>

      {/* ============ RIGHT TOWER ============ */}
      {!hud && (
        <div className="absolute top-12 right-0 bottom-0 w-[23rem] z-10 flex flex-col bg-card/80 backdrop-blur-md border-l border-border/60">
          <div className="eyebrow px-3 py-2 border-b border-border/60 flex items-center justify-between">
            <span>Timing</span>
            <span className="text-muted normal-case tracking-normal">{(snap.cars || []).filter((c) => c.connected).length} cars</span>
          </div>
          <LiveView snap={snap} trackMap={null} carNames={carNames} towerOnly />
          <div className="border-t border-border/60 shrink-0">
            <div className="eyebrow px-3 py-1.5">Events</div>
            <div className="h-28 overflow-auto px-1 pb-1">
              {(snap.events || []).slice(0, 10).map((e, i) => (
                <div key={i} className="flex gap-2 text-xs px-2 py-0.5">
                  <span className="text-muted shrink-0">{e.type === 'chat' ? <MessageSquare size={10} className="inline" /> : e.type === 'lap' ? <Flag size={10} className="inline" /> : '·'}</span>
                  <span className="truncate">{e.text}</span>
                </div>
              ))}
              {(snap.events || []).length === 0 && <div className="text-xs text-muted px-2">No events yet.</div>}
            </div>
          </div>
        </div>
      )}

      {/* waiting pill — over map area only */}
      {(!snap.active || (stale && !(snap.cars || []).length)) && (
        <div className={`absolute top-16 left-0 ${towerRight} z-10 flex justify-center pointer-events-none`}>
          <div className="px-4 py-1.5 text-xs text-amber-300 bg-amber-950/70 border border-amber-900/60 rounded-full backdrop-blur flex items-center gap-2">
            <Radio size={12} /> Waiting for live data from the server…
          </div>
        </div>
      )}
    </div>
  );
}
