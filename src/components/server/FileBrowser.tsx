import React, { useEffect, useState } from 'react';
import { api } from '../../api';
import { Card, Button } from '../ui';
import { Folder, File, ArrowUp, RefreshCw } from 'lucide-react';

interface Entry { name: string; dir: boolean; size: number | null }

export default function FileBrowser({ serverId }: { serverId: string }) {
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [err, setErr] = useState('');

  const load = async (p = path) => {
    try {
      const { data } = await api.get(`/system/files/${serverId}`, { params: { path: p } });
      setEntries(data.entries.sort((a: Entry, b: Entry) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)));
      setPath(data.path);
      setErr('');
    } catch (e: any) {
      setErr(e.message);
    }
  };

  useEffect(() => { load(''); }, [serverId]);

  const crumbs = path.split('/').filter(Boolean);

  return (
    <Card
      title="Server files" subtitle="data dir"
      actions={<Button variant="ghost" onClick={() => load()}><RefreshCw size={13} /></Button>}
    >
      <div className="flex items-center gap-1 text-xs text-muted mb-3 flex-wrap">
        <button className="hover:text-foreground" onClick={() => load('')}>root</button>
        {crumbs.map((c, i) => (
          <span key={i}>
            <span className="mx-1">/</span>
            <button className="hover:text-foreground" onClick={() => load(crumbs.slice(0, i + 1).join('/'))}>{c}</button>
          </span>
        ))}
      </div>
      {err && <div className="text-sm text-red-400 mb-2">{err}</div>}
      <div className="border border-border rounded-lg divide-y divide-border max-h-[32rem] overflow-auto">
        {path && (
          <button className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent/50 text-muted" onClick={() => load(crumbs.slice(0, -1).join('/'))}>
            <ArrowUp size={14} /> ..
          </button>
        )}
        {entries.map((e) => (
          <button
            key={e.name}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent/50 text-left"
            onClick={() => e.dir && load(path ? `${path}/${e.name}` : e.name)}
            disabled={!e.dir}
          >
            {e.dir ? <Folder size={14} className="text-muted" /> : <File size={14} className="text-muted" />}
            <span className="flex-1 truncate font-mono text-xs">{e.name}</span>
            {e.size != null && <span className="text-xs text-muted">{fmt(e.size)}</span>}
          </button>
        ))}
        {!entries.length && !err && <div className="px-3 py-4 text-sm text-muted">Empty directory</div>}
      </div>
    </Card>
  );
}

function fmt(n: number) {
  if (n > 1e9) return (n / 1e9).toFixed(1) + ' GB';
  if (n > 1e6) return (n / 1e6).toFixed(1) + ' MB';
  if (n > 1e3) return (n / 1e3).toFixed(1) + ' KB';
  return n + ' B';
}
