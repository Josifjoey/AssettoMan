import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api, GameServer } from '../api';
import { Card, Badge, Button } from '../components/ui';
import { Play, Square, RefreshCw, Plus, AlertTriangle, MapPin, Users } from 'lucide-react';

const TYPE_LABEL: Record<string, string> = { ac: 'Assetto Corsa', ac_modded: 'AC Modded', assettoserver: 'AssettoServer', acc: 'ACC' };

function StateBadge({ s }: { s: GameServer }) {
  const live = s.live;
  if (!live) return <Badge>unknown</Badge>;
  if (live.state === 'not_provisioned') return <Badge tone="amber">not provisioned</Badge>;
  if (live.state === 'missing') return <Badge tone="amber">container missing</Badge>;
  if (live.running) return <Badge tone="green">running</Badge>;
  return <Badge tone="red">stopped</Badge>;
}

export default function DashboardPage() {
  const [servers, setServers] = useState<GameServer[]>([]);
  const [docker, setDocker] = useState<boolean | null>(null);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/servers');
      setServers(data.servers);
      setDocker(data.docker);
      setErr('');
    } catch (e: any) {
      setErr(e.message);
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
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyId('');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <Link to="/admin/servers/new"><Button><Plus size={14} className="inline mr-1" />New server</Button></Link>
      </div>

      {docker === false && (
        <div className="mb-4 flex items-center gap-2 text-amber-300 bg-amber-900/30 border border-amber-800 rounded p-3 text-sm">
          <AlertTriangle size={16} /> Docker socket not reachable. Mount <code>/var/run/docker.sock</code> into the container to manage game servers.
        </div>
      )}
      {err && <div className="mb-4 text-red-400 text-sm">{err}</div>}

      {servers.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-muted mb-4">No servers yet. Create your first Assetto server.</p>
          <Link to="/admin/servers/new"><Button>Create a server</Button></Link>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {servers.map((s) => (
            <Card key={s.id} className="flex flex-col">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <Link to={`/admin/servers/${s.id}`} className="font-semibold hover:text-primary">{s.name}</Link>
                  <div className="text-xs text-muted">{TYPE_LABEL[s.type]}</div>
                </div>
                <StateBadge s={s} />
              </div>

              <div className="text-sm space-y-1 flex-1">
                {s.live?.track && (
                  <div className="flex items-center gap-1.5 text-muted"><MapPin size={13} /> {s.live.track}</div>
                )}
                <div className="flex items-center gap-1.5 text-muted">
                  <Users size={13} />
                  {s.live?.players != null ? `${s.live.players}${s.live.maxPlayers ? `/${s.live.maxPlayers}` : ''} online` : s.live?.running ? 'online' : '—'}
                </div>
                <div className="text-xs text-muted">Port {s.ports.game} {s.ports.http ? `· HTTP ${s.ports.http}` : ''}</div>
                {s.live?.note && <div className="text-xs text-amber-300">{s.live.note}</div>}
              </div>

              <div className="flex gap-2 mt-4">
                {s.live?.running ? (
                  <>
                    <Button variant="danger" onClick={() => act(s.id, 'stop')} disabled={!!busyId}><Square size={13} className="inline mr-1" />Stop</Button>
                    <Button variant="ghost" onClick={() => act(s.id, 'restart')} disabled={!!busyId}><RefreshCw size={13} className="inline mr-1" />Restart</Button>
                  </>
                ) : (
                  <Button variant="success" onClick={() => act(s.id, 'start')} disabled={!!busyId || s.live?.state === 'not_provisioned' || s.live?.state === 'missing'}><Play size={13} className="inline mr-1" />Start</Button>
                )}
                <Link to={`/admin/servers/${s.id}`} className="ml-auto"><Button variant="outline">Manage</Button></Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
