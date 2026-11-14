import { useEffect, useState } from 'react';
import type { ClientReport, MeResponse, PlanEditorResponse, PlanEditorSession, RiskInfo } from '@motix/shared';
import { api } from '../../api';
import { Badge, ErrorBox, Field } from '../../ui';
import { Messages, ReportView, RiskBadge, Tabs, useLoad } from './common';

interface ClientRow {
  linkId: string;
  status: string;
  dataConsent: boolean;
  client: { id: string; firstName: string; lastName: string; email: string | null };
  subscriptionStatus: string | null;
  risk: RiskInfo | null;
}
interface LibraryItem {
  id: string;
  name: string;
  loadable: boolean;
  unit: 'reps' | 'seconds' | 'minutes';
}

const UNIT = { reps: 'Ripetizioni', seconds: 'Secondi', minutes: 'Minuti' } as const;
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const plusDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Editor del piano: il personal trainer parte dalla proposta automatica o da zero e assegna il piano al cliente. */
function PlanEditor({ linkId, canDraft }: { linkId: string; canDraft: boolean }) {
  const library = useLoad<{ exercises: LibraryItem[] }>('/exercises');
  const [sessions, setSessions] = useState<PlanEditorSession[]>([]);
  const [note, setNote] = useState('');
  const [origin, setOrigin] = useState<PlanEditorResponse['author']>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api<PlanEditorResponse>('GET', `/trainer/clients/${linkId}/plan`)
      .then((p) => {
        setSessions(p.sessions);
        setNote(p.note);
        setOrigin(p.author);
      })
      .catch(setError);
  }, [linkId]);

  const change = (next: PlanEditorSession[]) => {
    setSessions(next);
    setDirty(true);
    setNotice('');
  };
  const patchSession = (i: number, patch: Partial<PlanEditorSession>) => change(sessions.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const patchExercise = (i: number, k: number, patch: Partial<PlanEditorSession['exercises'][number]>) =>
    patchSession(i, { exercises: sessions[i]!.exercises.map((e, j) => (j === k ? { ...e, ...patch } : e)) });

  const draft = async () => {
    if (sessions.length && !window.confirm('La proposta automatica sostituisce le sedute che vedi qui. Continuare?')) return;
    setBusy(true);
    setError(null);
    try {
      const p = await api<PlanEditorResponse>('POST', `/trainer/clients/${linkId}/plan/draft`, { day: todayIso() });
      change(p.sessions);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const addExercise = (i: number, id: string) => {
    const ex = library.data?.exercises.find((e) => e.id === id);
    if (!ex) return;
    patchSession(i, {
      exercises: [
        ...sessions[i]!.exercises,
        { exerciseId: ex.id, name: ex.name, unit: ex.unit, loadable: ex.loadable, sets: ex.unit === 'minutes' ? 1 : 3, reps: ex.unit === 'minutes' ? 10 : ex.unit === 'seconds' ? 30 : 10, loadKg: null, restSeconds: ex.unit === 'minutes' ? 0 : 60 },
      ],
    });
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('PUT', `/trainer/clients/${linkId}/plan`, {
        note: note.trim() || undefined,
        sessions: sessions.map((s) => ({
          title: s.title,
          day: s.day,
          exercises: s.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets, reps: e.reps, loadKg: e.loadable ? e.loadKg : null, restSeconds: e.restSeconds })),
        })),
      });
      setDirty(false);
      setOrigin('trainer');
      setNotice('Piano assegnato: il cliente lo trova subito nell’app.');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const num = (v: string, min: number) => Math.max(min, Math.round(Number(v) || 0));
  return (
    <div className="stack">
      <div className="row between">
        <p>
          {origin === 'trainer' ? 'Piano attuale creato da te.' : origin === 'ai' ? 'Il cliente ha un piano generato in automatico: puoi sostituirlo con il tuo.' : 'Il cliente non ha ancora un piano.'}
        </p>
        <div className="row">
          {canDraft && <button className="btn ghost small" onClick={draft} disabled={busy}>Proposta automatica</button>}
          <button className="btn ghost small" onClick={() => change([...sessions, { title: `Seduta ${sessions.length + 1}`, day: plusDays(sessions.at(-1)?.day ?? todayIso(), sessions.length ? 2 : 0), exercises: [] }])}>
            Aggiungi una seduta
          </button>
        </div>
      </div>
      <ErrorBox error={error ?? library.error} />
      {notice && <div className="alert ok">{notice}</div>}
      {!canDraft && <div className="alert info">Il cliente non condivide i suoi dati con te: puoi comunque scrivere il piano a mano, ma senza proposta automatica e senza report.</div>}

      {sessions.map((s, i) => (
        <div key={i} className="card stack">
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: 2, minWidth: 200 }}><Field label="Nome della seduta" value={s.title} onChange={(e) => patchSession(i, { title: e.target.value })} maxLength={60} /></div>
            <div style={{ flex: 1, minWidth: 160 }}><Field label="Giorno" type="date" value={s.day} onChange={(e) => patchSession(i, { day: e.target.value })} /></div>
            <button className="btn danger small" onClick={() => change(sessions.filter((_, j) => j !== i))}>Elimina la seduta</button>
          </div>
          {s.exercises.map((ex, k) => (
            <div key={k} className="ex-row">
              <b style={{ fontSize: 14, alignSelf: 'center' }}>{k + 1}. {ex.name}</b>
              <label>Serie<input className="in-sm" type="number" min={1} max={10} value={ex.sets} onChange={(e) => patchExercise(i, k, { sets: num(e.target.value, 1) })} aria-label={`${ex.name}: serie`} /></label>
              <label>{UNIT[ex.unit]}<input className="in-sm" type="number" min={1} max={200} value={ex.reps} onChange={(e) => patchExercise(i, k, { reps: num(e.target.value, 1) })} aria-label={`${ex.name}: ${UNIT[ex.unit].toLowerCase()}`} /></label>
              <label>
                Kg
                <input
                  className="in-sm"
                  type="number"
                  min={0}
                  step={0.5}
                  disabled={!ex.loadable}
                  value={ex.loadKg ?? ''}
                  placeholder={ex.loadable ? 'libero' : '—'}
                  onChange={(e) => patchExercise(i, k, { loadKg: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
                  aria-label={`${ex.name}: chili`}
                />
              </label>
              <label>Recupero (s)<input className="in-sm" type="number" min={0} max={600} step={15} value={ex.restSeconds} onChange={(e) => patchExercise(i, k, { restSeconds: num(e.target.value, 0) })} aria-label={`${ex.name}: recupero`} /></label>
              <button className="btn ghost small" onClick={() => patchSession(i, { exercises: s.exercises.filter((_, j) => j !== k) })} aria-label={`Rimuovi ${ex.name}`}>Rimuovi</button>
            </div>
          ))}
          <label className="field" style={{ maxWidth: 360 }}>
            Aggiungi un esercizio
            <select value="" onChange={(e) => addExercise(i, e.target.value)} aria-label={`Aggiungi un esercizio a ${s.title}`}>
              <option value="">Scegli dalla libreria…</option>
              {library.data?.exercises.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
        </div>
      ))}

      {sessions.length > 0 && (
        <div className="card stack">
          <label className="field">
            Nota per il cliente (compare in «Perché questo piano»)
            <textarea value={note} onChange={(e) => { setNote(e.target.value); setDirty(true); }} maxLength={600} aria-label="Nota per il cliente" />
          </label>
          <div className="row">
            <button className="btn" onClick={save} disabled={busy || !dirty || sessions.some((s) => !s.exercises.length || !s.title.trim())}>Assegna il piano al cliente</button>
            <span className="muted">Sostituisce il piano attivo; le sedute già fatte restano nel suo diario.</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ClientPage({ row, onBack, onMessage }: { row: ClientRow; onBack: () => void; onMessage: () => void }) {
  const [tab, setTab] = useState<'report' | 'plan'>(row.dataConsent ? 'report' : 'plan');
  const report = useLoad<ClientReport>(row.dataConsent && tab === 'report' ? `/trainer/clients/${row.linkId}/report` : null);
  return (
    <div className="stack">
      <div className="row between">
        <button className="btn ghost small" onClick={onBack}>← Tutti i clienti</button>
        <button className="btn small" onClick={onMessage}>Scrivi un messaggio</button>
      </div>
      <h2>{row.client.firstName} {row.client.lastName}</h2>
      <Tabs tabs={{ report: 'Report', plan: 'Piano' }} value={tab} onChange={setTab} />
      {tab === 'report' && (
        <>
          <ErrorBox error={report.error} />
          {!row.dataConsent && <div className="alert info">Questo cliente non ha dato il consenso a condividere i suoi dati: il report non è disponibile.</div>}
          {report.data && <ReportView report={report.data} />}
        </>
      )}
      {tab === 'plan' && <PlanEditor linkId={row.linkId} canDraft={row.dataConsent} />}
    </div>
  );
}

export function TrainerArea({ me }: { me: MeResponse }) {
  const t = me.trainer!;
  const approved = t.status === 'approved';
  const [tab, setTab] = useState<'clients' | 'messages' | 'structures'>('clients');
  const [open, setOpen] = useState<ClientRow | null>(null);
  const [chatWith, setChatWith] = useState<string | null>(null);
  const profile = useLoad<any>('/trainer');
  const clients = useLoad<{ clients: ClientRow[] }>(approved ? '/trainer/clients' : null);
  const structures = useLoad<{ structures: any[] }>('/trainer/structures');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');

  const act = async (fn: () => Promise<any>, ok?: string) => {
    setError(null);
    setNotice('');
    try {
      const r = await fn();
      if (r?.clients) clients.setData(r);
      if (r?.structures) structures.setData(r);
      if (ok) setNotice(ok);
    } catch (e) {
      setError(e);
    }
  };

  if (open)
    return (
      <ClientPage
        row={open}
        onBack={() => { setOpen(null); void clients.reload(); }}
        onMessage={() => { setChatWith(open.client.id); setOpen(null); setTab('messages'); }}
      />
    );

  return (
    <>
      {!approved && (
        <div className={`alert ${t.status === 'pending' ? 'info' : 'error'}`} style={{ marginBottom: 16 }}>
          {t.status === 'pending' ? 'Il tuo profilo è in verifica. Appena BTECH lo approva potrai invitare i clienti con il tuo codice.' : `Il profilo non è attivo${profile.data?.statusReason ? `: ${profile.data.statusReason}` : ''}.`}
        </div>
      )}
      <div className="grid2" style={{ marginBottom: 20 }}>
        <div className="card stack tight">
          <span className="eyebrow">Il tuo codice di invito</span>
          <div className="code">{t.inviteCode}</div>
          <p style={{ fontSize: 14 }}>Chi si registra con questo codice diventa subito tuo cliente.</p>
          {approved && profile.data && (
            <div><button className="btn ghost small" onClick={() => navigator.clipboard?.writeText(profile.data.inviteLink).then(() => setNotice('Link copiato'))}>Copia il link di invito</button></div>
          )}
        </div>
        <div className="card stack tight">
          <span className="eyebrow">Punti</span>
          <div className="stat"><b>{t.pointsBalance}</b></div>
          <p style={{ fontSize: 14 }}>Guadagni punti per ogni cliente che si abbona e rinnova; li converti in premi.</p>
        </div>
      </div>
      <Tabs tabs={{ clients: 'Clienti', messages: 'Messaggi', structures: 'Strutture' }} value={tab} onChange={(v) => { setTab(v); setNotice(''); setError(null); }} />
      <ErrorBox error={error ?? clients.error} />
      {notice && <div className="alert ok" style={{ marginBottom: 16 }}>{notice}</div>}

      {tab === 'clients' && (
        <div className="stack">
          {approved && (
            <form
              className="card row"
              style={{ alignItems: 'flex-end' }}
              onSubmit={(e) => {
                e.preventDefault();
                void act(() => api('POST', '/trainer/clients/invite', { email }), `Invito inviato a ${email}`).then(() => { setEmail(''); void clients.reload(); });
              }}
            >
              <div style={{ flex: 1, minWidth: 220 }}><Field label="Invita un cliente per email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <button className="btn">Invita</button>
            </form>
          )}
          <div className="card">
            {clients.data?.clients.length ? (
              <table>
                <thead><tr><th>Cliente</th><th>Stato</th><th>Abbonamento</th><th>Rischio</th><th /></tr></thead>
                <tbody>
                  {clients.data.clients.map((c) => (
                    <tr key={c.linkId} className={c.status === 'active' ? 'clickable' : ''} onClick={() => c.status === 'active' && setOpen(c)}>
                      <td>{c.client.firstName} {c.client.lastName}{!c.dataConsent && c.status === 'active' && <div className="muted">Non condivide i dati</div>}</td>
                      <td><Badge status={c.status} label={c.status === 'requested_by_trainer' ? 'Invito inviato' : undefined} /></td>
                      <td>{c.subscriptionStatus ? <Badge status={c.subscriptionStatus} /> : '—'}</td>
                      <td><RiskBadge risk={c.risk} /></td>
                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <div className="row" style={{ justifyContent: 'flex-end' }}>
                          {c.status === 'active' && <button className="btn small" onClick={() => setOpen(c)}>Apri</button>}
                          {c.status === 'requested_by_user' && (
                            <>
                              <button className="btn small" onClick={() => act(() => api('POST', `/trainer/clients/${c.linkId}/accept`))}>Accetta</button>
                              <button className="btn ghost small" onClick={() => act(() => api('POST', `/trainer/clients/${c.linkId}/decline`))}>Rifiuta</button>
                            </>
                          )}
                          {c.status !== 'requested_by_user' && <button className="btn danger small" onClick={() => window.confirm('Chiudere il collegamento con questo cliente?') && act(() => api('POST', `/trainer/clients/${c.linkId}/close`))}>Chiudi</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="empty">{approved ? 'Ancora nessun cliente: condividi il tuo codice.' : 'I clienti compariranno qui dopo l’approvazione.'}</div>}
          </div>
        </div>
      )}

      {tab === 'messages' && <Messages openWith={chatWith} emptyHint="Nessuna conversazione: apri un cliente e scegli «Scrivi un messaggio»." />}

      {tab === 'structures' && (
        <div className="stack">
          {approved && (
            <form className="card row" style={{ alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); void act(() => api('POST', '/trainer/structures', { code }), 'Richiesta inviata alla struttura').then(() => setCode('')); }}>
              <div style={{ flex: 1, minWidth: 220 }}><Field label="Collegati a una struttura con il suo codice" value={code} onChange={(e) => setCode(e.target.value)} placeholder="MX…" required /></div>
              <button className="btn">Invia la richiesta</button>
            </form>
          )}
          <div className="card">
            {structures.data?.structures.length ? (
              <table>
                <tbody>
                  {structures.data.structures.map((s) => (
                    <tr key={s.structureId}>
                      <td>{s.displayName}<div className="muted">{s.city}</div></td>
                      <td><Badge status={s.status} label={s.status === 'requested_by_trainer' ? 'In attesa della struttura' : s.status === 'invited_by_structure' ? 'Ti ha invitato' : undefined} /></td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="row" style={{ justifyContent: 'flex-end' }}>
                          {s.status === 'invited_by_structure' && approved && <button className="btn small" onClick={() => act(() => api('POST', `/trainer/structures/${s.structureId}/accept`))}>Accetta</button>}
                          {approved && <button className="btn danger small" onClick={() => act(() => api('POST', `/trainer/structures/${s.structureId}/leave`))}>Lascia</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="empty">Non sei collegato a nessuna struttura.</div>}
          </div>
        </div>
      )}
    </>
  );
}
