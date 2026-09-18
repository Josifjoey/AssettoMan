import React, { useState } from 'react';
import { useAuth } from '../auth';
import { Card, Input, Button, Field } from '../components/ui';
import { Gauge } from 'lucide-react';
import { Link } from 'react-router-dom';

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
    <div className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-6">
          <Gauge className="text-primary" size={28} />
          <h1 className="text-2xl font-bold">AssettoMan</h1>
        </div>
        <Card title="Sign in">
          <form onSubmit={submit} className="space-y-3">
            <Field label="Username"><Input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus /></Field>
            <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            {err && <div className="text-sm text-red-400">{err}</div>}
            <Button type="submit" disabled={busy} className="w-full">{busy ? 'Signing in…' : 'Sign in'}</Button>
          </form>
        </Card>
        <div className="text-center mt-4"><Link to="/public" className="text-xs text-muted hover:text-foreground">View public server page →</Link></div>
      </div>
    </div>
  );
}
