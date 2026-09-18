import React, { useEffect, useRef, useState } from 'react';
import { api, ContentItem, GameServer } from '../api';
import { Card, Button, Select, Field, Input, Check, Badge } from '../components/ui';
import { Upload, Package, Trash2, Download, ArrowRight } from 'lucide-react';

// Global mod library — uploads live here and can be installed into any
// ac / ac_modded server on demand.

export default function ContentPage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [servers, setServers] = useState<GameServer[]>([]);
  const [kind, setKind] = useState('car');
  const [name, setName] = useState('');
  const [publicDl, setPublicDl] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [installTarget, setInstallTarget] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const [{ data: c }, { data: s }] = await Promise.all([
      api.get('/content'),
      api.get('/servers'),
    ]);
    setItems(c.items);
    setServers(s.servers.filter((x: GameServer) => x.type !== 'acc'));
  };
  useEffect(() => { load(); }, []);

  const upload = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return setErr('Choose a .zip file first');
    setBusy(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('kind', kind);
      fd.append('name', name || f.name.replace(/\.zip$/i, ''));
      fd.append('publicDownload', String(publicDl));
      await api.post('/content', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (fileRef.current) fileRef.current.value = '';
      setName('');
      await load();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  const install = async (id: string) => {
    const target = installTarget[id];
    if (!target) return;
    try {
      await api.post(`/content/${id}/install`, { serverId: target });
      await load();
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-bold mb-6">Content library</h1>
      <div className="space-y-4">
        <Card title="Upload mod">
          <div className="grid md:grid-cols-4 gap-3 items-end">
            <Field label="Type"><Select value={kind} onChange={(e) => setKind(e.target.value)}><option value="car">Car</option><option value="track">Track</option><option value="mod">Other</option></Select></Field>
            <Field label="Display name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Zip file"><input ref={fileRef} type="file" accept=".zip" className="text-xs file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:bg-accent file:text-foreground" /></Field>
            <Button onClick={upload} disabled={busy}><Upload size={13} className="inline mr-1" />{busy ? 'Uploading…' : 'Upload'}</Button>
          </div>
          <div className="mt-3"><Check label="Offer on public download page" checked={publicDl} onChange={setPublicDl} /></div>
          {err && <div className="text-sm text-red-400 mt-2">{err}</div>}
        </Card>

        <Card title={`Mods (${items.length})`}>
          {items.length === 0 && <div className="text-sm text-muted">Nothing uploaded yet.</div>}
          <div className="space-y-1">
            {items.map((it) => (
              <div key={it.id} className="flex items-center gap-3 bg-background border border-border rounded px-3 py-2 text-sm flex-wrap">
                <Package size={14} className="text-muted shrink-0" />
                <div className="flex-1 min-w-[12rem]">
                  <div>{it.name} {it.version && <span className="text-xs text-muted">v{it.version}</span>}</div>
                  <div className="text-xs text-muted">{it.kind}{it.size ? ` · ${(it.size / 1e6).toFixed(1)} MB` : ''}</div>
                </div>
                {it.is_public_download ? <Badge tone="green">public</Badge> : <Badge>private</Badge>}
                <div className="flex items-center gap-1">
                  <Select className="w-44" value={installTarget[it.id] || ''} onChange={(e) => setInstallTarget((m) => ({ ...m, [it.id]: e.target.value }))}>
                    <option value="">install into…</option>
                    {servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                  <Button variant="ghost" disabled={!installTarget[it.id]} onClick={() => install(it.id)}><ArrowRight size={13} /></Button>
                  <Button variant="ghost" onClick={async () => { await api.patch(`/content/${it.id}`, { publicDownload: !it.is_public_download }); load(); }}><Download size={13} /></Button>
                  <Button variant="ghost" onClick={async () => { if (confirm(`Delete ${it.name}?`)) { await api.delete(`/content/${it.id}`); load(); } }}><Trash2 size={13} /></Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
