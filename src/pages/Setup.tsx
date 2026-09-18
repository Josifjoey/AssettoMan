import React, { useState } from 'react';
import { useAuth } from '../auth';
import { Card, Input, Button, Field } from '../components/ui';
import { Gauge } from 'lucide-react';

export default function SetupPage() {
  const { setup } = useAuth();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

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
    <div className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-6">
          <Gauge className="text-primary" size={28} />
          <h1 className="text-2xl font-bold">AssettoMan</h1>
        </div>
        <Card title="First-run setup">
          <p className="text-sm text-muted mb-4">Create the administrator account. You can add manager accounts later.</p>
          <form onSubmit={submit} className="space-y-3">
            <Field label="Username"><Input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus /></Field>
            <Field label="Display name (optional)"><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></Field>
            <Field label="Password" hint="Minimum 8 characters"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></Field>
            <Field label="Confirm password"><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></Field>
            {err && <div className="text-sm text-red-400">{err}</div>}
            <Button type="submit" disabled={busy} className="w-full">{busy ? 'Creating…' : 'Create admin account'}</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
