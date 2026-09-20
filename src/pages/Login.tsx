import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Input, Button, Field } from '../components/ui';
import { Gauge, Flag, Radio, Download, ArrowLeft } from 'lucide-react';

export function AuthHero() {
  return (
    <div className="hidden md:flex w-[55%] bg-card stripes relative flex-col justify-between p-10 text-white overflow-hidden">
      <div className="absolute -bottom-32 -left-32 w-[600px] h-[600px] rounded-full bg-brand opacity-30 blur-3xl pointer-events-none" />
      <div className="absolute top-0 right-0 bottom-0 w-px bg-gradient-to-b from-transparent via-primary/60 to-transparent" />
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-white/15 backdrop-blur grid place-items-center"><Gauge size={20} /></div>
        <span className="font-bold font-display text-lg">AssettoMan</span>
      </div>
      <div>
        <h1 className="text-4xl font-extrabold font-display leading-tight max-w-md">Run your Assetto servers like a pit wall.</h1>
        <ul className="mt-8 space-y-4 text-sm text-white/85">
          <li className="flex items-center gap-3"><Flag size={16} className="shrink-0" />One-click AC, ACC & AssettoServer containers</li>
          <li className="flex items-center gap-3"><Radio size={16} className="shrink-0" />Live timing, results archives & public pages</li>
          <li className="flex items-center gap-3"><Download size={16} className="shrink-0" />Content Manager downloads, wired automatically</li>
        </ul>
      </div>
      <div className="text-xs text-white/60">Assetto Corsa server management for unraid &amp; Windows.</div>
    </div>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await login(username, password);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <AuthHero />
      <div className="flex-1 grid place-items-center p-8">
        <div className="w-full max-w-sm">
          <div className="md:hidden flex items-center gap-2 mb-8"><Gauge className="text-primary" size={24} /><span className="font-bold font-display">AssettoMan</span></div>
          <div className="eyebrow mb-1">Staff sign-in</div>
          <h2 className="text-2xl font-bold font-display mb-6">Welcome back</h2>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Username"><Input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus /></Field>
            <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            {err && <div className="text-sm text-danger">{err}</div>}
            <Button type="submit" loading={busy} className="w-full">{busy ? 'Signing in…' : 'Sign in'}</Button>
          </form>
          <div className="mt-6"><Link to="/" className="text-xs text-muted hover:text-foreground flex items-center gap-1"><ArrowLeft size={12} /> Back to public site</Link></div>
        </div>
      </div>
    </div>
  );
}
