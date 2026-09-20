import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import LiveView, { LiveSnapshot, TrackMap, fmtClock } from '../components/live/LiveView';
import { Maximize, Radio } from 'lucide-react';

// Public spectator page — dark, full-bleed, built for a second monitor.
// Data: SSE stream with a polling fallback. ?hud=1 hides the sidebar.

export default function LivePage() {
  const { serverId } = useParams();
  const [params] = useSearchParams();
  const hud = params.get('hud') === '1';
  const [snap, setSnap] = useState<LiveSnapshot>({ active: false });
  const [trackMap, setTrackMap] = useState<TrackMap | null>(null);
  const [carNames, setCarNames] = useState<Record<string, string>>({});
  const [serverName, setServerName] = useState('');
  const [tick, setTick] = useState(0);
  const lastDataRef = useRef(Date.now());

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
    api.get(`/public/track-map/${serverId}`).then((r) => setTrackMap(r.data)).catch(() => setTrackMap(null));
    api.get('/public/servers').then((r) => {
      const s = (r.data.servers || []).find((x: any) => x.id === serverId);
      if (s) {
        setServerName(s.name);
        const names: Record<string, string> = {};
        for (const c of s.carsMeta || []) names[c.id] = c.name;
        setCarNames(names);
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
    <div className="h-screen bg-[#0a0a0c] text-foreground flex flex-col overflow-hidden">
      <header className="flex items-center gap-4 px-4 py-2.5 border-b border-border bg-card/60 shrink-0">
        <div className="flex items-center gap-2">
          {stale || !snap.active
            ? <span className="w-2.5 h-2.5 rounded-full bg-amber-400" title="waiting for data" />
            : <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" title="LIVE" />}
          <span className="font-semibold text-sm">{s?.serverName || serverName || 'Live timing'}</span>
        </div>
        {s && (
          <>
            <span className="text-xs text-muted">{s.name} · {s.typeName}</span>
            <span className="text-xs font-mono">
              {remaining != null ? fmtClock(remaining) : (s.laps ? `${s.laps} laps` : '')}
            </span>
            <span className="text-xs text-muted">{(s.track || '') + (s.trackConfig ? `/${s.trackConfig}` : '')}</span>
            <span className="text-xs text-muted">{s.ambientTemp}°C air · {s.roadTemp}°C road · {s.weather}</span>
          </>
        )}
        <span className="text-xs text-muted ml-auto">{snap.connectedCount ?? 0} connected</span>
        <button
          onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
          className="text-muted hover:text-foreground" title="Fullscreen"
        >
          <Maximize size={15} />
        </button>
      </header>

      {(!snap.active || (stale && !(snap.cars || []).length)) && (
        <div className="px-4 py-2 text-xs text-amber-300 bg-amber-900/20 border-b border-amber-900/40 flex items-center gap-2">
          <Radio size={12} /> Waiting for live data from the server…
        </div>
      )}

      <main className="flex-1 min-h-0 p-4">
        {hud ? (
          <LiveView snap={snap} trackMap={trackMap} carNames={carNames} compact />
        ) : (
          <LiveView snap={snap} trackMap={trackMap} carNames={carNames} />
        )}
      </main>
    </div>
  );
}
