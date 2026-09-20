import React, { useEffect, useRef, useState } from 'react';
import { api, ContentItem, GameServer, contentApi, LinkPreview } from '../api';
import { Card, Button, Select, Field, Input, Check, Badge, PageHeader, ConfirmDialog, EmptyState, useToast } from '../components/ui';
import { Upload, Package, Trash2, ArrowRight, Link2, Search } from 'lucide-react';
import { clsx } from 'clsx';

// Global mod library — uploads live here and can be installed into any
// ac / ac_modded server on demand. External links are served to players
// via Content Manager's cm_content.json.

function domainOf(url?: string) {
  try { return url ? new URL(url).hostname.replace(/^www\./, '') : ''; } catch { return ''; }
}

const KINDS = ['all', 'car', 'track', 'mod'];

export default function ContentPage() {
  const toast = useToast();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [servers, setServers] = useState<GameServer[]>([]);
  const [mode, setMode] = useState<'upload' | 'link'>('upload');
  const [kind, setKind] = useState('car');
  const [name, setName] = useState('');
  const [publicDl, setPublicDl] = useState(true);
  const [busy, setBusy] = useState(false);
  const [installTarget, setInstallTarget] = useState<Record<string, string>>({});
  const [deleteItem, setDeleteItem] = useState<ContentItem | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // library filters
  const [kindFilter, setKindFilter] = useState('all');
  const [search, setSearch] = useState('');

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
    if (!f) return toast.error('Choose a .zip file first');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('kind', kind);
      fd.append('name', name || f.name.replace(/\.zip$/i, ''));
      fd.append('publicDownload', String(publicDl));
      await api.post('/content', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (fileRef.current) fileRef.current.value = '';
      setName('');
      toast.success('Content uploaded');
      await load();
    } catch (e: any) { toast.error(e.message); }
    setBusy(false);
  };

  const saveLink = async () => {
    if (!/^https?:\/\//i.test(linkUrl)) return toast.error('Enter a valid https:// link');
    if (!lName) return toast.error('Name required');
    setBusy(true);
    try {
      await contentApi.link({
        kind: lKind, name: lName, version: lVersion || undefined, url: linkUrl,
        contentId: lContentId || undefined, description: lDesc || undefined,
        previewImage: lImage || undefined, serverId: lServer || undefined, publicDownload: lPublic,
      });
      setLinkUrl(''); setLName(''); setLVersion(''); setLContentId(''); setLImage(''); setLDesc(''); setLServer(''); setPreview(null);
      toast.success('Link saved');
      await load();
    } catch (e: any) { toast.error(e.message); }
    setBusy(false);
  };

  const install = async (id: string) => {
    const target = installTarget[id];
    if (!target) return;
    try {
      await api.post(`/content/${id}/install`, { serverId: target });
      toast.success('Installed to server');
      await load();
    } catch (e: any) { toast.error(e.message); }
  };

  const filtered = items.filter((it) => {
    if (kindFilter !== 'all' && it.kind !== kindFilter) return false;
    if (search && !`${it.name} ${it.content_id ?? ''}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const segBtn = (active: boolean) => clsx(
    'flex-1 h-9 rounded-lg text-sm font-medium transition-colors duration-150 flex items-center justify-center gap-1.5',
    active ? 'bg-brand text-white' : 'text-muted hover:text-foreground'
  );

  return (
    <>
      <PageHeader eyebrow="Library" title="Content" description="Cars, tracks and other mods — hosted zips or external links." />

      <div className="grid gap-5 lg:grid-cols-[340px_1fr] items-start">
        {/* Add content */}
        <Card title="Add content" subtitle="New item">
          <div className="flex bg-card-2 border border-border rounded-lg p-1 gap-1 mb-4">
            <button className={segBtn(mode === 'upload')} onClick={() => setMode('upload')}><Upload size={14} /> Upload zip</button>
            <button className={segBtn(mode === 'link')} onClick={() => setMode('link')}><Link2 size={14} /> Add link</button>
          </div>

          {mode === 'upload' ? (
            <div className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); if (fileRef.current && e.dataTransfer.files.length) { fileRef.current.files = e.dataTransfer.files; } }}
                onClick={() => fileRef.current?.click()}
                className={clsx(
                  'border-2 border-dashed rounded-xl py-8 text-center cursor-pointer transition-colors',
                  dragOver ? 'border-primary bg-primary/5' : 'border-border-strong hover:border-primary/50'
                )}
              >
                <Upload size={20} className="mx-auto text-muted mb-2" />
                <div className="text-sm">Drop a .zip here or click to browse</div>
                <div className="text-xs text-muted mt-1">Car, track or misc mod archive</div>
                <input ref={fileRef} type="file" accept=".zip" className="hidden" onClick={(e) => e.stopPropagation()} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type"><Select value={kind} onChange={(e) => setKind(e.target.value)}><option value="car">Car</option><option value="track">Track</option><option value="mod">Other</option></Select></Field>
                <Field label="Display name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
              </div>
              <Check label="Offer on public download page" checked={publicDl} onChange={setPublicDl} />
              <Button onClick={upload} loading={busy} icon={<Upload size={14} />} className="w-full">{busy ? 'Uploading…' : 'Upload'}</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Field label="Download page URL" hint="Metadata is fetched automatically">
                <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://www.assettoworld.com/car/…" />
              </Field>
              {previewing && <div className="text-xs text-muted">Fetching preview…</div>}
              {preview && (
                <div className="flex gap-3 bg-card-2 border border-border rounded-lg p-2.5">
                  {preview.image && <img src={preview.image} alt="" className="w-20 h-14 object-cover rounded shrink-0" />}
                  <div className="min-w-0 text-xs">
                    <div className="font-medium truncate">{preview.title}</div>
                    <div className="text-muted">{preview.siteName || domainOf(preview.url)}</div>
                    {preview.description && <div className="text-muted line-clamp-2 mt-0.5">{preview.description}</div>}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name"><Input value={lName} onChange={(e) => setLName(e.target.value)} /></Field>
                <Field label="Type"><Select value={lKind} onChange={(e) => setLKind(e.target.value)}><option value="car">Car</option><option value="track">Track</option><option value="mod">Other</option></Select></Field>
                <Field label="Version"><Input value={lVersion} onChange={(e) => setLVersion(e.target.value)} placeholder="1.0" /></Field>
                <Field label="Content id" hint="Folder name in-game"><Input mono value={lContentId} onChange={(e) => setLContentId(e.target.value)} placeholder="ks_porsche_911_gt3_r" /></Field>
              </div>
              <Field label="Preview image URL"><Input value={lImage} onChange={(e) => setLImage(e.target.value)} /></Field>
              <Field label="Server scope" hint="Empty = all AC servers"><Select value={lServer} onChange={(e) => setLServer(e.target.value)}><option value="">All servers</option>{servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              <Field label="Description"><Input value={lDesc} onChange={(e) => setLDesc(e.target.value)} /></Field>
              <Check label="Offer on public download page" checked={lPublic} onChange={setLPublic} />
              <Button onClick={saveLink} loading={busy} icon={<Link2 size={14} />} className="w-full">{busy ? 'Saving…' : 'Save link'}</Button>
            </div>
          )}
        </Card>

        {/* Library */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1.5">
              {KINDS.map((k) => (
                <button key={k} onClick={() => setKindFilter(k)}
                        className={clsx('px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                          kindFilter === k ? 'bg-primary text-white border-primary' : 'border-border text-muted hover:text-foreground')}>
                  {k === 'all' ? 'All' : k === 'car' ? 'Cars' : k === 'track' ? 'Tracks' : 'Other'}
                </button>
              ))}
            </div>
            <div className="relative ml-auto">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="pl-8 h-8 w-48 text-xs" />
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={<Package size={20} />} title="Nothing here" description={items.length ? 'No items match the filters.' : 'Upload a mod zip or add an external link to get started.'} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filtered.map((it) => {
                const external = it.source_type === 'external';
                return (
                  <div key={it.id} className="bg-card border border-border rounded-xl p-4 flex gap-3 hover:border-border-strong transition-colors">
                    {it.preview_image
                      ? <img src={it.preview_image} alt={it.name} className="w-16 h-11 object-cover rounded-lg shrink-0" />
                      : <div className="w-16 h-11 rounded-lg bg-accent grid place-items-center shrink-0"><Package size={16} className="text-muted" /></div>}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{it.name} {it.version && <span className="text-xs text-muted">v{it.version}</span>}</div>
                      <div className="text-xs text-muted truncate mt-0.5">{it.kind}{it.content_id ? ` · ${it.content_id}` : ''}{it.size ? ` · ${(it.size / 1e6).toFixed(1)} MB` : ''}</div>
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <Badge tone={external ? 'blue' : 'neutral'}>{external ? domainOf(it.external_url) || 'external' : 'hosted'}</Badge>
                        <button onClick={async () => { await api.patch(`/content/${it.id}`, { publicDownload: !it.is_public_download }); load(); }}
                                title="Toggle public download" className="focus-visible:outline-none">
                          <Badge tone={it.is_public_download ? 'green' : 'neutral'} dot>{it.is_public_download ? 'public' : 'private'}</Badge>
                        </button>
                        <button onClick={() => setDeleteItem(it)} className="ml-auto text-muted hover:text-danger transition-colors" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                      {!external && (
                        <div className="flex items-center gap-1.5 mt-2.5">
                          <Select className="h-7 text-xs flex-1" value={installTarget[it.id] || ''} onChange={(e) => setInstallTarget((m) => ({ ...m, [it.id]: e.target.value }))}>
                            <option value="">Install into…</option>
                            {servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </Select>
                          <Button variant="secondary" size="sm" disabled={!installTarget[it.id]} onClick={() => install(it.id)} icon={<ArrowRight size={12} />} aria-label="Install" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {deleteItem && (
        <ConfirmDialog
          danger title={`Delete "${deleteItem.name}"?`}
          body="Removes the library entry and any hosted file. Installed copies on servers are kept."
          confirmLabel="Delete"
          onCancel={() => setDeleteItem(null)}
          onConfirm={async () => {
            try {
              await api.delete(`/content/${deleteItem.id}`);
              toast.success('Deleted');
              load();
            } catch (e: any) { toast.error(e.message); }
            setDeleteItem(null);
          }}
        />
      )}
    </>
  );
}
