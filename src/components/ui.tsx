import React, { createContext, useCallback, useContext, useState, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/* ---------- Card ---------- */
export function Card({ title, subtitle, children, actions, className, padded = true }: {
  title?: string; subtitle?: string; children: ReactNode; actions?: ReactNode; className?: string; padded?: boolean;
}) {
  return (
    <div className={clsx('bg-card border border-border rounded-xl shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_10px_30px_-12px_rgba(0,0,0,0.6)]', padded && 'p-5', className)}>
      {(title || actions) && (
        <div className={clsx('flex items-center justify-between gap-3', padded ? 'mb-4 pb-3 -mx-5 px-5 border-b border-border' : 'mb-4 pb-3 px-5 pt-4 border-b border-border')}>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm font-display">{title}</h3>
            {subtitle && <div className="eyebrow mt-0.5">{subtitle}</div>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

/* ---------- Button ---------- */
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline';
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
}
export function Button({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...props }: BtnProps) {
  const styles = {
    primary: 'bg-brand text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset] hover:brightness-110',
    secondary: 'bg-card-2 border border-border text-foreground hover:border-border-strong',
    ghost: 'text-muted hover:text-foreground hover:bg-accent',
    danger: 'border border-danger/60 text-danger hover:bg-danger hover:text-white',
    success: 'border border-success/60 text-success hover:bg-success hover:text-white',
    outline: 'border border-border-strong text-foreground hover:bg-accent',
  } as const;
  return (
    <button
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed',
        size === 'md' ? 'h-9 px-3.5 text-sm' : 'h-[30px] px-2.5 text-xs',
        styles[variant], FOCUS, className
      )}
      {...props}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

/* ---------- Inputs ---------- */
const inputCls = 'w-full h-9 bg-card border border-border rounded-lg px-3 text-sm text-foreground placeholder:text-muted/60 hover:border-border-strong disabled:opacity-50 transition-colors duration-150 ' + FOCUS;
export function Input({ mono, ...props }: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  return <input {...props} className={clsx(inputCls, mono && 'font-mono tabular-nums', props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx(inputCls, 'appearance-none pr-8 bg-no-repeat', props.className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238593a6' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", backgroundPosition: 'right 10px center', ...props.style }} />;
}
export function Textarea({ mono, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }) {
  return <textarea {...props} className={clsx(inputCls, 'h-auto min-h-[80px] py-2 resize-y', mono && 'font-mono tabular-nums', props.className)} />;
}

/* ---------- Field ---------- */
export function Field({ label, children, hint, error, className }: { label: string; children: ReactNode; hint?: string; error?: string; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      <span className="block text-xs font-medium text-muted mb-1.5">{label}</span>
      {children}
      {error && <span className="block text-xs text-danger mt-1">{error}</span>}
      {hint && !error && <span className="block text-xs text-muted/70 mt-1">{hint}</span>}
    </label>
  );
}

/* ---------- Check (toggle switch) ---------- */
export function Check({ label, checked, onChange, hint, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string; disabled?: boolean }) {
  return (
    <label className={clsx('flex items-start gap-2.5 select-none', disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer')}>
      <button
        type="button" role="switch" aria-checked={checked} disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx('relative shrink-0 mt-0.5 w-9 h-5 rounded-full transition-colors duration-150', checked ? 'bg-brand' : 'bg-border-strong', FOCUS)}
      >
        <span className={clsx('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-150', checked && 'translate-x-4')} />
      </button>
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-muted mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}

/* ---------- Badge ---------- */
export function Badge({ children, tone = 'neutral', dot }: { children: ReactNode; tone?: 'neutral' | 'green' | 'red' | 'amber' | 'blue' | 'brand'; dot?: boolean }) {
  const tones = {
    neutral: 'bg-accent text-muted',
    green: 'bg-success/15 text-success',
    red: 'bg-danger/15 text-danger',
    amber: 'bg-warning/15 text-warning',
    blue: 'bg-info/15 text-info',
    brand: 'bg-primary/15 text-primary-hover',
  } as const;
  const dotColors = { neutral: 'bg-muted', green: 'bg-success', red: 'bg-danger', amber: 'bg-warning', blue: 'bg-info', brand: 'bg-primary' } as const;
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium', tones[tone])}>
      {dot && <span className={clsx('w-1.5 h-1.5 rounded-full', dotColors[tone])} />}
      {children}
    </span>
  );
}

/* ---------- Tabs ---------- */
export function Tabs({ tabs, items, active, value, onChange }: {
  tabs?: { id: string; label: string; icon?: ReactNode; count?: number }[];
  items?: { id: string; label: string; icon?: ReactNode; count?: number }[];
  active?: string; value?: string; onChange: (id: string) => void;
}) {
  const list = items ?? tabs ?? [];
  const cur = value ?? active ?? '';
  return (
    <div className="flex gap-1 border-b border-border mb-5 overflow-x-auto overflow-y-hidden">
      {list.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors duration-150', FOCUS,
            cur === t.id ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted hover:text-foreground'
          )}
        >
          {t.icon}
          {t.label}
          {t.count != null && <span className="text-[10px] bg-accent rounded-full px-1.5 py-0.5 text-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- PageHeader ---------- */
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="text-2xl font-bold font-display">{title}</h1>
        {description && <p className="text-sm text-muted mt-1">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------- StatTile ---------- */
export function StatTile({ label, value, sub, icon, tone = 'neutral' }: { label: string; value: ReactNode; sub?: string; icon?: ReactNode; tone?: 'neutral' | 'green' | 'red' | 'amber' | 'blue' | 'brand' }) {
  const iconTones = { neutral: 'text-muted', green: 'text-success', red: 'text-danger', amber: 'text-warning', blue: 'text-info', brand: 'text-primary' } as const;
  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_10px_30px_-12px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        {icon && <span className={iconTones[tone]}>{icon}</span>}
      </div>
      <div className="mt-2 text-2xl font-bold font-display tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

/* ---------- EmptyState ---------- */
export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="bg-card border border-dashed border-border-strong rounded-xl py-12 px-6 text-center">
      {icon && <div className="mx-auto w-12 h-12 rounded-full bg-accent grid place-items-center text-muted mb-3">{icon}</div>}
      <div className="font-semibold">{title}</div>
      {description && <div className="text-sm text-muted mt-1 max-w-sm mx-auto">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------- Banner ---------- */
export function Banner({ tone = 'info', children, className }: { tone?: 'info' | 'warning' | 'danger' | 'success'; children: ReactNode; className?: string }) {
  const tones = {
    info: 'border-info/40 bg-info/10 text-info',
    warning: 'border-warning/40 bg-warning/10 text-warning',
    danger: 'border-danger/40 bg-danger/10 text-danger',
    success: 'border-success/40 bg-success/10 text-success',
  } as const;
  return (
    <div className={clsx('border rounded-lg px-4 py-3 text-sm [&_a]:underline', tones[tone], className)}>
      {children}
    </div>
  );
}

/* ---------- Spinner ---------- */
export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={clsx('animate-spin text-muted', className)} />;
}

/* ---------- ConfirmDialog ---------- */
export function ConfirmDialog({ title, body, confirmLabel = 'Confirm', danger, onConfirm, onCancel }: {
  title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-card border border-border rounded-xl w-full max-w-sm p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold font-display">{title}</h3>
        {body && <div className="text-sm text-muted mt-2">{body}</div>}
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} size="sm" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Toast ---------- */
interface ToastItem { id: number; kind: 'success' | 'error' | 'info'; text: string }
const ToastCtx = createContext<{ push: (kind: ToastItem['kind'], text: string) => void }>({ push: () => {} });
export function useToast() {
  const { push } = useContext(ToastCtx);
  return {
    success: (t: string) => push('success', t),
    error: (t: string) => push('error', t),
    info: (t: string) => push('info', t),
  };
}
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const push = useCallback((kind: ToastItem['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  const tones = { success: 'border-success/50 text-success', error: 'border-danger/50 text-danger', info: 'border-info/50 text-info' } as const;
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] space-y-2 w-80">
        {toasts.map((t) => (
          <div key={t.id} className={clsx('bg-card border rounded-lg px-4 py-3 text-sm shadow-xl', tones[t.kind])}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
