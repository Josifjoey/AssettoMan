import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { Card, Button } from '../ui';
import { RefreshCw } from 'lucide-react';

export default function LogViewer({ serverId }: { serverId: string }) {
  const [logs, setLogs] = useState('');
  const [err, setErr] = useState('');
  const [auto, setAuto] = useState(true);
  const ref = useRef<HTMLPreElement>(null);

  const load = async () => {
    try {
      const { data } = await api.get(`/servers/${serverId}/logs`, { params: { tail: 300 } });
      setLogs(data.logs);
      setErr('');
    } catch (e: any) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    load();
    if (!auto) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [serverId, auto]);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs]);

  return (
    <Card
      title="Container logs"
      actions={
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted flex items-center gap-1"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-[#e8344e]" /> auto</label>
          <Button variant="ghost" onClick={load}><RefreshCw size={13} /></Button>
        </div>
      }
    >
      {err && <div className="text-sm text-red-400 mb-2">{err}</div>}
      <pre ref={ref} className="bg-background border border-border rounded p-3 text-xs font-mono h-96 overflow-auto whitespace-pre-wrap">{logs || 'No logs yet.'}</pre>
    </Card>
  );
}
