import React, { useEffect, useState } from 'react';
import { api, User } from '../api';
import { Card, Input, Select, Field, Button, Badge, PageHeader, ConfirmDialog, useToast } from '../components/ui';
import { Plus, Trash2, KeyRound } from 'lucide-react';

export default function AccountsPage() {
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('manager');
  const [deleteUser, setDeleteUser] = useState<User | null>(null);

  const load = async () => {
    const { data } = await api.get('/accounts');
    setUsers(data.users);
  };
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/accounts', { username, password, role });
      toast.success(`Created ${username}`);
      setUsername(''); setPassword('');
      await load();
    } catch (e2: any) { toast.error(e2.message); }
  };

  const patch = async (id: string, body: any) => {
    try { await api.patch(`/accounts/${id}`, body); await load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const resetPw = async (id: string, name: string) => {
    const pw = prompt(`New password for ${name} (min 8 chars):`);
    if (!pw) return;
    if (pw.length < 8) return toast.error('Password too short');
    await patch(id, { password: pw });
    toast.success(`Password reset for ${name}`);
  };

  return (
    <>
      <PageHeader eyebrow="Admin" title="Accounts" description="Staff logins for the manager." />

      <div className="grid gap-5 lg:grid-cols-[320px_1fr] items-start">
        <Card title="Add account" subtitle="New user">
          <form onSubmit={create} className="space-y-4">
            <Field label="Username"><Input value={username} onChange={(e) => setUsername(e.target.value)} required /></Field>
            <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></Field>
            <Field label="Role" hint="Managers configure servers but can't manage accounts">
              <Select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
            <Button type="submit" icon={<Plus size={14} />} className="w-full">Create account</Button>
          </form>
        </Card>

        <Card title="Users" subtitle={`${users.length} accounts`} padded={false}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-border">
                <th className="eyebrow px-5 py-2.5">User</th>
                <th className="eyebrow px-3 py-2.5">Role</th>
                <th className="eyebrow px-3 py-2.5">Status</th>
                <th className="eyebrow px-3 py-2.5">Last login</th>
                <th className="eyebrow px-3 py-2.5 text-right pr-5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} className={i % 2 ? 'bg-card-2/50' : ''}>
                  <td className="px-5 py-3">
                    <div>{u.display_name || u.username}</div>
                    <div className="text-xs text-muted">@{u.username}</div>
                  </td>
                  <td className="px-3 py-3"><Badge tone={u.role === 'admin' ? 'brand' : 'neutral'}>{u.role}</Badge></td>
                  <td className="px-3 py-3">
                    <button onClick={() => patch(u.id, { isActive: !u.is_active })} title="Toggle active">
                      <Badge tone={u.is_active ? 'green' : 'amber'} dot>{u.is_active ? 'active' : 'disabled'}</Badge>
                    </button>
                  </td>
                  <td className="px-3 py-3 text-xs text-muted">{u.last_login ? new Date(u.last_login).toLocaleString() : 'never'}</td>
                  <td className="px-3 py-3 pr-5 text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => resetPw(u.id, u.username)} title="Reset password" icon={<KeyRound size={13} />} aria-label="Reset password" />
                      <Button variant="ghost" size="sm" onClick={() => setDeleteUser(u)} title="Delete" icon={<Trash2 size={13} className="text-danger" />} aria-label="Delete" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {deleteUser && (
        <ConfirmDialog
          danger title={`Delete account "${deleteUser.username}"?`}
          body="They will no longer be able to sign in."
          confirmLabel="Delete"
          onCancel={() => setDeleteUser(null)}
          onConfirm={async () => {
            try { await api.delete(`/accounts/${deleteUser.id}`); toast.success('Deleted'); load(); }
            catch (e: any) { toast.error(e.message); }
            setDeleteUser(null);
          }}
        />
      )}
    </>
  );
}
