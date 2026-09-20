import React, { useEffect, useRef } from 'react';
import { Flag, MessageSquare, AlertTriangle, LogIn, LogOut, Shield, ChevronUp, ChevronDown } from 'lucide-react';

// Reusable spectator view: track map canvas + leaderboard + event ticker.
// Used by the public /public/live/:id page and the admin Live tab.

export interface LiveCar {
  carId: number; position?: number; driverName?: string | null; model?: string | null; skin?: string | null;
  connected: boolean; loaded?: boolean; laps: number; bestLapMs?: number | null; lastLapMs?: number | null;
  totalTimeMs?: number | null; speedKmh: number; gear: number; rpm?: number; splinePos: number;
  pos: { x: number; y: number; z: number }; gapToLeader?: string;
  lapHistory?: { ms: number; cuts: number; at: string }[];
}
export interface LiveSnapshot {
  active: boolean;
  session?: {
    name?: string; typeName?: string; timeMinutes?: number; laps?: number;
    ambientTemp?: number; roadTemp?: number; weather?: string;
    track?: string; trackConfig?: string; serverName?: string;
  } | null;
  cars?: LiveCar[];
  events?: { type: string; at: string; text: string; carId?: number }[];
  connectedCount?: number;
  sessionTimeRemainingMs?: number | null;
  lastPacketAt?: string | null;
}
export interface TrackMap {
  image: string; track: string; layout?: string;
  params: { width: number | null; height: number | null; xOffset: number | null; zOffset: number | null; scaleFactor: number | null; margin: number | null };
}

export function carColor(carId: number) {
  return `hsl(${(carId * 47) % 360}, 85%, 60%)`;
}

export function fmtMs(ms?: number | null) {
  if (ms == null) return '—';
  const neg = ms < 0;
  const a = Math.abs(ms);
  const m = Math.floor(a / 60000);
  const s = Math.floor((a % 60000) / 1000);
  return `${neg ? '-' : ''}${m}:${String(s).padStart(2, '0')}.${String(a % 1000).padStart(3, '0')}`;
}

