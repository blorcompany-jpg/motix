import { useState, type FormEvent } from 'react';
import { SENSOR_STATUSES, SENSOR_STATUS_LABELS, type AdminSensor, type SensorIssueView, type SensorStatus, type StructureSensor } from '@motix/shared';
import { api } from '../../api';
import { Badge, Check, ErrorBox, Field, fieldsOf } from '../../ui';
import { Stat, date, useLoad } from './common';

const TONE: Record<SensorStatus, string> = { in_stock: 'neutral', active: 'approved', faulty: 'rejected', retired: 'suspended' };
const SensorBadge = ({ status }: { status: SensorStatus }) => <Badge status={TONE[status]} label={SENSOR_STATUS_LABELS[status]} />;
const battery = (pct: number | null) => (pct === null ? '—' : `${pct}%`);

/** Registro dei sensori motix pod: distribuiti, gratuiti o venduti, firmware, guasti. */
export function SensorsAdmin() {
  const [status, setStatus] = useState<SensorStatus | ''>('');
  const [q, setQ] = useState('');
  const query = new URLSearchParams({ ...(status ? { status } : {}), ...(q.trim() ? { q: q.trim() } : {}) }).toString();
  const list = useLoad<{ sensors: AdminSensor[]; totals: Record<SensorStatus, number> }>(`/admin/sensors${query ? `?${query}` : ''}`);
  const issues = useLoad<{ issues: SensorIssueView[] }>('/admin/sensor-issues');
  const structures = useLoad<{ structures: Array<{ id: string; displayName: string; city: string }> }>('/admin/structures?status=approved');
  const [f, setF] = useState({ serials: '', firmware: '', structureId: '', freeOfCharge: false });
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const fe = fieldsOf(error);
  const serialError = Object.entries(fe).find(([k]) => k.startsWith('serials'))?.[1];

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setError(null);
    setNotice('');
    try {
      await fn();
      await Promise.all([list.reload(), issues.reload()]);
      if (done) setNotice(done);
      return true;
    } catch (e) {
      setError(e);
      return false;
    }
  };

  const register = async (e: FormEvent) => {
    e.preventDefault();
    const serials = f.serials.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    setBusy(true);
    const ok = await run(
      () => api('POST', '/admin/sensors', { serials, firmware: f.firmware.trim() || undefined, structureId: f.structureId || null, freeOfCharge: f.freeOfCharge }),
      `${serials.length} ${serials.length === 1 ? 'sensore registrato' : 'sensori registrati'}`,
    );
    setBusy(false);
    if (ok) setF({ ...f, serials: '' });
  };

  const t = list.data?.totals;
  const open = issues.data?.issues.filter((i) => !i.resolvedAt) ?? [];
  return (
    <div className="stack">
      <div className="grid4">
        <Stat value={t?.active ?? 0} label="In uso" />
        <Stat value={t?.in_stock ?? 0} label="In magazzino" />
        <Stat value={t?.faulty ?? 0} label="Guasti" />
        <Stat value={open.length} label="Segnalazioni aperte" />
      </div>
      <ErrorBox error={error ?? list.error ?? issues.error} />
      {notice && <div className="alert ok">{notice}</div>}

      <form className="card stack" onSubmit={register}>
        <h3>Registra nuovi sensori</h3>
        <div className="field">
          <label htmlFor="serials">Numeri di serie</label>
          <textarea id="serials" rows={2} value={f.serials} onChange={(e) => setF({ ...f, serials: e.target.value })} placeholder="MP-A1B2C3, MP-A1B2C4…" aria-invalid={serialError ? true : undefined} required />
          <span className={serialError ? 'field-error' : 'muted'}>{serialError ?? 'Uno o più, separati da virgola o a capo. Formato: MP- seguito da 6-12 lettere o cifre.'}</span>
        </div>
        <div className="grid2">
          <Field label="Firmware (facoltativo)" value={f.firmware} onChange={(e) => setF({ ...f, firmware: e.target.value })} maxLength={30} />
          <div className="field">
            <label htmlFor="sensor-structure">Assegna a</label>
            <select id="sensor-structure" value={f.structureId} onChange={(e) => setF({ ...f, structureId: e.target.value })}>
              <option value="">Magazzino BTECH (in vendita)</option>
              {structures.data?.structures.map((s) => <option key={s.id} value={s.id}>{s.displayName} · {s.city}</option>)}
            </select>
          </div>
        </div>
        <Check checked={f.freeOfCharge} onChange={(e) => setF({ ...f, freeOfCharge: e.target.checked })}>Dati gratuitamente (sensori per le strutture affiliate)</Check>
        <div><button className="btn" disabled={busy || !f.serials.trim()}>Registra</button></div>
      </form>

      {open.length > 0 && (
        <div className="card stack">
          <h3>Segnalazioni di guasto</h3>
          {open.map((i) => (
            <div key={i.id} className="card flat stack tight">
              <div className="row between">
                <b>{i.serial}</b>
                <span className="muted">{i.reporter ?? 'Utente cancellato'} · {date(i.at)}</span>
              </div>
              <p style={{ fontSize: 14 }}>«{i.note}»</p>
              <div className="row">
                <button className="btn ghost small" onClick={() => run(() => api('POST', `/admin/sensor-issues/${i.id}/resolve`))}>Chiudi la segnalazione</button>
                <button className="btn danger small" onClick={() => run(async () => { await api('PATCH', `/admin/sensors/${i.sensorId}`, { status: 'faulty' }); await api('POST', `/admin/sensor-issues/${i.id}/resolve`); })}>Segna come guasto e chiudi</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card stack">
        <div className="row between">
          <h3>Registro</h3>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input aria-label="Cerca per numero di serie" placeholder="Cerca numero di serie" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} />
            <select aria-label="Filtra per stato" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value as SensorStatus | '')}>
              <option value="">Tutti gli stati</option>
              {SENSOR_STATUSES.map((s) => <option key={s} value={s}>{SENSOR_STATUS_LABELS[s]}</option>)}
            </select>
          </div>
        </div>
        {list.data?.sensors.length ? (
          <table>
            <thead>
              <tr><th>Numero di serie</th><th>Stato</th><th>Assegnato a</th><th>Firmware</th><th>Batteria</th><th>Ultimo uso</th><th></th></tr>
            </thead>
            <tbody>
              {list.data.sensors.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.serial}</b>{s.freeOfCharge && <div className="muted">gratuito</div>}{s.openIssues > 0 && <div style={{ color: 'var(--corallo)', fontSize: 13 }}>{s.openIssues} {s.openIssues === 1 ? 'segnalazione' : 'segnalazioni'}</div>}</td>
                  <td><SensorBadge status={s.status} /></td>
                  <td>{s.ownerType === 'btech' ? 'Magazzino BTECH' : (s.ownerName ?? '—')}<div className="muted">{s.ownerType === 'structure' ? 'struttura' : s.ownerType === 'user' ? 'utente' : ''}</div></td>
                  <td>{s.firmware ?? '—'}</td>
                  <td>{battery(s.batteryPct)}</td>
                  <td>{date(s.lastSeenAt)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <select
                      aria-label={`Cambia lo stato di ${s.serial}`}
                      value={s.status}
                      onChange={(e) => run(() => api('PATCH', `/admin/sensors/${s.id}`, { status: e.target.value }))}
                    >
                      {SENSOR_STATUSES.map((st) => <option key={st} value={st}>{SENSOR_STATUS_LABELS[st]}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="empty">{list.data ? 'Nessun sensore con questi filtri.' : 'Carico…'}</div>}
      </div>
    </div>
  );
}

/** I sensori della struttura: quali ha, quanto vengono usati, segnalazione dei guasti. */
export function StructureSensors() {
  const list = useLoad<{ sensors: StructureSensor[] }>('/structure/sensors');
  const [issueFor, setIssueFor] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const send = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('POST', `/structure/sensors/${issueFor}/issues`, { note });
      setIssueFor(null);
      setNote('');
      setNotice('Segnalazione inviata al team BTECH.');
    } catch (err) {
      setError(err);
    }
  };
  return (
    <div className="stack">
      <ErrorBox error={error ?? list.error} />
      {notice && <div className="alert ok">{notice}</div>}
      <div className="card stack">
        <h3>Sensori motix pod della struttura</h3>
        <p style={{ fontSize: 14 }}>Gli iscritti con Premium li trovano già nell’app, nella seduta, senza doverli abbinare. Per averne altri scrivi a BTECH o passa dallo Shop.</p>
        {list.data?.sensors.length ? (
          <table>
            <thead><tr><th>Numero di serie</th><th>Stato</th><th>Serie negli ultimi 30 giorni</th><th>Batteria</th><th>Ultimo uso</th><th></th></tr></thead>
            <tbody>
              {list.data.sensors.map((s) => (
                <tr key={s.id}>
                  <td><b>{s.serial}</b>{s.freeOfCharge && <div className="muted">in comodato gratuito</div>}</td>
                  <td><SensorBadge status={s.status} /></td>
                  <td>{s.setsLast30Days}</td>
                  <td>{battery(s.batteryPct)}</td>
                  <td>{date(s.lastSeenAt)}</td>
                  <td style={{ textAlign: 'right' }}><button className="btn ghost small" onClick={() => { setIssueFor(s.id); setNotice(''); }}>Segnala un guasto</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="empty">{list.data ? 'La struttura non ha ancora sensori assegnati.' : 'Carico…'}</div>}
      </div>
      {issueFor && (
        <form className="card stack" onSubmit={send}>
          <h3>Segnala un guasto: {list.data?.sensors.find((s) => s.id === issueFor)?.serial}</h3>
          <div className="field">
            <label htmlFor="issue-note">Cosa non funziona?</label>
            <textarea id="issue-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} minLength={5} maxLength={500} required />
          </div>
          <div className="row">
            <button className="btn">Invia</button>
            <button type="button" className="btn ghost" onClick={() => setIssueFor(null)}>Annulla</button>
          </div>
        </form>
      )}
    </div>
  );
}
