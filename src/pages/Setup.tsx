import React, { useState } from 'react';
import { useAuth } from '../auth';
import { Input, Button, Field } from '../components/ui';
import { Gauge } from 'lucide-react';
import { AuthHero } from './Login';

export default function SetupPage() {
  const { setup } = useAuth();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const strength = password.length === 0 ? '' : password.length < 8 ? 'Too short (min 8)' : password.length < 12 ? 'OK' : 'Strong';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (password !== confirm) return setErr('Passwords do not match');
    setBusy(true);
    try {
      await setup(username, password, displayName || undefined);
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
          <div className="eyebrow mb-1">First-run setup</div>
          <h2 className="text-2xl font-bold font-display mb-1">Create the admin account</h2>
          <p className="text-sm text-muted mb-6">You can add manager accounts later.</p>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Username"><Input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus /></Field>
            <Field label="Display name (optional)"><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></Field>
            <Field label="Password" hint={strength || 'Minimum 8 characters'}><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></Field>
            <Field label="Confirm password"><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></Field>
            {err && <div className="text-sm text-danger">{err}</div>}
            <Button type="submit" loading={busy} className="w-full">{busy ? 'Creating…' : 'Create admin account'}</Button>
          </form>
        </div>
      </div>
    </div>
  );
}