export function fmtClock(ms?: number | null) {
  if (ms == null) return '—';
  const a = Math.max(0, ms);
  const m = Math.floor(a / 60000);
  const s = Math.floor((a % 60000) / 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function TrackMapCanvas({ snap, trackMap, selectedId }: { snap: LiveSnapshot; trackMap: TrackMap; selectedId?: number | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const interpRef = useRef<Map<number, { x: number; z: number }>>(new Map());
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const selRef = useRef(selectedId);
  selRef.current = selectedId;

  useEffect(() => {
    const img = new Image();
    img.src = trackMap.image;
    img.onload = () => { imgRef.current = img; };
    img.onerror = () => { imgRef.current = null; };
  }, [trackMap.image]);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const W = canvas.clientWidth, H = canvas.clientHeight;
      if (canvas.width !== W * devicePixelRatio) { canvas.width = W * devicePixelRatio; canvas.height = H * devicePixelRatio; }
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const p = trackMap.params;
      const iw = imgRef.current?.naturalWidth || p.width || 0;
      const ih = imgRef.current?.naturalHeight || p.height || 0;
      if (!iw || !ih) {
        ctx.fillStyle = '#888';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No track map available', W / 2, H / 2);
        return;
      }
      const scale = Math.min(W / iw, H / ih);
      const ox = (W - iw * scale) / 2;
      const oy = (H - ih * scale) / 2;
      if (imgRef.current) ctx.drawImage(imgRef.current, ox, oy, iw * scale, ih * scale);

      const toPx = (wx: number, wz: number) => ({
        x: ox + ((wx + (p.xOffset || 0)) / (p.scaleFactor || 1)) * scale,
        y: oy + ((wz + (p.zOffset || 0)) / (p.scaleFactor || 1)) * scale,
      });

      const cars = (snapRef.current.cars || []).filter((c) => c.connected);
      const now = performance.now();
      cars.forEach((c, i) => {
        const target = toPx(c.pos.x, c.pos.z);
        let cur = interpRef.current.get(c.carId);
        if (!cur) { cur = { x: target.x, z: target.y }; interpRef.current.set(c.carId, cur); }
        // Lerp toward the latest snapshot position (~250ms smoothing)
        const k = 0.15;
        cur.x += (target.x - cur.x) * k;
        cur.z += (target.y - cur.z) * k;
        const leader = (c.position ?? i + 1) === 1;
        const isSel = selRef.current === c.carId;
        if (isSel) {
          // selected driver — pulsing outer ring
          const pulse = 9.5 + Math.sin(performance.now() / 220) * 1.5;
          ctx.beginPath();
          ctx.arc(cur.x, cur.z, pulse, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(cur.x, cur.z, leader || isSel ? 7 : 5.5, 0, Math.PI * 2);
        ctx.fillStyle = carColor(c.carId);
        ctx.fill();
        ctx.lineWidth = leader || isSel ? 2.5 : 1.5;
        ctx.strokeStyle = leader || isSel ? '#fff' : 'rgba(0,0,0,0.6)';
        ctx.stroke();
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.fillText(String(c.position ?? i + 1), cur.x, cur.z + 3.5);
        if (c.driverName) {
          ctx.font = '10px sans-serif';
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = 'rgba(0,0,0,0.8)';
          ctx.lineWidth = 3;
          ctx.strokeText(c.driverName, cur.x, cur.z - 10);
          ctx.fillText(c.driverName, cur.x, cur.z - 10);
        }
      });
      void now;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [trackMap]);

  return <canvas ref={canvasRef} className="w-full h-full block" />;
}

// Color-coded icon per event type, like race-control feeds.
export function EventIcon({ type }: { type: string }) {
  const cls = 'inline shrink-0';
  switch (type) {
    case 'chat': return <MessageSquare size={10} className={`${cls} text-sky-300`} />;
    case 'lap': return <Flag size={10} className={`${cls} text-emerald-400`} />;
    case 'collision': return <AlertTriangle size={10} className={`${cls} text-red-400`} />;
    case 'connect': case 'join': return <LogIn size={10} className={`${cls} text-emerald-400`} />;
    case 'disconnect': case 'leave': return <LogOut size={10} className={`${cls} text-amber-400`} />;
    case 'admin': return <Shield size={10} className={`${cls} text-red-300`} />;
    default: return <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted/60 align-middle" />;
  }
}

export function LiveEvents({ events, heightClass = 'h-36', bare }: { events: { type: string; at: string; text: string; carId?: number }[]; heightClass?: string; bare?: boolean }) {
  const body = (
    <>
      {events.slice(0, 10).map((e, i) => (
        <div key={i} className="flex items-center gap-2 text-xs px-2 py-0.5">
          <EventIcon type={e.type} />
          <span className="text-muted/70 font-mono text-[10px] shrink-0">{e.at ? new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
          <span className="truncate">{e.text}</span>
        </div>
      ))}
      {events.length === 0 && <div className="text-xs text-muted px-2">No events yet.</div>}
    </>
  );
  if (bare) return <div className={`overflow-auto ${heightClass}`}>{body}</div>;
  return (
    <div className={`bg-card border border-border rounded-lg p-2 overflow-auto ${heightClass}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted mb-1 px-1">Events</div>
      {body}
    </div>
  );
}

// Tracks position changes between polls → ▲/▼ shown briefly next to P.
function usePosMoves(cars: LiveCar[]) {
  const prevRef = useRef<Map<number, number>>(new Map());
  const movesRef = useRef<Map<number, { dir: 'up' | 'down'; at: number }>>(new Map());
  const next = new Map<number, number>();
  const now = Date.now();
  for (const c of cars) {
    if (c.position == null) continue;
    next.set(c.carId, c.position);
    const prev = prevRef.current.get(c.carId);
    if (prev != null && prev !== c.position) {
      movesRef.current.set(c.carId, { dir: c.position < prev ? 'up' : 'down', at: now });
    }
  }
  prevRef.current = next;
  return movesRef.current;
}

// Shared timing table — P / driver / car / laps / best / last / gap / speed.
// Broadcast conventions: driver color stripe on the left edge, purple = session
// best lap, green = personal best, ▲▼ = recent position change.
export function TimingTable({ cars, carNames, selectedId, onSelect, onKick, pad = 'px-3' }: {
  cars: LiveCar[];
  carNames?: Record<string, string>;
  selectedId?: number | null;
  onSelect?: (carId: number) => void;
  onKick?: (carId: number) => void;
  pad?: string;
}) {
  const moves = usePosMoves(cars);
  const now = Date.now();
  const sessionBest = cars.reduce((m, c) => (c.bestLapMs != null && c.bestLapMs < m ? c.bestLapMs : m), Infinity);
  const lapClass = (c: LiveCar) => {
    if (c.lastLapMs == null) return '';
    if (c.lastLapMs === sessionBest) return 'text-purple-400';
    if (c.lastLapMs === c.bestLapMs) return 'text-green-400';
    return '';
  };
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-card/95 backdrop-blur z-10">
        <tr className="text-left text-muted border-b border-border">
          <th className={`${pad} py-2 w-10`}>P</th>
          <th className="px-2 py-2">Driver</th>
          <th className="px-2 py-2">Car</th>
          <th className="px-2 py-2 text-right">Laps</th>
          <th className="px-2 py-2 text-right">Best</th>
          <th className="px-2 py-2 text-right">Last</th>
          <th className="px-2 py-2 text-right">Gap</th>
          <th className={`${pad} py-2 text-right`}>km/h</th>
          {onKick && <th className="px-2 py-2" />}
        </tr>
      </thead>
      <tbody>
        {cars.map((c) => {
          const mv = moves.get(c.carId);
          const fresh = mv && now - mv.at < 8000;
          return (
            <tr key={c.carId}
              onClick={onSelect ? () => onSelect(c.carId) : undefined}
              className={`border-b border-border/40 ${onSelect ? 'cursor-pointer' : ''} transition-colors ${selectedId === c.carId ? 'bg-primary/15' : onSelect ? 'hover:bg-accent/50' : ''} ${!c.connected ? 'opacity-40' : ''}`}>
              <td className={`${pad} py-1.5 font-bold`} style={{ boxShadow: `inset 3px 0 0 ${carColor(c.carId)}` }}>
                <span className="inline-flex items-center gap-0.5">
                  {c.position ?? '—'}
                  {fresh && (mv!.dir === 'up'
                    ? <ChevronUp size={11} className="text-emerald-400" />
                    : <ChevronDown size={11} className="text-red-400" />)}
                </span>
              </td>
              <td className="px-2 py-1.5 truncate max-w-[8rem]">{c.driverName || `Car ${c.carId}`}</td>
              <td className="px-2 py-1.5 text-muted truncate max-w-[6rem]" title={c.model || ''}>{(c.model && carNames?.[c.model]) || c.model || '—'}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{c.laps}</td>
              <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${c.bestLapMs != null && c.bestLapMs === sessionBest ? 'text-purple-400 font-semibold' : ''}`}>{fmtMs(c.bestLapMs)}</td>
              <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${lapClass(c)}`}>{fmtMs(c.lastLapMs)}</td>
              <td className="px-2 py-1.5 text-right text-muted font-mono">{c.gapToLeader || ''}</td>
              <td className={`${pad} py-1.5 text-right tabular-nums`}>{Math.round(c.speedKmh)}</td>
              {onKick && (
                <td className="px-2 py-1.5">
                  <button onClick={(e) => { e.stopPropagation(); onKick(c.carId); }} className="text-red-400 hover:text-red-300 text-[10px]">kick</button>
                </td>
              )}
            </tr>
          );
        })}
        {cars.length === 0 && (
          <tr><td colSpan={9} className="px-3 py-8 text-center text-muted">No cars on track</td></tr>
        )}
      </tbody>
    </table>
  );
}

export default function LiveView({ snap, trackMap, carNames, onKick, compact, towerOnly, selectedId, onSelect }: {
  snap: LiveSnapshot;
  trackMap?: TrackMap | null;
  carNames?: Record<string, string>;
  onKick?: (carId: number) => void;
  compact?: boolean;
  towerOnly?: boolean; // render just the timing table (used inside a floating panel)
  selectedId?: number | null;
  onSelect?: (carId: number) => void;
}) {
  const cars = snap.cars || [];
  const events = snap.events || [];

  if (towerOnly) {
    return (
      <div className="overflow-auto flex-1 min-h-0">
        <TimingTable cars={cars} carNames={carNames} selectedId={selectedId} onSelect={onSelect} />
      </div>
    );
  }

  if (compact) {
    return (
      <div className="h-full min-h-0 bg-black/40 rounded-lg overflow-hidden border border-border">
        {trackMap
          ? <TrackMapCanvas snap={snap} trackMap={trackMap} />
          : <div className="h-full grid place-items-center text-muted text-sm">No track map available</div>}
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-full min-h-0">
      <div className="flex-1 min-w-0 bg-black/40 rounded-lg overflow-hidden border border-border relative">
        {trackMap
          ? <TrackMapCanvas snap={snap} trackMap={trackMap} />
          : <div className="h-full grid place-items-center text-muted text-sm">No track map available</div>}
      </div>

      <div className="w-[26rem] shrink-0 flex flex-col gap-3 min-h-0">
        <div className="bg-card border border-border rounded-lg overflow-auto flex-1 min-h-0">
          <TimingTable cars={cars} carNames={carNames} selectedId={selectedId} onSelect={onSelect} onKick={onKick} />
        </div>

        <LiveEvents events={events} />
      </div>
    </div>
  );
}
