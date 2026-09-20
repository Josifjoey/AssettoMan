import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, GameServer } from '../api';
import { Card, Input, Button, Field, Check, PageHeader, Badge, useToast } from '../components/ui';
import { Flag, Package, Rocket, Car, Container, Terminal, ChevronRight, ChevronLeft, Check as CheckIcon } from 'lucide-react';
import { clsx } from 'clsx';

const TYPES = [
  { id: 'ac', label: 'Assetto Corsa', icon: <Flag size={20} />, desc: 'Vanilla dedicated server (acServer via steamcmd). Official cars & tracks.' },
  { id: 'ac_modded', label: 'AC — Modded', icon: <Package size={20} />, desc: 'Same server plus mod cars/tracks you upload, with optional public downloads.' },
  { id: 'assettoserver', label: 'AssettoServer', icon: <Rocket size={20} />, recommended: true, desc: 'Community server: Content Manager downloads, AI traffic, dynamic weather, Steam auth.' },
  { id: 'acc', label: 'ACC', icon: <Car size={20} />, desc: 'Competizione dedicated server (accServer.exe via Wine).' },
];

const STEPS = ['Type', 'Runtime & ports', 'Details'];

export default function ServerNewPage() {
  const nav = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [type, setType] = useState('ac');
  const [runtime, setRuntime] = useState<'docker' | 'local' | null>(null);
  const [dockerOk, setDockerOk] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [gamePort, setGamePort] = useState<number | ''>('');
  const [httpPort, setHttpPort] = useState<number | ''>('');
  const [steamUser, setSteamUser] = useState('');
  const [steamPass, setSteamPass] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState<GameServer[]>([]);

  useEffect(() => {
    api.get('/system/health').then((r) => {
      setDockerOk(!!r.data.docker);
      if (runtime === null) setRuntime(r.data.docker ? 'docker' : 'local');
    }).catch(() => setRuntime((r) => r ?? 'local'));
    api.get('/servers').then((r) => setExisting(r.data.servers)).catch(() => {});
  }, []);

  const defaults = { ac: 9600, ac_modded: 9610, assettoserver: 9620, acc: 9201 } as const;
  const effGame = gamePort || defaults[type as keyof typeof defaults];
  const effHttp = httpPort || (type === 'acc' ? 0 : (type === 'ac_modded' ? 8091 : type === 'assettoserver' ? 8101 : 8081));

  const portUser = (p: number | '') => existing.find((s) => s.ports.game === p || s.ports.http === p || s.ports.plugin === p || s.ports.pluginListen === p);
  const gameConflict = portUser(effGame);
  const httpConflict = type !== 'acc' ? portUser(effHttp) : undefined;

  const submit = async () => {
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
      toast.success('Server created');
      nav(`/admin/servers/${data.server.id}`);
    } catch (e: any) {
      toast.error(e.message);
      setBusy(false);
    }
  };

  const selCard = (sel: boolean) => clsx(
    'text-left p-4 rounded-xl border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
    sel ? 'border-primary bg-accent/70 shadow-[0_0_0_1px_#e8344e]' : 'border-border bg-card hover:border-border-strong'
  );

  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="New server" title="Create a server" />

      {/* step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            {i > 0 && <div className={clsx('h-px w-8', i <= step ? 'bg-primary' : 'bg-border')} />}
            <button type="button" onClick={() => i < step && setStep(i)}
                    className={clsx('flex items-center gap-2 text-sm', i === step ? 'text-foreground font-medium' : i < step ? 'text-primary' : 'text-muted')}>
              <span className={clsx('w-6 h-6 rounded-full grid place-items-center text-xs font-bold border',
                i < step ? 'bg-brand border-transparent text-white' : i === step ? 'border-primary text-primary' : 'border-border text-muted')}>
                {i < step ? <CheckIcon size={12} /> : i + 1}
              </span>
              {s}
            </button>
          </React.Fragment>
        ))}
      </div>

      {step === 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {TYPES.map((t) => (
            <button type="button" key={t.id} onClick={() => setType(t.id)} className={selCard(type === t.id)}>
              <div className="flex items-center justify-between mb-2">
                <span className={type === t.id ? 'text-primary' : 'text-muted'}>{t.icon}</span>
                {t.recommended && <Badge tone="brand">Recommended</Badge>}
              </div>
              <div className="font-medium text-sm font-display">{t.label}</div>
              <div className="text-xs text-muted mt-1">{t.desc}</div>
            </button>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => setRuntime('local')} className={selCard(runtime === 'local')}>
              <Terminal size={18} className={runtime === 'local' ? 'text-primary' : 'text-muted'} />
              <div className="font-medium text-sm font-display mt-2">Local process</div>
              <div className="text-xs text-muted mt-1">Runs <code className="font-mono">{type === 'acc' ? 'accServer.exe' : type === 'assettoserver' ? 'AssettoServer.exe' : 'acServer.exe'}</code> directly on this machine. Best for Windows.</div>
            </button>
            <button type="button" onClick={() => setRuntime('docker')} className={selCard(runtime === 'docker')}>
              <Container size={18} className={runtime === 'docker' ? 'text-primary' : 'text-muted'} />
              <div className="font-medium text-sm font-display mt-2">Docker container</div>
              <div className="text-xs text-muted mt-1">
                {type === 'assettoserver' ? 'Pulls compujuckel/assettoserver automatically — no Steam login.' : 'Creates an ich777 game-server container via the Docker socket.'}
                {dockerOk === false && <span className="text-warning"> Docker socket not reachable on this machine.</span>}
              </div>
            </button>
          </div>
          <Card title="Ports" subtitle="Networking">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Game port (TCP+UDP)" hint={type === 'acc' ? 'ACC uses one port for both' : 'acServer UDP/TCP port'}
                     error={gameConflict ? `In use by ${gameConflict.name}` : undefined}>
                <Input type="number" mono value={gamePort} onChange={(e) => setGamePort(e.target.value ? Number(e.target.value) : '')} placeholder={String(defaults[type as keyof typeof defaults])} />
              </Field>
              {type !== 'acc' && (
                <Field label="HTTP port" hint="AC status API port" error={httpConflict ? `In use by ${httpConflict.name}` : undefined}>
                  <Input type="number" mono value={httpPort} onChange={(e) => setHttpPort(e.target.value ? Number(e.target.value) : '')} placeholder={String(effHttp)} />
                </Field>
              )}
            </div>
          </Card>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <Card title="Details" subtitle="Basics">
            <div className="space-y-4">
              <Field label="Server name"><Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Friday Night Racing" autoFocus /></Field>
              <Check label="Show on public page" checked={isPublic} onChange={setIsPublic} hint="Listed on the community-facing page with live status" />
            </div>
          </Card>

          {(type === 'ac' || type === 'ac_modded') && runtime === 'docker' && (
            <Card title="Steam credentials" subtitle="SteamCMD">
              <p className="text-xs text-muted mb-4">Required to download AC dedicated server via SteamCMD. Any Steam account works (game ownership not required) but Steam Guard must be disabled. Stored server-side only.</p>
              <div className="grid grid-cols-2 gap-4">
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
                <code className="mx-1 px-1 bg-accent rounded">serverfiles/</code> directory. Check the Files tab for the exact path.
              </p>
            </Card>
          )}
          {type === 'assettoserver' && (
            <Card title="Heads up">
              <p className="text-sm text-muted">
                {runtime === 'local' ? (
                  <>Download <code className="mx-1 px-1 bg-accent rounded">assetto-server-win-x64.zip</code> from the
                  <a className="text-primary hover:underline mx-1" href="https://github.com/compujuckel/AssettoServer/releases/latest" target="_blank" rel="noopener noreferrer">AssettoServer releases</a>
                  page and extract it into <code className="mx-1 px-1 bg-accent rounded">serverfiles/</code> so
                  <code className="mx-1 px-1 bg-accent rounded">AssettoServer.exe</code> sits next to <code className="mx-1 px-1 bg-accent rounded">cfg/</code>.</>
                ) : (
                  <>The image is pulled automatically — no Steam login needed. Copy your AC <code className="mx-1 px-1 bg-accent rounded">content/</code> folder into <code className="mx-1 px-1 bg-accent rounded">serverfiles/</code>.</>
                )}
              </p>
            </Card>
          )}
          {type === 'acc' && (
            <Card title="Heads up">
              <p className="text-sm text-muted">
                ACC's dedicated server binary isn't on SteamCMD anonymously. Download the
                <em> Assetto Corsa Competizione Dedicated Server </em> tool in Steam on any PC, then copy
                <code className="mx-1 px-1 bg-accent rounded">accServer.exe</code> into this server's
                <code className="mx-1 px-1 bg-accent rounded">acc/</code> folder via the Files tab.
              </p>
            </Card>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        {step > 0 && <Button variant="secondary" icon={<ChevronLeft size={15} />} onClick={() => setStep(step - 1)}>Back</Button>}
        {step < 2
          ? <Button icon={<ChevronRight size={15} />} onClick={() => setStep(step + 1)} disabled={step === 1 && (!!gameConflict || !!httpConflict)}>Next</Button>
          : <Button loading={busy} disabled={!name} onClick={submit}>{busy ? 'Creating…' : 'Create server'}</Button>}
      </div>
    </div>
  );
}
