import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api, GameServer } from '../api';
import { Badge, Button, StatTile, PageHeader, EmptyState, Banner, useToast } from '../components/ui';
import { Play, Square, RefreshCw, Plus, MapPin, Users, Server, Radio, Container, Terminal } from 'lucide-react';
import { useSystemHealth } from '../hooks';
import { clsx } from 'clsx';

const TYPE_LABEL: Record<string, string> = { ac: 'Assetto Corsa', ac_modded: 'AC Modded', assettoserver: 'AssettoServer', acc: 'ACC' };

function stateOf(s: GameServer): 'running' | 'stopped' | 'warn' | 'unknown' {
  const live = s.live;
  if (!live) return 'unknown';
  if (live.state === 'not_provisioned' || live.state === 'missing') return 'warn';
  return live.running ? 'running' : 'stopped';
}

function StateBadge({ s }: { s: GameServer }) {
  const st = stateOf(s);
  if (st === 'unknown') return <Badge>unknown</Badge>;
  if (st === 'warn') return <Badge tone="amber" dot>{s.live!.state === 'not_provisioned' ? 'not provisioned' : 'container missing'}</Badge>;
  if (st === 'running') return <Badge tone="green" dot>running</Badge>;
  return <Badge tone="red" dot>stopped</Badge>;
}

const stripeCls = { running: 'bg-success', stopped: 'bg-danger', warn: 'bg-warning', unknown: 'bg-border-strong' } as const;

export default function DashboardPage() {
  const toast = useToast();
  const health = useSystemHealth();
  const [servers, setServers] = useState<GameServer[]>([]);
  const [docker, setDocker] = useState<boolean | null>(null);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/servers');
      setServers(data.servers);
      setDocker(data.docker);
    } catch (e: any) {
      toast.error(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (id: string, action: string) => {
    setBusyId(id + action);
    try {
      await api.post(`/servers/${id}/${action}`);
      await load();
      toast.success(`Server ${action} requested`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId('');
    }
  };

  const online = servers.filter((s) => s.live?.running).length;
  const drivers = servers.reduce((n, s) => n + (s.live?.players ?? 0), 0);

  return (
    <>
      <PageHeader
        eyebrow="Overview" title="Dashboard"
        actions={<Link to="/admin/servers/new"><Button icon={<Plus size={15} />}>New server</Button></Link>}
      />

      {docker === false && (
        <Banner tone="warning">
          Docker socket not reachable — mount <code className="font-mono">/var/run/docker.sock</code> into the container, or use local runtimes.
        </Banner>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Servers" value={servers.length} icon={<Server size={16} />} />
        <StatTile label="Online" value={online} icon={<Radio size={16} />} tone="green" />
        <StatTile label="Drivers on track" value={drivers} icon={<Users size={16} />} tone="blue" />
        <StatTile label="Runtime" value={health ? (health.docker ? 'Docker' : 'Local') : '…'} icon={health?.docker ? <Container size={16} /> : <Terminal size={16} />} sub={health?.docker ? 'socket connected' : 'no docker socket'} />
      </div>

      {servers.length === 0 ? (
        <EmptyState
          icon={<Server size={20} />}
          title="No servers yet"
          description="Create your first Assetto server — AC, modded AC, AssettoServer or ACC."
          action={<Link to="/admin/servers/new"><Button icon={<Plus size={15} />}>Create a server</Button></Link>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {servers.map((s) => {
            const st = stateOf(s);
            return (
              <div key={s.id} className="relative bg-card border border-border rounded-xl overflow-hidden shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_10px_30px_-12px_rgba(0,0,0,0.6)] flex">
                <span className={clsx('w-1 shrink-0', stripeCls[st])} />
                <div className="p-4 flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                      <Link to={`/admin/servers/${s.id}`} className="font-semibold font-display hover:text-primary transition-colors truncate block">{s.name}</Link>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Badge tone="brand">{TYPE_LABEL[s.type]}</Badge>
                        <Badge>{s.runtime === 'local' ? 'Local' : 'Docker'}</Badge>
                      </div>
                    </div>
                    <StateBadge s={s} />
                  </div>

                  <div className="text-sm space-y-1 mt-3">
                    {s.live?.track && <div className="flex items-center gap-1.5 text-muted"><MapPin size={13} /> {s.live.track}</div>}
                    <div className="flex items-center gap-1.5 text-muted">
                      <Users size={13} />
                      {s.live?.players != null ? `${s.live.players}${s.live.maxPlayers ? `/${s.live.maxPlayers}` : ''} online` : s.live?.running ? 'online' : '—'}
                    </div>
                    <div className="text-xs text-muted font-mono tabular-nums">Port {s.ports.game}{s.ports.http ? ` · HTTP ${s.ports.http}` : ''}</div>
                    {s.live?.note && <div className="text-xs text-danger">{s.live.note}</div>}
                  </div>

                  <div className="flex gap-2 mt-4">
                    {s.live?.running ? (
                      <>
                        <Button variant="danger" size="sm" icon={<Square size={12} />} loading={busyId === s.id + 'stop'} disabled={!!busyId} onClick={() => act(s.id, 'stop')}>Stop</Button>
                        <Button variant="secondary" size="sm" icon={<RefreshCw size={12} />} loading={busyId === s.id + 'restart'} disabled={!!busyId} onClick={() => act(s.id, 'restart')}>Restart</Button>
                      </>
                    ) : (
                      <Button variant="success" size="sm" icon={<Play size={12} />} loading={busyId === s.id + 'start'} disabled={!!busyId || st === 'warn'} onClick={() => act(s.id, 'start')}>Start</Button>
                    )}
                    <Link to={`/admin/servers/${s.id}`} className="ml-auto"><Button variant="outline" size="sm">Manage</Button></Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
