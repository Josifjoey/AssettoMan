import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Card, Input, Field, Textarea, Button, Badge } from '../components/ui';

export default function SettingsPage() {
  const [health, setHealth] = useState<any>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [audit, setAudit] = useState<any[]>([]);
  const [msg, setMsg] = useState('');

  const load = async () => {
    const [h, s, a] = await Promise.all([
      api.get('/system/health').then((r) => r.data).catch(() => null),
      api.get('/system/settings').then((r) => r.data.settings).catch(() => ({})),
      api.get('/system/audit').then((r) => r.data.entries).catch(() => []),
    ]);
    setHealth(h); setSettings(s); setAudit(a);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    await api.put('/system/settings', settings);
    setMsg('Settings saved');
    setTimeout(() => setMsg(''), 3000);
  };

  const set = (k: string, v: string) => setSettings((s) => ({ ...s, [k]: v }));

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">Settings</h1>

      <Card title="System">
        <dl className="text-sm space-y-2">
          <div className="flex justify-between"><dt className="text-muted">Docker socket</dt><dd>{health?.docker ? <Badge tone="green">connected</Badge> : <Badge tone="red">unreachable</Badge>}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Data dir (container)</dt><dd className="font-mono text-xs">{health?.dataDir}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Host data dir</dt><dd className="font-mono text-xs">{health?.hostDataDir}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Host path mapping</dt><dd>{health?.hostMapping ? <Badge tone="green">set</Badge> : <Badge tone="amber">same as container — set HOST_DATA_DIR</Badge>}</dd></div>
        </dl>
      </Card>

      <Card title="Public page">
        <div className="space-y-3">
          <Field label="Site name"><Input value={settings.public_site_name || ''} onChange={(e) => set('public_site_name', e.target.value)} /></Field>
          <Field label="About text"><Textarea rows={3} value={settings.public_about || ''} onChange={(e) => set('public_about', e.target.value)} /></Field>
          <Field label="Server rules" hint="Shown on the public page — one rule per line"><Textarea rows={6} value={settings.public_rules || ''} onChange={(e) => set('public_rules', e.target.value)} /></Field>
          <Field label="Discord invite URL"><Input value={settings.public_discord_url || ''} onChange={(e) => set('public_discord_url', e.target.value)} /></Field>
          <Field label="How to join" hint="e.g. connection info, password location"><Textarea rows={3} value={settings.public_join_info || ''} onChange={(e) => set('public_join_info', e.target.value)} /></Field>
          <Button onClick={save}>Save public settings</Button>
          {msg && <span className="text-sm text-emerald-400 ml-3">{msg}</span>}
        </div>
      </Card>

      <Card title="Audit log">
        <div className="max-h-64 overflow-auto text-xs space-y-1">
          {audit.length === 0 && <div className="text-muted">No entries yet.</div>}
          {audit.map((a) => (
            <div key={a.id} className="flex gap-3">
              <span className="text-muted shrink-0">{new Date(a.created_at).toLocaleString()}</span>
              <span className="text-muted">{a.username}</span>
              <span>{a.action}</span>
              <span className="text-muted truncate">{a.details}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
