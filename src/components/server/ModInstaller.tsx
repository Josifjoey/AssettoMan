import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, GameServer, ContentItem, CmContent } from '../../api';
import { Card, Button, Select, Field, Input, Check, useToast } from '../ui';
import { Upload, Package, Trash2, Download, CheckCircle2, AlertTriangle, FolderInput } from 'lucide-react';

// Uploads mod zips straight into this server's content folders and lists
// what's installed vs. what's in the library.

export default function ModInstaller({ server, onChanged }: { server: GameServer; onChanged: () => void }) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [cm, setCm] = useState<CmContent | null>(null);
  const [kind, setKind] = useState('car');
  const [name, setName] = useState('');
  const [publicDl, setPublicDl] = useState(true);
  const [busy, setBusy] = useState(false);
  const [acInstall, setAcInstall] = useState<{ found: boolean; path?: string; cars?: number; tracks?: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data } = await api.get('/content', { params: { serverId: server.id } });
    setItems(data.items);
    const cmRes = await api.get(`/servers/${server.id}/cm-content`).catch(() => null);
    if (cmRes) setCm(cmRes.data);
    api.get('/system/ac-install').then((r) => setAcInstall(r.data)).catch(() => {});
  };
  useEffect(() => { load(); }, [server.id]);

  const importMeta = async () => {
    setImporting(true);
    try {
      const { data } = await api.post(`/servers/${server.id}/import-ac-metadata`);
      toast.success(`Imported ${data.files} files — ${data.cars.length} cars, ${data.tracks.length} tracks${data.missing.length ? ` (${data.missing.length} not in AC install)` : ''}`);
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    }
    setImporting(false);
  };

  const upload = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return toast.error('Choose a .zip file first');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('kind', kind);
      fd.append('name', name || f.name.replace(/\.zip$/i, ''));
      fd.append('serverId', server.id);
      fd.append('publicDownload', String(publicDl));
      const { data } = await api.post('/content', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (data.installedError) toast.error(`Uploaded but extraction failed: ${data.installedError}`);
      else toast.success('Uploaded & installed');
      if (fileRef.current) fileRef.current.value = '';
      setName('');
      await load();
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
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

  const cfgCars = String(server.config?.server?.cars || '').split(';').filter(Boolean);
  const cfgTrack = server.config?.server?.track || null;

  return (
    <div className="space-y-4">
      {cm && (
        <Card title="Content Manager download links">
          <p className="text-xs text-muted mb-2">
            Cars/track in the current config and whether players get a download link (cm_content/content.json). Add links on the <Link to="/admin/content" className="text-primary hover:underline">Content page</Link>.<br />
            {server.type === 'assettoserver'
              ? 'content.json is served to Content Manager automatically by AssettoServer (EnableServerDetails).'
              : "content.json is generated for Content Manager. Vanilla acServer doesn't expose it — it is used when running via AssettoServer or CM's server wrapper. Public page download links always work."}
          </p>
          <div className="space-y-1 text-sm">
            {cfgCars.map((c) => {
              const linked = !!cm.cars?.[c]?.url;
              return (
                <div key={c} className="flex items-center gap-2">
                  {linked ? <CheckCircle2 size={14} className="text-emerald-400 shrink-0" /> : <AlertTriangle size={14} className="text-amber-400 shrink-0" />}
                  <span className="font-mono text-xs">{c}</span>
                  {!linked && <Link to="/admin/content" className="text-xs text-primary hover:underline">add link</Link>}
                </div>
              );
            })}
            {cfgTrack && (
              <div className="flex items-center gap-2">
                {cm.track?.url ? <CheckCircle2 size={14} className="text-emerald-400 shrink-0" /> : <AlertTriangle size={14} className="text-amber-400 shrink-0" />}
                <span className="font-mono text-xs">{cfgTrack} (track)</span>
                {!cm.track?.url && <Link to="/admin/content" className="text-xs text-primary hover:underline">add link</Link>}
              </div>
            )}
            {!cfgCars.length && !cfgTrack && <div className="text-muted text-xs">No cars/track configured yet.</div>}
          </div>
        </Card>
      )}
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

      {acInstall && (
        <Card title="Assetto Corsa install">
          <div className="flex items-center gap-3 flex-wrap">
            {acInstall.found ? (
              <>
                <div className="text-sm text-muted flex-1 min-w-0">
                  Found at <span className="font-mono text-xs">{acInstall.path}</span> — {acInstall.cars} cars, {acInstall.tracks} tracks.
                  Import copies only metadata (previews, names, track maps) for the content this server uses.
                </div>
                <Button variant="secondary" size="sm" onClick={importMeta} disabled={importing}>
                  <FolderInput size={13} className="inline mr-1" />{importing ? 'Importing…' : 'Import names, images & maps'}
                </Button>
              </>
            ) : (
              <div className="text-sm text-muted">No Assetto Corsa install detected — set the install path under <Link to="/admin/settings" className="text-primary hover:underline">Settings</Link>.</div>
            )}
          </div>
        </Card>
      )}

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
          <Check label="Offer on public download page" checked={publicDl} onChange={setPublicDl} hint="Players can grab this mod from the public page" />
        </div>
      </Card>

      <Card title="Library">
        {items.length === 0 && <div className="text-sm text-muted">No mods uploaded yet.</div>}
        <div className="space-y-1">
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-3 bg-card-2 border border-border rounded-lg px-3 py-2.5 text-sm">
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
