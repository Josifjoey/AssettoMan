import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, GameServer } from '../api';
import { Card, Badge, Button, Tabs, Input, Field, Check } from '../components/ui';
import { Play, Square, RefreshCw, Box, Trash2, AlertTriangle } from 'lucide-react';
import AccConfigForm from '../components/server/AccConfigForm';
import AcConfigForm from '../components/server/AcConfigForm';
import EntriesEditor from '../components/server/EntriesEditor';
import FileBrowser from '../components/server/FileBrowser';
import LogViewer from '../components/server/LogViewer';
import ModInstaller from '../components/server/ModInstaller';

export default function ServerDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [server, setServer] = useState<GameServer | null>(null);
  const [tab, setTab] = useState('overview');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/servers/${id}`);
      setServer(data.server);
    } catch (e: any) {
      setErr(e.message);
    }
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (action: string) => {
    setBusy(true); setErr(''); setMsg('');
    try {
      await api.post(`/servers/${id}/${action}`);
      setMsg(`${action} done`);
      await load();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  const saveConfig = async (config: any, ports?: any) => {
    setBusy(true); setErr(''); setMsg('');
    try {
      await api.put(`/servers/${id}/config`, { config, ports });
      setMsg('Configuration saved');
      await load();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  const del = async () => {
    setBusy(true);
    try {
      await api.delete(`/servers/${id}`);
      nav('/');
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };

  if (!server) return <div className="text-muted">{err || 'Loading…'}</div>;
  const running = !!server.live?.running;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'config', label: 'Configuration' },
    { id: 'entries', label: server.type === 'acc' ? 'Entry List & BoP' : 'Entry List' },
    ...(server.type === 'ac_modded' ? [{ id: 'content', label: 'Mod Content' }] : []),
    { id: 'files', label: 'Files' },
    { id: 'logs', label: 'Logs' },
    { id: 'danger', label: 'Danger' },
  ];

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <Link to="/" className="text-xs text-muted hover:text-foreground">← Dashboard</Link>
          <h1 className="text-xl font-bold flex items-center gap-3">
            {server.name}
            {running ? <Badge tone="green">running</Badge> : <Badge tone="red">{server.live?.state || 'stopped'}</Badge>}
          </h1>
        </div>
        <div className="flex gap-2">
          {running ? (
            <>
              <Button variant="danger" onClick={() => act('stop')} disabled={busy}><Square size={13} className="inline mr-1" />Stop</Button>
              <Button variant="ghost" onClick={() => act('restart')} disabled={busy}><RefreshCw size={13} className="inline mr-1" />Restart</Button>
            </>
          ) : (
            <>
              <Button variant="success" onClick={() => act('start')} disabled={busy || !server.container_id}><Play size={13} className="inline mr-1" />Start</Button>
              <Button variant="outline" onClick={() => act('provision')} disabled={busy}><Box size={13} className="inline mr-1" />{server.container_id ? 'Re-provision' : 'Provision container'}</Button>
            </>
          )}
        </div>
      </div>

      {server.type === 'acc' && !server.accExePresent && (
        <div className="mb-4 flex items-start gap-2 text-amber-300 bg-amber-900/30 border border-amber-800 rounded p-3 text-sm">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span><code>accServer.exe</code> not found. Download the ACC Dedicated Server tool in Steam, then drop the exe into <code>acc/</code> via the Files tab or your appdata share.</span>
        </div>
      )}
      {running && <div className="mb-4 text-xs text-muted">Server is running — stop it to edit configuration.</div>}
      {err && <div className="mb-3 text-sm text-red-400">{err}</div>}
      {msg && <div className="mb-3 text-sm text-emerald-400">{msg}</div>}

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card title="Status">
            <dl className="text-sm space-y-2">
              <Row k="State" v={server.live?.state || 'unknown'} />
              <Row k="Track" v={server.live?.track || '—'} />
              <Row k="Players" v={server.live?.players != null ? `${server.live.players}${server.live.maxPlayers ? ` / ${server.live.maxPlayers}` : ''}` : '—'} />
              <Row k="Container" v={server.container_name || '—'} mono />
              <Row k="Game port" v={String(server.ports.game)} />
              {server.ports.http ? <Row k="HTTP port" v={String(server.ports.http)} /> : null}
              {server.live?.note && <Row k="Note" v={server.live.note} />}
            </dl>
          </Card>
          <Card title="Visibility">
            <div className="space-y-3">
              <Check label="Show on public page" checked={server.is_public} onChange={async (v) => { await api.put(`/servers/${id}/config`, { isPublic: v }); load(); }} hint="Lists this server on /public with live status" />
              <Field label="Public blurb">
                <Input
                  defaultValue={server.public_blurb || ''}
                  onBlur={(e) => api.put(`/servers/${id}/config`, { publicBlurb: e.target.value }).then(load)}
                  placeholder="Casual racing, all skill levels welcome"
                />
              </Field>
            </div>
          </Card>
          <Card title="Connect" className="md:col-span-2">
            <p className="text-sm text-muted">
              Players connect via the server browser (lobby registration {server.type === 'acc' ? (server.config?.settings?.registerToLobby !== 0 && server.config?.configuration?.registerToLobby !== 0 ? 'enabled' : 'disabled') : (server.config?.server?.registerToLobby ? 'enabled' : 'disabled')}) or direct IP on port {server.ports.game} (TCP+UDP).
            </p>
          </Card>
        </div>
      )}

      {tab === 'config' && (
        server.type === 'acc'
          ? <AccConfigForm server={server} disabled={running || busy} onSave={saveConfig} />
          : <AcConfigForm server={server} disabled={running || busy} onSave={saveConfig} />
      )}

      {tab === 'entries' && (
        <EntriesEditor server={server} disabled={running || busy} onSave={saveConfig} />
      )}

      {tab === 'content' && <ModInstaller server={server} onChanged={load} />}

      {tab === 'files' && <FileBrowser serverId={server.id} />}

      {tab === 'logs' && <LogViewer serverId={server.id} />}

      {tab === 'danger' && (
        <Card title="Delete server" className="max-w-lg">
          <p className="text-sm text-muted mb-3">Removes the container and (optionally) all server files. This can't be undone.</p>
          {!confirmDelete ? (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}><Trash2 size={13} className="inline mr-1" />Delete server</Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="danger" onClick={del} disabled={busy}>Yes, delete everything</Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className={mono ? 'font-mono text-xs' : ''}>{v}</dd>
    </div>
  );
}
