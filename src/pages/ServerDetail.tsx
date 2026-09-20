import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, GameServer } from '../api';
import { Card, Badge, Button, Tabs, Input, Field, Check, Banner, ConfirmDialog, useToast } from '../components/ui';
import { Play, Square, RefreshCw, Box, Trash2, Copy, MoreVertical, ArrowLeft, ChevronUp, ChevronDown } from 'lucide-react';
import AccConfigForm from '../components/server/AccConfigForm';
import AcConfigForm from '../components/server/AcConfigForm';
import EntriesEditor from '../components/server/EntriesEditor';
import FileBrowser from '../components/server/FileBrowser';
import LogViewer from '../components/server/LogViewer';
import ModInstaller from '../components/server/ModInstaller';
import LiveView, { LiveSnapshot, TrackMap, fmtMs } from '../components/live/LiveView';

const TYPE_LABEL: Record<string, string> = { ac: 'Assetto Corsa', ac_modded: 'AC Modded', assettoserver: 'AssettoServer', acc: 'ACC' };

export default function ServerDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [server, setServer] = useState<GameServer | null>(null);
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [keepFiles, setKeepFiles] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/servers/${id}`);
      setServer(data.server);
    } catch (e: any) {
      toast.error(e.message);
    }
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (action: string) => {
    setBusy(action);
    try {
      await api.post(`/servers/${id}/${action}`);
      toast.success(`${action} done`);
      await load();
    } catch (e: any) { toast.error(e.message); }
    setBusy('');
  };

  const saveConfig = async (config: any, ports?: any) => {
    setBusy('save');
    try {
      await api.put(`/servers/${id}/config`, { config, ports });
      toast.success('Configuration saved');
      await load();
    } catch (e: any) { toast.error(e.message); }
    setBusy('');
  };

  const del = async () => {
    setBusy('delete');
    try {
      await api.delete(`/servers/${id}${keepFiles ? '?keepFiles=1' : ''}`);
      nav('/admin');
    } catch (e: any) { toast.error(e.message); setBusy(''); }
  };

  const copy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(''), 1500);
  };

  if (!server) return <div className="text-muted">Loading…</div>;
  const running = !!server.live?.running;
  const isLocal = server.runtime === 'local';
  const exeMissing = isLocal && server.exePresent === false;
  const canStart = isLocal ? server.exePresent === true : !!server.container_id;
  const exeName = server.exePath?.split(/[\\/]/).pop() || 'acServer.exe';
  const exeDir = server.exePath?.replace(/[^\\/]+$/, '') || server.data_dir;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'config', label: 'Configuration' },
    { id: 'entries', label: server.type === 'acc' ? 'Entry List & BoP' : 'Entry List' },
    ...(server.type !== 'acc' ? [{ id: 'live', label: 'Live' }] : []),
    { id: 'results', label: 'Results' },
    ...(server.type === 'ac_modded' || server.type === 'assettoserver' ? [{ id: 'content', label: 'Mod Content' }] : []),
    { id: 'files', label: 'Files' },
    { id: 'logs', label: 'Logs' },
  ];

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <Link to="/admin" className="text-xs text-muted hover:text-foreground flex items-center gap-1 mb-1"><ArrowLeft size={12} /> Dashboard</Link>
          <h1 className="text-2xl font-bold font-display">{server.name}</h1>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <Badge tone="brand">{TYPE_LABEL[server.type]}</Badge>
            <Badge>{isLocal ? 'Local' : 'Docker'}</Badge>
            {running
              ? <Badge tone="green" dot>running</Badge>
              : <Badge tone="red" dot>{server.live?.state || 'stopped'}</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {running ? (
            <>
              <Button variant="danger" size="sm" icon={<Square size={12} />} loading={busy === 'stop'} disabled={!!busy} onClick={() => act('stop')}>Stop</Button>
              <Button variant="secondary" size="sm" icon={<RefreshCw size={12} />} loading={busy === 'restart'} disabled={!!busy} onClick={() => act('restart')}>Restart</Button>
            </>
          ) : (
            <>
              <Button variant="success" size="sm" icon={<Play size={12} />} loading={busy === 'start'} disabled={!!busy || !canStart} onClick={() => act('start')}>Start</Button>
              <Button variant="outline" size="sm" icon={<Box size={12} />} loading={busy === 'provision'} disabled={!!busy} onClick={() => act('provision')}>
                {isLocal ? 'Verify executable' : (server.container_id ? 'Re-provision' : 'Provision')}
              </Button>
            </>
          )}
          <div className="relative">
            <Button variant="ghost" size="sm" icon={<MoreVertical size={14} />} onClick={() => setMoreOpen(!moreOpen)} aria-label="More actions" />
            {moreOpen && (
              <div className="absolute right-0 mt-1 w-40 bg-card-2 border border-border rounded-lg shadow-xl z-20 py-1">
                <button className="w-full text-left px-3 py-2 text-sm text-danger hover:bg-accent flex items-center gap-2"
                        onClick={() => { setMoreOpen(false); setConfirmDelete(true); }}>
                  <Trash2 size={13} /> Delete server
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-3">
      {server.type === 'acc' && !server.accExePresent && (
        <Banner tone="warning">
          <code className="font-mono">accServer.exe</code> not found. Download the ACC Dedicated Server tool in Steam, then drop the exe into <code className="font-mono">acc/</code> via the Files tab.
        </Banner>
      )}
      {exeMissing && server.type !== 'acc' && (
        <Banner tone="warning">
          <code className="font-mono">{exeName}</code> not found. Place it plus the game <code className="font-mono">content/</code> folder at <code className="font-mono">{exeDir}</code>
        </Banner>
      )}
      {running && <Banner tone="info">Server is running — stop it to edit configuration.</Banner>}
      </div>

      <Tabs items={tabs} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card title="Status" subtitle="Live">
              <dl className="text-sm space-y-2.5">
                <Row k="State" v={server.live?.state || 'unknown'} />
                <Row k="Track" v={server.live?.track || '—'} />
                <Row k="Players" v={server.live?.players != null ? `${server.live.players}${server.live.maxPlayers ? ` / ${server.live.maxPlayers}` : ''}` : '—'} />
                <Row k="Started" v={server.live?.startedAt ? new Date(server.live.startedAt).toLocaleString() : '—'} />
                {server.live?.note && <Row k="Note" v={server.live.note} />}
              </dl>
            </Card>
            <Card title="Connection" subtitle="Network">
              <dl className="text-sm space-y-2.5">
                <Row k="Game port" v={`${server.ports.game} (TCP+UDP)`} mono />
                {server.ports.http ? <Row k="HTTP port" v={String(server.ports.http)} mono /> : null}
                {server.ports.plugin ? <Row k="Plugin port" v={String(server.ports.plugin)} mono /> : null}
                <Row k="Lobby" v={server.type === 'acc' ? (server.config?.settings?.registerToLobby !== 0 && server.config?.configuration?.registerToLobby !== 0 ? 'registered' : 'hidden') : (server.config?.server?.registerToLobby ? 'registered' : 'hidden')} />
              </dl>
              <div className="flex flex-wrap gap-2 mt-3">
                {[['game', String(server.ports.game)], ...(server.ports.http ? [['http', String(server.ports.http)]] : []), ['dir', server.data_dir], ['exe', server.exePath || '']].filter((x) => x[1]).map(([k, v]) => (
                  <button key={k} onClick={() => copy(k, v)} className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-foreground border border-border rounded px-2 py-1">
                    <Copy size={10} />{copied === k ? 'copied' : `copy ${k}`}
                  </button>
                ))}
              </div>
            </Card>
            <Card title="Paths" subtitle="Storage">
              <dl className="text-sm space-y-2.5">
                <Row k="Data dir" v={server.data_dir} mono />
                {isLocal && <Row k="Executable" v={server.exePath || '—'} mono />}
                {!isLocal && <Row k="Container" v={server.container_name || '—'} mono />}
              </dl>
            </Card>
            <Card title="Public" subtitle="Visibility">
              <div className="space-y-3">
                <Check label="Show on public page" checked={server.is_public} onChange={async (v) => { await api.put(`/servers/${id}/config`, { isPublic: v }); load(); }} hint="Lists this server on the community page with live status" />
                <Field label="Public blurb">
                  <Input
                    defaultValue={server.public_blurb || ''}
                    onBlur={(e) => api.put(`/servers/${id}/config`, { publicBlurb: e.target.value }).then(load)}
                    placeholder="Casual racing, all skill levels welcome"
                  />
                </Field>
              </div>
            </Card>
          </div>
          <Card title="Danger zone" className="border-danger/40">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <p className="text-sm text-muted">Delete this server — removes the container and optionally all server files. Can't be undone.</p>
              <Button variant="danger" size="sm" icon={<Trash2 size={12} />} onClick={() => setConfirmDelete(true)}>Delete server</Button>
            </div>
          </Card>
        </div>
      )}

      {tab === 'config' && (
        server.type === 'acc'
          ? <AccConfigForm server={server} disabled={running || !!busy} onSave={saveConfig} />
          : <AcConfigForm server={server} disabled={running || !!busy} onSave={saveConfig} />
      )}

      {tab === 'entries' && <EntriesEditor server={server} disabled={running || !!busy} onSave={saveConfig} />}
      {tab === 'live' && <LiveTab server={server} />}
      {tab === 'results' && <ResultsTab server={server} />}
      {tab === 'content' && <ModInstaller server={server} onChanged={load} />}
      {tab === 'files' && <FileBrowser serverId={server.id} />}
      {tab === 'logs' && <LogViewer serverId={server.id} />}

      {confirmDelete && (
        <ConfirmDialog
          danger title={`Delete "${server.name}"?`}
          confirmLabel={busy === 'delete' ? 'Deleting…' : 'Delete server'}
          body={
            <div className="space-y-3">
              <p>Removes the container and all server files.</p>
              <Check label="Keep server files on disk" checked={keepFiles} onChange={setKeepFiles} />
            </div>
          }
          onCancel={() => setConfirmDelete(false)}
          onConfirm={del}
        />
      )}
    </div>
  );
}

function LiveTab({ server }: { server: GameServer }) {
  const toast = useToast();
  const [snap, setSnap] = useState<LiveSnapshot>({ active: false });
  const [trackMap, setTrackMap] = useState<TrackMap | null>(null);
  const [chat, setChat] = useState('');
  const [cmd, setCmd] = useState('');
  const [kickId, setKickId] = useState<number | null>(null);

  useEffect(() => {
    let dead = false;
    const load = async () => {
      try {
        const { data } = await api.get(`/servers/${server.id}/telemetry`);
        if (!dead) setSnap(data);
      } catch { /* keep polling */ }
    };
    load();
    const t = setInterval(load, 2000);
    api.get(`/public/track-map/${server.id}`).then((r) => { if (!dead) setTrackMap(r.data); }).catch(() => {});
    return () => { dead = true; clearInterval(t); };
  }, [server.id]);

  const act = async (path: string, body?: any) => {
    try {
      await api.post(`/servers/${server.id}/telemetry/${path}`, body || {});
      toast.success('Sent');
    } catch (e: any) { toast.error(e.message); }
  };

  const session = snap.session;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-sm text-muted">
          {snap.active
            ? <>{session ? `${session.name} · ${session.typeName}` : 'listening'}{session?.track ? ` — ${session.track}${session.trackConfig ? `/${session.trackConfig}` : ''}` : ''}</>
            : 'Telemetry not active — start the server with live telemetry enabled.'}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Input className="w-56" placeholder="Broadcast chat…" value={chat} onChange={(e) => setChat(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && chat) { act('chat', { message: chat }); setChat(''); } }} />
          <Button variant="secondary" size="sm" disabled={!chat} onClick={() => { act('chat', { message: chat }); setChat(''); }}>Send</Button>
          <Button variant="secondary" size="sm" onClick={() => act('next-session')}>Next session</Button>
          <Button variant="secondary" size="sm" onClick={() => act('restart-session')}>Restart session</Button>
        </div>
      </div>
      <div className="h-[32rem]">
        <LiveView snap={snap} trackMap={trackMap} onKick={(carId) => setKickId(carId)} />
      </div>
      <div className="flex items-center gap-2">
        <Input className="w-72" placeholder="Admin command (e.g. /ballast 3 20)" value={cmd} onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && cmd) { act('admin', { command: cmd }); setCmd(''); } }} />
        <Button variant="outline" size="sm" disabled={!cmd} onClick={() => { act('admin', { command: cmd }); setCmd(''); }}>Run admin command</Button>
      </div>
      {kickId != null && (
        <ConfirmDialog
          danger title={`Kick car ${kickId}?`} confirmLabel="Kick"
          body="The driver will be removed from the session."
          onCancel={() => setKickId(null)}
          onConfirm={() => { act('kick', { carId: kickId }); setKickId(null); }}
        />
      )}
    </div>
  );
}

function ResultsTab({ server }: { server: GameServer }) {
  const [list, setList] = useState<any[]>([]);
  const [sel, setSel] = useState<any | null>(null);
  const [expandLaps, setExpandLaps] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.get(`/servers/${server.id}/results`).then((r) => setList(r.data.results)).catch(() => setList([]));
  }, [server.id]);

  const open = async (id: string) => {
    try {
      const { data } = await api.get(`/servers/${server.id}/results/${id}`);
      setSel(data);
      setExpandLaps({});
    } catch { /* ignore */ }
  };

  if (sel) {
    return (
      <div className="space-y-3">
        <button className="text-xs text-muted hover:text-foreground flex items-center gap-1" onClick={() => setSel(null)}><ArrowLeft size={12} /> Back to results</button>
        <Card title={`${sel.type} — ${sel.track || '?'}`} subtitle={new Date(sel.date).toLocaleString()}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted border-b border-border">
                <th className="px-2 py-1.5 w-8">P</th><th className="px-2 py-1.5">Driver</th><th className="px-2 py-1.5">Car</th>
                <th className="px-2 py-1.5 text-right">Laps</th><th className="px-2 py-1.5 text-right">Best</th>
                <th className="px-2 py-1.5 text-right">Total</th><th className="px-2 py-1.5 text-right">Gap</th><th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {(sel.results || []).map((r: any, i: number) => (
                <React.Fragment key={i}>
                  <tr className="border-b border-border/50">
                    <td className="px-2 py-1.5 font-bold tabular-nums">{r.position}</td>
                    <td className="px-2 py-1.5">{r.driverName || '—'}{r.team ? <span className="text-muted"> · {r.team}</span> : ''}</td>
                    <td className="px-2 py-1.5 text-muted">{r.carModel || '—'}{r.raceNumber ? ` #${r.raceNumber}` : ''}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.lapCount}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtMs(r.bestLapMs)}</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtMs(r.totalTimeMs)}</td>
                    <td className="px-2 py-1.5 text-right text-muted font-mono">{r.gapMs != null ? `+${fmtMs(r.gapMs)}` : ''}</td>
                    <td className="px-2 py-1.5">
                      <button className="text-[10px] text-primary hover:underline flex items-center gap-0.5" onClick={() => setExpandLaps((m) => ({ ...m, [r.driverName]: !m[r.driverName] }))}>
                        {expandLaps[r.driverName] ? <>hide <ChevronUp size={10} /></> : <>laps <ChevronDown size={10} /></>}
                      </button>
                    </td>
                  </tr>
                  {expandLaps[r.driverName] && (
                    <tr><td colSpan={8} className="px-4 py-2 bg-card-2">
                      <div className="grid grid-cols-4 md:grid-cols-6 gap-1 font-mono text-[11px] tabular-nums">
                        {(sel.laps || []).filter((l: any) => l.driverName === r.driverName).map((l: any, j: number) => (
                          <span key={j} className={l.valid ? '' : 'text-danger line-through'}>{fmtMs(l.lapTimeMs)}{l.cuts ? ` (${l.cuts}x)` : ''}</span>
                        ))}
                      </div>
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    );
  }

  return (
    <Card title="Session results" subtitle={`${list.length} files`}>
      {list.length === 0 && <div className="text-sm text-muted">No result files yet — they appear after sessions end.</div>}
      <div className="space-y-1.5">
        {list.map((r) => (
          <button key={r.id} onClick={() => open(r.id)} className="w-full flex items-center gap-3 bg-card-2 border border-border rounded-lg px-3 py-2.5 text-sm hover:border-primary/60 text-left transition-colors">
            <Badge tone={r.type === 'race' ? 'red' : r.type === 'qualify' ? 'blue' : 'neutral'}>{r.type}</Badge>
            <span className="flex-1 truncate">{r.track || '?'}</span>
            <span className="text-xs text-muted">{new Date(r.date).toLocaleString()}</span>
            <span className="text-xs text-muted">{r.driverCount} drivers{r.winner ? ` · winner: ${r.winner}` : ''}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted shrink-0">{k}</dt>
      <dd className={mono ? 'font-mono text-xs tabular-nums truncate text-right' : 'text-right'} title={v}>{v}</dd>
    </div>
  );
}
