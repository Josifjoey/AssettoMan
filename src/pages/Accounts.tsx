import React, { useEffect, useState } from 'react';
import { api, User } from '../api';
import { Card, Input, Select, Field, Button, Badge } from '../components/ui';
import { Plus, Trash2, KeyRound } from 'lucide-react';

export default function AccountsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('manager');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    const { data } = await api.get('/accounts');
    setUsers(data.users);
  };
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setMsg('');
    try {
      await api.post('/accounts', { username, password, role });
      setMsg(`Created ${username}`);
      setUsername(''); setPassword('');
      await load();
    } catch (e2: any) { setErr(e2.message); }
  };

  const patch = async (id: string, body: any) => {
    setErr(''); setMsg('');
    try { await api.patch(`/accounts/${id}`, body); await load(); }
    catch (e: any) { setErr(e.message); }
  };

  const del = async (id: string, name: string) => {
    if (!confirm(`Delete account "${name}"?`)) return;
    try { await api.delete(`/accounts/${id}`); await load(); }
    catch (e: any) { setErr(e.message); }
  };

  const resetPw = async (id: string, name: string) => {
    const pw = prompt(`New password for ${name} (min 8 chars):`);
    if (!pw) return;
    if (pw.length < 8) return setErr('Password too short');
    await patch(id, { password: pw });
    setMsg(`Password reset for ${name}`);
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold mb-6">Accounts</h1>
      <div className="space-y-4">
        <Card title="Create account">
          <form onSubmit={create} className="grid md:grid-cols-4 gap-3 items-end">
            <Field label="Username"><Input value={username} onChange={(e) => setUsername(e.target.value)} required /></Field>
            <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></Field>
            <Field label="Role">
              <Select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
            <Button type="submit"><Plus size={13} className="inline mr-1" />Create</Button>
          </form>
          <p className="text-xs text-muted mt-2">Managers can configure and control servers but can't manage accounts.</p>
        </Card>

        {err && <div className="text-sm text-red-400">{err}</div>}
        {msg && <div className="text-sm text-emerald-400">{msg}</div>}

        <Card title={`Users (${users.length})`}>
          <div className="space-y-1">
            {users.map((u) => (
              <div key={u.id} className="flex items-center gap-3 bg-background border border-border rounded px-3 py-2">
                <div className="flex-1">
                  <div className="text-sm">{u.display_name || u.username} <span className="text-muted text-xs">@{u.username}</span></div>
                  <div className="text-xs text-muted">{u.last_login ? `last login ${new Date(u.last_login).toLocaleString()}` : 'never logged in'}</div>
                </div>
                <Badge tone={u.role === 'admin' ? 'blue' : 'neutral'}>{u.role}</Badge>
                {!u.is_active && <Badge tone="amber">disabled</Badge>}
                <Button variant="ghost" onClick={() => resetPw(u.id, u.username)} title="Reset password"><KeyRound size={13} /></Button>
                <Button variant="ghost" onClick={() => patch(u.id, { isActive: !u.is_active })}>{u.is_active ? 'Disable' : 'Enable'}</Button>
                <Button variant="ghost" onClick={() => del(u.id, u.username)}><Trash2 size={13} /></Button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
