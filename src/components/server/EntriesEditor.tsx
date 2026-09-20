import React, { useEffect, useState } from 'react';
import { api, GameServer } from '../../api';
import { Card, Input, Select, Field, Check, Button } from '../ui';
import { Plus, Trash2, Car } from 'lucide-react';
import { ContentPickerModal, PickerButton, useAvailableContent, PickerOption } from './ContentPicker';

// Entry list editor — AC entry_list.ini entries or ACC entrylist.json +
// bop.json depending on server type.

export default function EntriesEditor({ server, disabled, onSave }: { server: GameServer; disabled: boolean; onSave: (config: any) => void }) {
  const [cfg, setCfg] = useState<any>(server.config);
  const dirty = JSON.stringify(cfg) !== JSON.stringify(server.config);
  const [meta, setMeta] = useState<any>(null);

  useEffect(() => {
    if (server.type === 'acc') api.get('/servers/meta').then((r) => setMeta(r.data)).catch(() => {});
  }, [server.type]);

  const isAcc = server.type === 'acc';
  const entries: any[] = isAcc ? (cfg.entrylist?.entries || []) : (cfg.entries || []);
  const bop: any[] = cfg.bop?.entries || [];
  const installedCars: string[] = server.installed?.cars || [];
  const avail = useAvailableContent(server.id);
  const [carPickerIdx, setCarPickerIdx] = useState<number | null>(null);
  // Options = installed cars + cars allowed in config that aren't installed (marked).
  const carOptions: PickerOption[] = (() => {
    const ids = new Set(avail.cars.map((c) => c.value));
    const extra = String(cfg.server?.cars || '').split(';').filter((id) => id && !ids.has(id))
      .map((id) => ({ value: id, name: id, tag: 'not installed' }));
    return [...avail.cars, ...extra];
  })();
  const carName = (id: string) => carOptions.find((o) => o.value === id)?.name || id;
  const skinsFor = (carId: string) => avail.cars.find((o) => o.value === carId)?.skins || [];

  const setEntries = (next: any[]) => {
    setCfg((c: any) => isAcc ? { ...c, entrylist: { ...c.entrylist, entries: next } } : { ...c, entries: next });
  };
  const setEntry = (i: number, k: string, v: any) => setEntries(entries.map((e, j) => (j === i ? { ...e, [k]: v } : e)));

  return (
    <div className="space-y-4">
      <Card
        title="Entry list" subtitle={isAcc ? 'entrylist.json' : 'entry_list.ini'}
        actions={!disabled && (
          <Button variant="secondary" size="sm" type="button" icon={<Plus size={12} />} onClick={() => setEntries([...entries, isAcc
            ? { drivers: [{ firstName: '', lastName: 'Driver', shortName: 'DRV', driverCategory: 0 }], raceNumber: entries.length + 1, forcedCarModel: -1, defaultGridPosition: -1, isServerAdmin: 0 }
            : { car: installedCars[0] || '', skin: '', driverName: '', team: '', guid: '', ballast: 0, restrictor: 0, spectatorMode: false }
          ])}>
            Add entry
          </Button>
        )}
      >
        {entries.length === 0 && <div className="text-xs text-muted">Empty entry list — anyone can join with any allowed car.</div>}
        <div className="space-y-2">
          {entries.map((e, i) => (
            <div key={i} className="bg-card-2 border border-border rounded-lg p-4 hover:border-border-strong transition-colors">
              {isAcc ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                  <Field label="Race number"><Input disabled={disabled} type="number" value={e.raceNumber ?? i + 1} onChange={(ev) => setEntry(i, 'raceNumber', +ev.target.value)} /></Field>
                  <Field label="Forced car model">
                    <Select disabled={disabled} value={e.forcedCarModel ?? -1} onChange={(ev) => setEntry(i, 'forcedCarModel', +ev.target.value)}>
                      <option value={-1}>Any car</option>
                      {(meta?.accCars || []).map((c: any) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </Select>
                  </Field>
                  <Field label="Driver name"><Input disabled={disabled} value={e.drivers?.[0]?.lastName || ''} onChange={(ev) => {
                    const drivers = [{ ...(e.drivers?.[0] || { firstName: '', shortName: 'DRV', driverCategory: 0 }), lastName: ev.target.value }];
                    setEntry(i, 'drivers', drivers);
                  }} /></Field>
                  <Field label="Grid position" hint="-1 = auto"><Input disabled={disabled} type="number" value={e.defaultGridPosition ?? -1} onChange={(ev) => setEntry(i, 'defaultGridPosition', +ev.target.value)} /></Field>
                  <div className="flex items-center gap-3 col-span-2 md:col-span-4">
                    <Check disabled={disabled} label="Server admin" checked={!!e.isServerAdmin} onChange={(v) => setEntry(i, 'isServerAdmin', v ? 1 : 0)} />
                    {!disabled && <Button variant="secondary" size="sm" type="button" icon={<Plus size={12} />} onClick={() => setEntries(entries.filter((_, j) => j !== i))}><Trash2 size={13} /></Button>}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                  <Field label="Car">
                    <PickerButton disabled={disabled} icon={<Car size={13} />}
                      label={e.car || e.model ? carName(e.car || e.model) : 'Choose a car…'}
                      mono={e.car || e.model || undefined}
                      onClick={() => setCarPickerIdx(i)} />
                  </Field>
                  <Field label="Skin">
                    {skinsFor(e.car || e.model).length ? (
                      <Select disabled={disabled} value={e.skin || ''} onChange={(ev) => setEntry(i, 'skin', ev.target.value)}>
                        <option value="">— default —</option>
                        {skinsFor(e.car || e.model).map((s) => <option key={s.value} value={s.value}>{s.name}</option>)}
                        {e.skin && !skinsFor(e.car || e.model).some((s) => s.value === e.skin) && <option value={e.skin}>{e.skin} (custom)</option>}
                      </Select>
                    ) : (
                      <Input disabled={disabled} value={e.skin || ''} onChange={(ev) => setEntry(i, 'skin', ev.target.value)} />
                    )}
                  </Field>
                  <Field label="Driver name"><Input disabled={disabled} value={e.driverName || ''} onChange={(ev) => setEntry(i, 'driverName', ev.target.value)} /></Field>
                  <Field label="GUID (SteamID64)"><Input disabled={disabled} value={e.guid || ''} onChange={(ev) => setEntry(i, 'guid', ev.target.value)} /></Field>
                  <Field label="Team"><Input disabled={disabled} value={e.team || ''} onChange={(ev) => setEntry(i, 'team', ev.target.value)} /></Field>
                  <Field label="Ballast (kg)"><Input disabled={disabled} type="number" value={e.ballast ?? 0} onChange={(ev) => setEntry(i, 'ballast', +ev.target.value)} /></Field>
                  <Field label="Restrictor %"><Input disabled={disabled} type="number" value={e.restrictor ?? 0} onChange={(ev) => setEntry(i, 'restrictor', +ev.target.value)} /></Field>
                  <div className="flex items-center gap-3">
                    <Check disabled={disabled} label="Spectator" checked={!!e.spectatorMode} onChange={(v) => setEntry(i, 'spectatorMode', v)} />
                    {!disabled && <Button variant="secondary" size="sm" type="button" icon={<Plus size={12} />} onClick={() => setEntries(entries.filter((_, j) => j !== i))}><Trash2 size={13} /></Button>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {isAcc && (
        <Card
          title="Balance of Performance" subtitle="bop.json"
          actions={!disabled && <Button variant="secondary" size="sm" type="button" icon={<Plus size={12} />} onClick={() => setCfg((c: any) => ({ ...c, bop: { ...c.bop, entries: [...(c.bop?.entries || []), { track: cfg.event?.track || 'spa', carModel: 0, ballastKg: 0, restrictor: 0 }] } }))}><Plus size={13} className="inline mr-1" />Add BoP</Button>}
        >
          {bop.length === 0 && <div className="text-xs text-muted">No BoP overrides — default balance applies.</div>}
          <div className="space-y-2">
            {bop.map((b, i) => (
              <div key={i} className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end bg-card-2 border border-border rounded-lg p-3 hover:border-border-strong transition-colors">
                <Field label="Track">
                  <Select disabled={disabled} value={b.track} onChange={(ev) => setCfg((c: any) => ({ ...c, bop: { ...c.bop, entries: bop.map((x, j) => j === i ? { ...x, track: ev.target.value } : x) } }))}>
                    {(meta?.accTracks || []).map((t: any) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </Select>
                </Field>
                <Field label="Car">
                  <Select disabled={disabled} value={b.carModel} onChange={(ev) => setCfg((c: any) => ({ ...c, bop: { ...c.bop, entries: bop.map((x, j) => j === i ? { ...x, carModel: +ev.target.value } : x) } }))}>
                    {(meta?.accCars || []).map((x: any) => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </Select>
                </Field>
                <Field label="Ballast (kg)"><Input disabled={disabled} type="number" value={b.ballastKg ?? 0} onChange={(ev) => setCfg((c: any) => ({ ...c, bop: { ...c.bop, entries: bop.map((x, j) => j === i ? { ...x, ballastKg: +ev.target.value } : x) } }))} /></Field>
                <Field label="Restrictor %"><Input disabled={disabled} type="number" value={b.restrictor ?? 0} onChange={(ev) => setCfg((c: any) => ({ ...c, bop: { ...c.bop, entries: bop.map((x, j) => j === i ? { ...x, restrictor: +ev.target.value } : x) } }))} /></Field>
                {!disabled && <Button variant="secondary" size="sm" type="button" icon={<Plus size={12} />} onClick={() => setCfg((c: any) => ({ ...c, bop: { ...c.bop, entries: bop.filter((_, j) => j !== i) } }))}><Trash2 size={13} /></Button>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {!disabled && (
        <div className="sticky bottom-0 -mx-1 px-1 py-3 bg-background/85 backdrop-blur border-t border-border flex items-center gap-3">
          <Button onClick={() => onSave(cfg)}>Save entries</Button>
          {dirty && <span className="text-xs text-warning">Unsaved changes</span>}
          <ContentPickerModal open={carPickerIdx !== null} onClose={() => setCarPickerIdx(null)} title="Choose car" kind="car"
            options={carOptions} loading={avail.loading} selected={carPickerIdx !== null ? [entries[carPickerIdx]?.car || entries[carPickerIdx]?.model || ''] : []}
            onApply={({ value }: any) => { if (carPickerIdx !== null) { setEntry(carPickerIdx, 'car', value); setEntry(carPickerIdx, 'skin', ''); } }} />
        </div>
      )}
    </div>
  );
}
