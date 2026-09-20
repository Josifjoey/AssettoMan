import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Card, Input, Field, Textarea, Button, Badge, PageHeader, useToast } from '../components/ui';

export default function SettingsPage() {
  const toast = useToast();
  const [health, setHealth] = useState<any>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [audit, setAudit] = useState<any[]>([]);
  const [saving, setSaving] = useState('');

  const load = async () => {
    const [h, s, a] = await Promise.all([
      api.get('/system/health').then((r) => r.data).catch(() => null),
      api.get('/system/settings').then((r) => r.data.settings).catch(() => ({})),
      api.get('/system/audit').then((r) => r.data.entries).catch(() => []),
    ]);
    setHealth(h); setSettings(s); setAudit(a);
  };
  useEffect(() => { load(); }, []);

  const save = async (keys: string[]) => {
    setSaving(keys[0]);
    try {
      const body: Record<string, string> = {};
      for (const k of keys) body[k] = settings[k] ?? '';
      await api.put('/system/settings', body);
      toast.success('Settings saved');
    } catch (e: any) { toast.error(e.message); }
    setSaving('');
  };

  const set = (k: string, v: string) => setSettings((s) => ({ ...s, [k]: v }));
  const joinExample = settings.public_game_host ? `${settings.public_game_host}:9600` : null;

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader eyebrow="System" title="Settings" />

      <Card title="Public site" subtitle="Community page"
            actions={<Button size="sm" loading={saving === 'public_site_name'} onClick={() => save(['public_site_name', 'public_about', 'public_rules', 'public_join_info', 'public_discord_url'])}>Save</Button>}>
        <div className="space-y-4">
          <Field label="Site name"><Input value={settings.public_site_name || ''} onChange={(e) => set('public_site_name', e.target.value)} /></Field>
          <Field label="About text"><Textarea rows={3} value={settings.public_about || ''} onChange={(e) => set('public_about', e.target.value)} /></Field>
          <Field label="Server rules" hint="One rule per line"><Textarea rows={6} value={settings.public_rules || ''} onChange={(e) => set('public_rules', e.target.value)} /></Field>
          <Field label="How to join" hint="Connection info, password location, etc."><Textarea rows={3} value={settings.public_join_info || ''} onChange={(e) => set('public_join_info', e.target.value)} /></Field>
          <Field label="Discord invite URL"><Input value={settings.public_discord_url || ''} onChange={(e) => set('public_discord_url', e.target.value)} /></Field>
        </div>
      </Card>

      <Card title="Networking" subtitle="Join links"
            actions={<Button size="sm" loading={saving === 'public_game_host'} onClick={() => save(['public_game_host', 'public_base_url'])}>Save</Button>}>
        <div className="space-y-4">
          <Field label="Public game host" hint="IP/hostname players connect to — enables join buttons and the address chip">
            <Input mono value={settings.public_game_host || ''} onChange={(e) => set('public_game_host', e.target.value)} placeholder="assetto.example.com" />
          </Field>
          <Field label="Public base URL" hint="Used to build download links in Content Manager's content.json">
            <Input mono value={settings.public_base_url || ''} onChange={(e) => set('public_base_url', e.target.value)} placeholder="https://assetto.example.com" />
          </Field>
          {joinExample && (
            <div className="text-xs text-muted bg-card-2 border border-border rounded-lg px-3 py-2">
              Players will connect to <code className="font-mono text-foreground">{joinExample}</code> (per-server game port).
            </div>
          )}
        </div>
      </Card>

      <Card title="System" subtitle="Health — read only">
        <dl className="text-sm space-y-2.5">
          <div className="flex justify-between"><dt className="text-muted">Docker socket</dt><dd>{health?.docker ? <Badge tone="green" dot>connected</Badge> : <Badge tone="red" dot>unreachable</Badge>}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">Data dir (container)</dt><dd className="font-mono text-xs truncate">{health?.dataDir}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">Host data dir</dt><dd className="font-mono text-xs truncate">{health?.hostDataDir}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Host path mapping</dt><dd>{health?.hostMapping ? <Badge tone="green">set</Badge> : <Badge tone="amber">same as container — set HOST_DATA_DIR</Badge>}</dd></div>
        </dl>
      </Card>

      <Card title="Audit log" subtitle="Recent actions">
        <div className="max-h-64 overflow-auto text-xs space-y-1.5 font-mono">
          {audit.length === 0 && <div className="text-muted">No entries yet.</div>}
          {audit.map((a) => (
            <div key={a.id} className="flex gap-3">
              <span className="text-muted shrink-0 tabular-nums">{new Date(a.created_at).toLocaleString()}</span>
              <span className="text-muted">{a.username}</span>
              <span className="text-primary">{a.action}</span>
              <span className="text-muted truncate">{a.details}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
