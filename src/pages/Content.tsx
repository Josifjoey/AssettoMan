import React, { useEffect, useRef, useState } from 'react';
import { api, ContentItem, GameServer, contentApi, LinkPreview } from '../api';
import { Card, Button, Select, Field, Input, Check, Badge } from '../components/ui';
import { Upload, Package, Trash2, Download, ArrowRight, Link2 } from 'lucide-react';

// Global mod library — uploads live here and can be installed into any
// ac / ac_modded server on demand. External links are served to players
// via Content Manager's cm_content.json.

function domainOf(url?: string) {
  try { return url ? new URL(url).hostname.replace(/^www\./, '') : ''; } catch { return ''; }
}

export default function ContentPage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [servers, setServers] = useState<GameServer[]>([]);
  const [mode, setMode] = useState<'upload' | 'link'>('upload');
  const [kind, setKind] = useState('car');
  const [name, setName] = useState('');
  const [publicDl, setPublicDl] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [installTarget, setInstallTarget] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  // Link form state
  const [linkUrl, setLinkUrl] = useState('');
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [lName, setLName] = useState('');
  const [lKind, setLKind] = useState('car');
  const [lVersion, setLVersion] = useState('');
  const [lContentId, setLContentId] = useState('');
  const [lImage, setLImage] = useState('');
  const [lDesc, setLDesc] = useState('');
  const [lServer, setLServer] = useState('');
  const [lPublic, setLPublic] = useState(true);

  const load = async () => {
    const [{ data: c }, { data: s }] = await Promise.all([
      api.get('/content'),
      api.get('/servers'),
    ]);
    setItems(c.items);
    setServers(s.servers.filter((x: GameServer) => x.type !== 'acc'));
  };
  useEffect(() => { load(); }, []);

  // Debounced link preview
  useEffect(() => {
    if (mode !== 'link' || !/^https?:\/\//i.test(linkUrl)) { setPreview(null); return; }
    const t = setTimeout(async () => {
      setPreviewing(true);
      try {
        const { data } = await contentApi.preview(linkUrl);
        setPreview(data);
        if (data.title && !lName) setLName(data.title);
        if (data.kind) setLKind(data.kind);
        if (data.image && !lImage) setLImage(data.image);
        if (data.description && !lDesc) setLDesc(data.description);
      } catch { setPreview(null); }
      setPreviewing(false);
    }, 600);
    return () => clearTimeout(t);
  }, [linkUrl, mode]);

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

  const saveLink = async () => {
    if (!/^https?:\/\//i.test(linkUrl)) return setErr('Enter a valid https:// link');
    if (!lName) return setErr('Name required');
    setBusy(true); setErr('');
    try {
      await contentApi.link({
        kind: lKind, name: lName, version: lVersion || undefined, url: linkUrl,
        contentId: lContentId || undefined, description: lDesc || undefined,
        previewImage: lImage || undefined, serverId: lServer || undefined, publicDownload: lPublic,
      });
      setLinkUrl(''); setLName(''); setLVersion(''); setLContentId(''); setLImage(''); setLDesc(''); setLServer(''); setPreview(null);
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
        <Card>
          <div className="flex gap-2 mb-4">
            <Button variant={mode === 'upload' ? 'primary' : 'ghost'} onClick={() => setMode('upload')}><Upload size={13} className="inline mr-1" />Upload zip</Button>
            <Button variant={mode === 'link' ? 'primary' : 'ghost'} onClick={() => setMode('link')}><Link2 size={13} className="inline mr-1" />Add link</Button>
          </div>

          {mode === 'upload' ? (
            <>
              <div className="grid md:grid-cols-4 gap-3 items-end">
                <Field label="Type"><Select value={kind} onChange={(e) => setKind(e.target.value)}><option value="car">Car</option><option value="track">Track</option><option value="mod">Other</option></Select></Field>
                <Field label="Display name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
                <Field label="Zip file"><input ref={fileRef} type="file" accept=".zip" className="text-xs file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:bg-accent file:text-foreground" /></Field>
                <Button onClick={upload} disabled={busy}><Upload size={13} className="inline mr-1" />{busy ? 'Uploading…' : 'Upload'}</Button>
              </div>
              <div className="mt-3"><Check label="Offer on public download page" checked={publicDl} onChange={setPublicDl} /></div>
            </>
          ) : (
            <>
              <Field label="Download page URL" hint="Link to the mod (RaceDepartment, assettoworld, etc.) — metadata is fetched automatically">
                <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://www.assettoworld.com/car/…" />
              </Field>
              {previewing && <div className="text-xs text-muted mt-2">Fetching preview…</div>}
              {preview && (
                <div className="flex gap-3 mt-3 bg-background border border-border rounded p-2">
                  {preview.image && <img src={preview.image} alt="" className="w-24 h-16 object-cover rounded shrink-0" />}
                  <div className="min-w-0 text-xs">
                    <div className="font-medium truncate">{preview.title}</div>
                    <div className="text-muted">{preview.siteName || domainOf(preview.url)}</div>
                    {preview.description && <div className="text-muted line-clamp-2 mt-0.5">{preview.description}</div>}
                  </div>
                </div>
              )}
              <div className="grid md:grid-cols-4 gap-3 items-end mt-3">
                <Field label="Name"><Input value={lName} onChange={(e) => setLName(e.target.value)} /></Field>
                <Field label="Type"><Select value={lKind} onChange={(e) => setLKind(e.target.value)}><option value="car">Car</option><option value="track">Track</option><option value="mod">Other</option></Select></Field>
                <Field label="Version"><Input value={lVersion} onChange={(e) => setLVersion(e.target.value)} placeholder="1.0" /></Field>
                <Field label="Content id" hint="must equal the car/track folder name, e.g. ks_porsche_911_gt3_r"><Input value={lContentId} onChange={(e) => setLContentId(e.target.value)} placeholder="ks_porsche_911_gt3_r" /></Field>
                <Field label="Preview image URL"><Input value={lImage} onChange={(e) => setLImage(e.target.value)} /></Field>
                <Field label="Server scope" hint="empty = all AC servers"><Select value={lServer} onChange={(e) => setLServer(e.target.value)}><option value="">All servers</option>{servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
                <Field label="Description"><Input value={lDesc} onChange={(e) => setLDesc(e.target.value)} /></Field>
                <Button onClick={saveLink} disabled={busy}><Link2 size={13} className="inline mr-1" />{busy ? 'Saving…' : 'Save link'}</Button>
              </div>
              <div className="mt-3"><Check label="Offer on public download page" checked={lPublic} onChange={setLPublic} /></div>
            </>
          )}
          {err && <div className="text-sm text-red-400 mt-2">{err}</div>}
        </Card>

        <Card title={`Mods (${items.length})`}>
          {items.length === 0 && <div className="text-sm text-muted">Nothing uploaded yet.</div>}
          <div className="space-y-1">
            {items.map((it) => {
              const external = it.source_type === 'external';
              return (
                <div key={it.id} className="flex items-center gap-3 bg-background border border-border rounded px-3 py-2 text-sm flex-wrap">
                  {it.preview_image
                    ? <img src={it.preview_image} alt="" className="w-12 h-8 object-cover rounded shrink-0" />
                    : <Package size={14} className="text-muted shrink-0" />}
                  <div className="flex-1 min-w-[12rem]">
                    <div>{it.name} {it.version && <span className="text-xs text-muted">v{it.version}</span>}</div>
                    <div className="text-xs text-muted">{it.kind}{it.content_id ? ` · ${it.content_id}` : ''}{it.size ? ` · ${(it.size / 1e6).toFixed(1)} MB` : ''}</div>
                  </div>
                  {external ? <Badge tone="blue">{domainOf(it.external_url) || 'external'}</Badge> : <Badge>hosted</Badge>}
                  {it.is_public_download ? <Badge tone="green">public</Badge> : <Badge>private</Badge>}
                  <div className="flex items-center gap-1">
                    {!external && (
                      <>
                        <Select className="w-44" value={installTarget[it.id] || ''} onChange={(e) => setInstallTarget((m) => ({ ...m, [it.id]: e.target.value }))}>
                          <option value="">install into…</option>
                          {servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </Select>
                        <Button variant="ghost" disabled={!installTarget[it.id]} onClick={() => install(it.id)}><ArrowRight size={13} /></Button>
                      </>
                    )}
                    <Button variant="ghost" onClick={async () => { await api.patch(`/content/${it.id}`, { publicDownload: !it.is_public_download }); load(); }}><Download size={13} /></Button>
                    <Button variant="ghost" onClick={async () => { if (confirm(`Delete ${it.name}?`)) { await api.delete(`/content/${it.id}`); load(); } }}><Trash2 size={13} /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
