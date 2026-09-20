import React, { useEffect, useRef } from 'react';
import { Flag, MessageSquare } from 'lucide-react';

// Reusable spectator view: track map canvas + leaderboard + event ticker.
// Used by the public /public/live/:id page and the admin Live tab.

export interface LiveCar {
  carId: number; position?: number; driverName?: string | null; model?: string | null; skin?: string | null;
  connected: boolean; loaded?: boolean; laps: number; bestLapMs?: number | null; lastLapMs?: number | null;
  totalTimeMs?: number | null; speedKmh: number; gear: number; splinePos: number;
  pos: { x: number; y: number; z: number }; gapToLeader?: string;
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

function TrackMapCanvas({ snap, trackMap }: { snap: LiveSnapshot; trackMap: TrackMap }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const interpRef = useRef<Map<number, { x: number; z: number }>>(new Map());
  const snapRef = useRef(snap);
  snapRef.current = snap;

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
        ctx.beginPath();
        ctx.arc(cur.x, cur.z, leader ? 7 : 5.5, 0, Math.PI * 2);
        ctx.fillStyle = carColor(c.carId);
        ctx.fill();
        ctx.lineWidth = leader ? 2.5 : 1.5;
        ctx.strokeStyle = leader ? '#fff' : 'rgba(0,0,0,0.6)';
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

export default function LiveView({ snap, trackMap, carNames, onKick, compact }: {
  snap: LiveSnapshot;
  trackMap?: TrackMap | null;
  carNames?: Record<string, string>;
  onKick?: (carId: number) => void;
  compact?: boolean;
}) {
  const cars = snap.cars || [];
  const events = snap.events || [];

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
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="text-left text-muted border-b border-border">
                <th className="px-2 py-1.5 w-8">P</th>
                <th className="px-2 py-1.5">Driver</th>
                <th className="px-2 py-1.5">Car</th>
                <th className="px-2 py-1.5 text-right">Laps</th>
                <th className="px-2 py-1.5 text-right">Best</th>
                <th className="px-2 py-1.5 text-right">Last</th>
                <th className="px-2 py-1.5 text-right">Gap</th>
                <th className="px-2 py-1.5 text-right">km/h</th>
                <th className="px-2 py-1.5 text-right">Gear</th>
                {onKick && <th className="px-2 py-1.5" />}
              </tr>
            </thead>
            <tbody>
              {cars.map((c) => (
                <tr key={c.carId} className={`border-b border-border/50 ${!c.connected ? 'opacity-40' : ''}`}>
                  <td className="px-2 py-1.5 font-bold" style={{ color: carColor(c.carId) }}>{c.position}</td>
                  <td className="px-2 py-1.5 truncate max-w-[8rem]">{c.driverName || `Car ${c.carId}`}</td>
                  <td className="px-2 py-1.5 text-muted truncate max-w-[7rem]" title={c.model || ''}>{(c.model && carNames?.[c.model]) || c.model || '—'}</td>
                  <td className="px-2 py-1.5 text-right">{c.laps}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmtMs(c.bestLapMs)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmtMs(c.lastLapMs)}</td>
                  <td className="px-2 py-1.5 text-right text-muted">{c.gapToLeader || ''}</td>
                  <td className="px-2 py-1.5 text-right">{Math.round(c.speedKmh)}</td>
                  <td className="px-2 py-1.5 text-right">{c.gear}</td>
                  {onKick && (
                    <td className="px-2 py-1.5">
                      <button onClick={() => onKick(c.carId)} className="text-red-400 hover:text-red-300 text-[10px]">kick</button>
                    </td>
                  )}
                </tr>
              ))}
              {cars.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-muted">No cars on track</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-card border border-border rounded-lg p-2 h-36 overflow-auto">
          <div className="text-[10px] uppercase tracking-wide text-muted mb-1 px-1">Events</div>
          {events.slice(0, 8).map((e, i) => (
            <div key={i} className="flex gap-2 text-xs px-1 py-0.5">
              <span className="text-muted shrink-0">{e.type === 'chat' ? <MessageSquare size={10} className="inline" /> : e.type === 'lap' ? <Flag size={10} className="inline" /> : '·'}</span>
              <span className="truncate">{e.text}</span>
            </div>
          ))}
          {events.length === 0 && <div className="text-xs text-muted px-1">No events yet.</div>}
        </div>
      </div>
    </div>
  );
}
