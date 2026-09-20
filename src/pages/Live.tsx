import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { api } from '../api';
import LiveView, { TrackMapCanvas, LiveEvents, LiveSnapshot, TrackMap, fmtClock } from '../components/live/LiveView';
import { Maximize, Radio, Gauge, Users, Thermometer, CloudRain, Flag } from 'lucide-react';

// Public spectator page — broadcast-style: track map fills the screen,
// glass panels float over it. /live (no id) is a hub that auto-selects a
// live server; ?hud=1 strips the sidebar for OBS overlays.
// Data: SSE stream with a polling fallback.

const glass = 'bg-card/75 backdrop-blur-md border border-border/70 rounded-xl shadow-2xl';

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

  return (
    <div ref={rootRef} className="h-screen bg-[#05060a] text-foreground relative overflow-hidden">
      {/* Track map fills the screen */}
      {trackMap
        ? <div className="absolute inset-0"><TrackMapCanvas snap={snap} trackMap={trackMap} /></div>
        : <div className="absolute inset-0 hero-band opacity-40" />}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(120% 120% at 50% 50%, transparent 55%, rgba(0,0,0,0.5) 100%)' }} />

      {/* ---- Top bar ---- */}
      <div className="absolute top-0 inset-x-0 z-10 p-3 flex items-start gap-3 pointer-events-none">
        <div className={`${glass} pointer-events-auto flex items-center gap-1.5 px-2.5 py-2 max-w-[60%]`}>
          <Link to="/" className="text-muted hover:text-foreground px-1" title="Back to site"><Gauge size={15} className="text-primary" /></Link>
          {!hud && picker.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto">
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
        </div>

        {/* Session pill */}
        <div className={`${glass} pointer-events-auto ml-auto flex items-center gap-3 px-3.5 py-2`}>
          {stale || !snap.active
            ? <span className="w-2 h-2 rounded-full bg-amber-400" title="waiting for data" />
            : <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title="LIVE" />}
          <span className="font-semibold text-sm truncate max-w-[14rem]">{s?.serverName || serverName || 'Live timing'}</span>
          {s && (
            <>
              <span className="w-px h-4 bg-border" />
              <span className="text-xs text-muted">{s.typeName || s.name}</span>
              <span className="text-sm font-mono tabular-nums font-semibold">{remaining != null ? fmtClock(remaining) : (s.laps ? `${s.laps}L` : '')}</span>
              <span className="text-xs text-muted hidden md:flex items-center gap-1"><Flag size={11} />{s.track}{s.trackConfig ? `/${s.trackConfig}` : ''}</span>
              <span className="text-xs text-muted hidden lg:flex items-center gap-1"><Thermometer size={11} />{s.ambientTemp}°/{s.roadTemp}°</span>
              {s.weather && <span className="text-xs text-muted hidden lg:flex items-center gap-1"><CloudRain size={11} />{s.weather}</span>}
              <span className="text-xs text-muted flex items-center gap-1"><Users size={11} />{snap.connectedCount ?? 0}</span>
            </>
          )}
          <button onClick={() => rootRef.current?.requestFullscreen?.().catch(() => {})} className="text-muted hover:text-foreground" title="Fullscreen">
            <Maximize size={14} />
          </button>
        </div>
      </div>

      {/* Waiting banner */}
      {(!snap.active || (stale && !(snap.cars || []).length)) && (
        <div className={`absolute top-16 inset-x-0 z-10 flex justify-center pointer-events-none ${hud ? '' : 'pr-[26rem]'}`}>
          <div className="px-4 py-2 text-xs text-amber-300 bg-amber-950/70 border border-amber-900/60 rounded-full backdrop-blur flex items-center gap-2 pointer-events-auto">
            <Radio size={12} /> Waiting for live data from the server…
          </div>
        </div>
      )}

      {/* ---- Right column: timing tower + events ---- */}
      {!hud && (
        <div className="absolute top-[4.5rem] right-3 bottom-3 w-[24rem] z-10 flex flex-col gap-2.5 pointer-events-none">
          <div className={`${glass} pointer-events-auto flex-1 min-h-0 overflow-hidden flex flex-col`}>
            <LiveView snap={snap} trackMap={null} carNames={carNames} towerOnly />
          </div>
          <div className="pointer-events-auto shrink-0">
            <LiveEvents events={snap.events || []} heightClass="h-32" />
          </div>
        </div>
      )}

      {/* No map fallback message */}
      {!trackMap && (
        <div className={`absolute inset-0 grid place-items-center pointer-events-none ${hud ? '' : 'pr-[26rem]'}`}>
          <div className="text-muted text-sm">No track map available</div>
        </div>
      )}
    </div>
  );
}
