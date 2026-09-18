import React, { useEffect, useRef, useState } from 'react';
import { api, GameServer, ContentItem } from '../../api';
import { Card, Button, Select, Field, Input, Check } from '../ui';
import { Upload, Package, Trash2, Download } from 'lucide-react';

// Uploads mod zips straight into this server's content folders and lists
// what's installed vs. what's in the library.

export default function ModInstaller({ server, onChanged }: { server: GameServer; onChanged: () => void }) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [kind, setKind] = useState('car');
  const [name, setName] = useState('');
  const [publicDl, setPublicDl] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data } = await api.get('/content', { params: { serverId: server.id } });
    setItems(data.items);
  };
  useEffect(() => { load(); }, [server.id]);

  const upload = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return setErr('Choose a .zip file first');
    setBusy(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('kind', kind);
      fd.append('name', name || f.name.replace(/\.zip$/i, ''));
      fd.append('serverId', server.id);
      fd.append('publicDownload', String(publicDl));
      const { data } = await api.post('/content', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (data.installedError) setErr(`Uploaded but extraction failed: ${data.installedError}`);
      if (fileRef.current) fileRef.current.value = '';
      setName('');
      await load();
      onChanged();
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  };

  const del = async (id: string) => {
    await api.delete(`/content/${id}`);
    await load();
  };

  const togglePublic = async (it: ContentItem) => {
    await api.patch(`/content/${it.id}`, { publicDownload: !it.is_public_download });
    await load();
  };

  const installed = server.installed || { cars: [], tracks: [] };

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <Card title={`Installed cars (${installed.cars.length})`}>
          <div className="max-h-48 overflow-auto text-xs font-mono space-y-0.5">
            {installed.cars.length ? installed.cars.map((c) => <div key={c}>{c}</div>) : <div className="text-muted">None detected yet</div>}
          </div>
        </Card>
        <Card title={`Installed tracks (${installed.tracks.length})`}>
          <div className="max-h-48 overflow-auto text-xs font-mono space-y-0.5">
            {installed.tracks.length ? installed.tracks.map((t) => <div key={t}>{t}</div>) : <div className="text-muted">None detected yet</div>}
          </div>
        </Card>
      </div>

      <Card title="Upload mod">
        <p className="text-xs text-muted mb-3">Drop a car/track .zip — it's extracted into this server's <code>content/</code> folder automatically. Standard layouts (content/cars/…, cars/…, bare folder) all work.</p>
        <div className="grid md:grid-cols-4 gap-3 items-end">
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="car">Car</option><option value="track">Track</option><option value="mod">Other mod</option>
            </Select>
          </Field>
          <Field label="Display name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mazda MX-5 Cup" /></Field>
          <Field label="Zip file"><input ref={fileRef} type="file" accept=".zip" className="text-xs file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:bg-accent file:text-foreground" /></Field>
          <Button onClick={upload} disabled={busy}><Upload size={13} className="inline mr-1" />{busy ? 'Uploading…' : 'Upload & install'}</Button>
        </div>
        <div className="mt-3">
          <Check label="Offer on public download page" checked={publicDl} onChange={setPublicDl} hint="Players can grab this mod from /public" />
        </div>
        {err && <div className="text-sm text-red-400 mt-2">{err}</div>}
      </Card>

      <Card title="Library">
        {items.length === 0 && <div className="text-sm text-muted">No mods uploaded yet.</div>}
        <div className="space-y-1">
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-3 bg-background border border-border rounded px-3 py-2 text-sm">
              <Package size={14} className="text-muted shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="truncate">{it.name}</div>
                <div className="text-xs text-muted">{it.kind}{it.size ? ` · ${(it.size / 1e6).toFixed(1)} MB` : ''}{it.server_id === server.id ? ' · installed here' : ' · library'}</div>
              </div>
              <Button variant="ghost" onClick={() => togglePublic(it)} title="Toggle public download">
                <Download size={13} className={it.is_public_download ? 'text-emerald-400' : 'text-muted'} />
              </Button>
              <Button variant="ghost" onClick={() => del(it.id)}><Trash2 size={13} /></Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
