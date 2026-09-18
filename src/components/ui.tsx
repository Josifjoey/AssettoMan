import React, { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';

export function Card({ title, children, actions, className }: { title?: string; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('bg-card border border-border rounded-lg p-4', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm text-muted uppercase tracking-wide">{title}</h3>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger' | 'success' | 'outline';
}
export function Button({ variant = 'primary', className, ...props }: BtnProps) {
  const styles = {
    primary: 'bg-primary text-white hover:brightness-110',
    ghost: 'bg-accent text-foreground hover:bg-border',
    danger: 'bg-red-700 text-white hover:bg-red-600',
    success: 'bg-emerald-700 text-white hover:bg-emerald-600',
    outline: 'border border-border text-foreground hover:bg-accent',
  } as const;
  return (
    <button
      className={clsx('px-3 py-1.5 rounded text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed', styles[variant], className)}
      {...props}
    />
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx('w-full bg-background border border-border rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary', props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx('w-full bg-background border border-border rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary', props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx('w-full bg-background border border-border rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary', props.className)} />;
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-xs text-muted mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted/60 mt-0.5">{hint}</span>}
    </label>
  );
}

export function Check({ label, checked, onChange, hint, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string; disabled?: boolean }) {
  return (
    <label className={clsx('flex items-start gap-2 select-none', disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer')}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-[#e8344e]" />
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'green' | 'red' | 'amber' | 'blue' }) {
  const tones = {
    neutral: 'bg-accent text-muted',
    green: 'bg-emerald-900/60 text-emerald-300',
    red: 'bg-red-900/60 text-red-300',
    amber: 'bg-amber-900/60 text-amber-300',
    blue: 'bg-sky-900/60 text-sky-300',
  } as const;
  return <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', tones[tone])}>{children}</span>;
}

export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-1 border-b border-border mb-4 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={clsx(
            'px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px',
            active === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted hover:text-foreground'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
