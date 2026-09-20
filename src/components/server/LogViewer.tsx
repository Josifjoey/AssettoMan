import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { Card, Button, Select, useToast } from '../ui';
import { RefreshCw, Copy } from 'lucide-react';

export default function LogViewer({ serverId }: { serverId: string }) {
  const toast = useToast();
  const [logs, setLogs] = useState('');
  const [err, setErr] = useState('');
  const [auto, setAuto] = useState(true);
  const [tail, setTail] = useState('300');
  const ref = useRef<HTMLPreElement>(null);

  const load = async () => {
    try {
      const { data } = await api.get(`/servers/${serverId}/logs`, { params: { tail } });
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
  }, [serverId, auto, tail]);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs]);

  return (
    <Card
      title="Server logs" subtitle="stdout tail"
      actions={
        <div className="flex items-center gap-2">
          <Select value={tail} onChange={(e) => setTail(e.target.value)} className="h-7 w-24 text-xs">
            <option value="100">100 lines</option>
            <option value="300">300 lines</option>
            <option value="1000">1000 lines</option>
            <option value="2000">2000 lines</option>
          </Select>
          <label className="text-xs text-muted flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-primary" /> auto
          </label>
          <Button variant="ghost" size="sm" icon={<Copy size={13} />} aria-label="Copy logs"
                  onClick={() => { navigator.clipboard?.writeText(logs).catch(() => {}); toast.success('Logs copied'); }} />
          <Button variant="ghost" size="sm" icon={<RefreshCw size={13} />} aria-label="Refresh" onClick={load} />
        </div>
      }
    >
      {err && <div className="text-sm text-danger mb-2">{err}</div>}
      <pre ref={ref} className="bg-[#04060a] border border-border rounded-lg p-4 text-xs font-mono h-96 overflow-auto whitespace-pre-wrap leading-relaxed text-foreground/90">{logs || 'No logs yet.'}</pre>
    </Card>
  );
}
