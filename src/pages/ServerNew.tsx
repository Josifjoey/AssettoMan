import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Card, Input, Button, Field, Check } from '../components/ui';

const TYPES = [
  { id: 'ac', label: 'Assetto Corsa', desc: 'Vanilla AC dedicated server (acServer via steamcmd). Official cars & tracks.' },
  { id: 'ac_modded', label: 'Assetto Corsa — Modded', desc: 'Same server plus mod cars/tracks you upload, with optional public downloads.' },
  { id: 'assettoserver', label: 'Assetto Corsa — AssettoServer', desc: 'Community server (compujuckel/AssettoServer): Content Manager downloads, AI traffic, dynamic weather, Steam auth. Recommended for modded servers.' },
  { id: 'acc', label: 'Assetto Corsa Competizione', desc: 'ACC dedicated server (accServer.exe via Wine — see note after creating).' },
];

export default function ServerNewPage() {
  const nav = useNavigate();
  const [type, setType] = useState('ac');
  const [runtime, setRuntime] = useState<'docker' | 'local' | null>(null);
  const [dockerOk, setDockerOk] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [gamePort, setGamePort] = useState<number | ''>('');
  const [httpPort, setHttpPort] = useState<number | ''>('');
  const [steamUser, setSteamUser] = useState('');
  const [steamPass, setSteamPass] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/system/health').then((r) => {
      setDockerOk(!!r.data.docker);
      if (runtime === null) setRuntime(r.data.docker ? 'docker' : 'local');
    }).catch(() => setRuntime((r) => r ?? 'local'));
  }, []);

  const defaults = { ac: 9600, ac_modded: 9610, assettoserver: 9620, acc: 9201 } as const;
  const effGame = gamePort || defaults[type as keyof typeof defaults];
  const effHttp = httpPort || (type === 'acc' ? 0 : (type === 'ac_modded' ? 8091 : type === 'assettoserver' ? 8101 : 8081));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const ports: any = { game: effGame };
      if (type !== 'acc') ports.http = effHttp;
      const { data } = await api.post('/servers', {
        name,
        type,
        ports,
        isPublic,
        runtime: runtime || 'local',
        steam: (type === 'acc' || type === 'assettoserver') ? undefined : { username: steamUser, password: steamPass },
      });
      nav(`/servers/${data.server.id}`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold mb-6">New server</h1>
      <form onSubmit={submit} className="space-y-4">
        <Card title="Server type">
          <div className="grid gap-2">
            {TYPES.map((t) => (
              <button
                type="button"
                key={t.id}
                onClick={() => setType(t.id)}
                className={`text-left p-3 rounded border ${type === t.id ? 'border-primary bg-accent/60' : 'border-border hover:bg-accent/30'}`}
              >
                <div className="font-medium text-sm">{t.label}</div>
                <div className="text-xs text-muted">{t.desc}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card title="Runtime">
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => setRuntime('local')}
              className={`text-left p-3 rounded border ${runtime === 'local' ? 'border-primary bg-accent/60' : 'border-border hover:bg-accent/30'}`}
            >
              <div className="font-medium text-sm">Local process (this machine)</div>
              <div className="text-xs text-muted">Runs the game exe directly here — drop <code>{type === 'acc' ? 'accServer.exe' : type === 'assettoserver' ? 'AssettoServer.exe' : 'acServer.exe'}</code> + game files into the server's folder. Best for Windows.</div>
            </button>
            <button
              type="button"
              onClick={() => setRuntime('docker')}
              className={`text-left p-3 rounded border ${runtime === 'docker' ? 'border-primary bg-accent/60' : 'border-border hover:bg-accent/30'}`}
            >
              <div className="font-medium text-sm">Docker container (unraid)</div>
              <div className="text-xs text-muted">
                Creates an ich777 game-server container via the Docker socket.
                {dockerOk === false && <span className="text-amber-300"> Docker socket not reachable on this machine.</span>}
              </div>
            </button>
          </div>
        </Card>

        <Card title="Basics">
          <div className="space-y-3">
            <Field label="Server name"><Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Friday Night Racing" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Game port (TCP+UDP)`} hint={type === 'acc' ? 'ACC uses one port for both' : 'acServer UDP/TCP port'}>
                <Input type="number" value={gamePort} onChange={(e) => setGamePort(e.target.value ? Number(e.target.value) : '')} placeholder={String(defaults[type as keyof typeof defaults])} />
              </Field>
              {type !== 'acc' && (
                <Field label="HTTP port" hint="AC status API port">
                  <Input type="number" value={httpPort} onChange={(e) => setHttpPort(e.target.value ? Number(e.target.value) : '')} placeholder={String(effHttp)} />
                </Field>
              )}
            </div>
            <Check label="Show on public page" checked={isPublic} onChange={setIsPublic} hint="Listed on the community-facing page with live status" />
          </div>
        </Card>

        {(type === 'ac' || type === 'ac_modded') && runtime === 'docker' && (
          <Card title="Steam credentials">
            <p className="text-xs text-muted mb-3">Required to download AC dedicated server via SteamCMD. Any Steam account works (game ownership not required) but Steam Guard must be disabled. Stored server-side only.</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Steam username"><Input value={steamUser} onChange={(e) => setSteamUser(e.target.value)} autoComplete="off" /></Field>
              <Field label="Steam password"><Input type="password" value={steamPass} onChange={(e) => setSteamPass(e.target.value)} autoComplete="new-password" /></Field>
            </div>
          </Card>
        )}

        {(type === 'ac' || type === 'ac_modded') && runtime === 'local' && (
          <Card title="Heads up">
            <p className="text-sm text-muted">
              After creating, drop <code className="mx-1 px-1 bg-accent rounded">acServer.exe</code> plus the game's
              <code className="mx-1 px-1 bg-accent rounded">content/</code> folder into this server's
              <code className="mx-1 px-1 bg-accent rounded">serverfiles/</code> directory (from SteamCMD app 302550, or your existing server install). Check the Files tab for the exact path.
            </p>
          </Card>
        )}

        {type === 'assettoserver' && (
          <Card title="Heads up">
            <p className="text-sm text-muted">
              {runtime === 'local' ? (
                <>Download <code className="mx-1 px-1 bg-accent rounded">assetto-server-win-x64.zip</code> from the
                <a className="text-primary hover:underline mx-1" href="https://github.com/compujuckel/AssettoServer/releases/latest" target="_blank" rel="noopener noreferrer">AssettoServer releases</a>
                page and extract it into this server's <code className="mx-1 px-1 bg-accent rounded">serverfiles/</code> directory so
                <code className="mx-1 px-1 bg-accent rounded">AssettoServer.exe</code> sits next to <code className="mx-1 px-1 bg-accent rounded">cfg/</code>.</>
              ) : (
                <>The <code className="mx-1 px-1 bg-accent rounded">compujuckel/assettoserver</code> image is pulled automatically — no Steam login needed. Copy your AC <code className="mx-1 px-1 bg-accent rounded">content/</code> folder into this server's <code className="mx-1 px-1 bg-accent rounded">serverfiles/</code> directory.</>
              )}
            </p>
          </Card>
        )}

        {type === 'acc' && (
          <Card title="Heads up">
            <p className="text-sm text-muted">
              ACC's dedicated server binary isn't on SteamCMD anonymously. After creating this server, download the
              <em> Assetto Corsa Competizione Dedicated Server </em> tool in Steam on any PC, then copy
              <code className="mx-1 px-1 bg-accent rounded">accServer.exe</code> into this server's
              <code className="mx-1 px-1 bg-accent rounded">acc/</code> folder via the Files tab.
            </p>
          </Card>
        )}

        {err && <div className="text-sm text-red-400">{err}</div>}
        <Button type="submit" disabled={busy || !name}>{busy ? 'Creating…' : 'Create server'}</Button>
      </form>
    </div>
  );
}
