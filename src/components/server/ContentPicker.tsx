import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { Button, Input, Badge } from '../ui';
import { Search, X, Check, Car, MapPin, ChevronLeft, Loader2, CornerDownRight } from 'lucide-react';

export type PickerOption = {
  value: string;
  name: string;
  sub?: string;   // brand / country
  tag?: string;   // dlc / group badge
  image?: string;
  layouts?: { value: string; name: string; image?: string }[];
  skins?: { value: string; name: string; image?: string }[];
};

// Fetches /servers/:id/available-content once per server. AC-family returns
// scanned installed content; ACC returns the built-in track/car lists.
export function useAvailableContent(serverId: string | undefined) {
  const [data, setData] = useState<{ cars: PickerOption[]; tracks: PickerOption[] }>({ cars: [], tracks: [] });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!serverId) return;
    let dead = false;
    setLoading(true);
    api.get(`/servers/${serverId}/available-content`)
      .then((r) => { if (!dead) setData({ cars: r.data.cars || [], tracks: r.data.tracks || [] }); })
      .catch(() => {})
      .finally(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, [serverId]);
  return { ...data, loading };
}

const STRIPES = 'repeating-linear-gradient(135deg,#12151c 0 10px,#0d1017 10px 20px)';

function OptionCard({ opt, kind, selected, onClick }: { opt: PickerOption; kind: 'car' | 'track'; selected: boolean; onClick: () => void }) {
  const Icon = kind === 'car' ? Car : MapPin;
  return (
    <button type="button" onClick={onClick}
      className={`relative text-left rounded-lg border overflow-hidden transition-colors group ${
        selected ? 'border-primary ring-1 ring-primary bg-primary/5' : 'border-border bg-card-2 hover:border-border-strong'}`}>
      <div className="relative aspect-[16/8] overflow-hidden" style={{ background: STRIPES }}>
        {opt.image && <img src={opt.image} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
        {!opt.image && <Icon size={22} className="absolute inset-0 m-auto text-muted/40" />}
        {selected && (
          <span className="absolute top-1.5 right-1.5 grid place-items-center w-5 h-5 rounded-full bg-primary text-white"><Check size={12} /></span>
        )}
        {opt.tag && <span className="absolute top-1.5 left-1.5"><Badge tone="brand">{opt.tag}</Badge></span>}
        {opt.layouts && opt.layouts.length > 0 && (
          <span className="absolute bottom-1.5 right-1.5 text-[10px] px-1.5 py-0.5 rounded bg-black/70 text-white/80">{opt.layouts.length + 1} layouts</span>
        )}
      </div>
      <div className="px-2.5 py-2">
        <div className="text-xs font-medium truncate">{opt.name}</div>
        <div className="text-[10px] font-mono text-muted truncate">{opt.sub ? `${opt.sub} · ` : ''}{opt.value}</div>
      </div>
    </button>
  );
}

// Modal picker: search + image grid. Single-select returns {value, layout?};
// multi-select returns string[]. A "custom" row lets you type any id.
export function ContentPickerModal({ open, onClose, title, kind = 'car', options, multi = false, selected = [], onApply, loading }: {
  open: boolean;
  onClose: () => void;
  title: string;
  kind?: 'car' | 'track';
  options: PickerOption[];
  multi?: boolean;
  selected?: string[];
  onApply: (v: any) => void;
  loading?: boolean;
}) {
  const [q, setQ] = useState('');
  const [stage, setStage] = useState<string[]>([]);
  const [layoutFor, setLayoutFor] = useState<PickerOption | null>(null);
  const [custom, setCustom] = useState('');

  useEffect(() => {
    if (open) { setQ(''); setStage(multi ? [...selected] : []); setLayoutFor(null); setCustom(''); }
  }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) => [o.name, o.value, o.sub, o.tag].filter(Boolean).join(' ').toLowerCase().includes(s));
  }, [q, options]);

  if (!open) return null;

  const clickSingle = (opt: PickerOption) => {
    if (kind === 'track' && opt.layouts && opt.layouts.length > 0) setLayoutFor(opt);
    else { onApply({ value: opt.value, layout: '' }); onClose(); }
  };
  const toggleMulti = (v: string) => setStage((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));
  const applyCustom = () => {
    const v = custom.trim();
    if (!v) return;
    if (multi) { if (!stage.includes(v)) setStage((s) => [...s, v]); setCustom(''); }
    else { onApply({ value: v, layout: '' }); onClose(); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            {layoutFor && (
              <button type="button" onClick={() => setLayoutFor(null)} className="p-1 -ml-1 rounded text-muted hover:text-foreground"><ChevronLeft size={16} /></button>
            )}
            <div className="truncate">
              <div className="text-sm font-semibold">{layoutFor ? `${layoutFor.name} — choose layout` : title}</div>
              <div className="text-[11px] text-muted">{layoutFor ? `${layoutFor.layouts!.length} layout(s)` : `${filtered.length} of ${options.length}`}</div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded text-muted hover:text-foreground hover:bg-card-2"><X size={16} /></button>
        </div>

        {layoutFor ? (
          <div className="p-4 overflow-auto">
            <div className="space-y-1.5">
              <button type="button" onClick={() => { onApply({ value: layoutFor.value, layout: '' }); onClose(); }}
                className="w-full flex items-center gap-3 rounded-lg border border-border bg-card-2 px-3 py-2.5 text-left hover:border-border-strong">
                <MapPin size={15} className="text-muted" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium">Default layout</div>
                  <div className="text-[10px] font-mono text-muted">{layoutFor.value}</div>
                </div>
              </button>
              {layoutFor.layouts!.map((l) => (
                <button key={l.value} type="button" onClick={() => { onApply({ value: layoutFor.value, layout: l.value }); onClose(); }}
                  className="w-full flex items-center gap-3 rounded-lg border border-border bg-card-2 px-3 py-2.5 text-left hover:border-border-strong">
                  <CornerDownRight size={15} className="text-muted" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{l.name}</div>
                    <div className="text-[10px] font-mono text-muted">{l.value}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-border">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${kind === 'car' ? 'cars' : 'tracks'}…`} className="pl-8" />
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-muted text-sm"><Loader2 size={16} className="animate-spin" />Scanning content…</div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted">
                  {options.length === 0 ? 'No installed content detected — use the custom entry below.' : 'Nothing matches your search.'}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {filtered.map((o) => (
                    <OptionCard key={o.value} opt={o} kind={kind}
                      selected={multi ? stage.includes(o.value) : selected.includes(o.value)}
                      onClick={() => (multi ? toggleMulti(o.value) : clickSingle(o))} />
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 px-4 py-3 border-t border-border">
              <Input mono value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyCustom()}
                placeholder={`Custom ${kind} id (not in list)`} className="flex-1" />
              <Button variant="secondary" size="sm" type="button" onClick={applyCustom} disabled={!custom.trim()}>{multi ? 'Add' : 'Use'}</Button>
              {multi && (
                <>
                  <span className="text-xs text-muted whitespace-nowrap ml-2">{stage.length} selected</span>
                  <Button size="sm" type="button" onClick={() => { onApply(stage); onClose(); }}>Done</Button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Field-style button that opens the picker — shows current selection.
export function PickerButton({ label, mono, disabled, onClick, icon }: { label: string; mono?: string; disabled?: boolean; onClick: () => void; icon?: React.ReactNode }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className="w-full flex items-center justify-between gap-2 h-9 px-3 rounded-md border border-border bg-card-2 text-sm text-left hover:border-border-strong transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
      <span className="truncate">
        {label}
        {mono && <span className="ml-2 font-mono text-[11px] text-muted">{mono}</span>}
      </span>
      <span className="text-muted shrink-0">{icon || <Search size={13} />}</span>
    </button>
  );
}
