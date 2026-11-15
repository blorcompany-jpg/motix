import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  GOAL_LABELS,
  type ClientReport,
  type MeResponse,
  type MemberRow,
  type StructureOverview,
  type StructureReportMonth,
} from '@motix/shared';
import { api, download } from '../../api';
import { Badge, ErrorBox, Field } from '../../ui';
import { StructureSensors } from './Sensors';
import { Messages, ReportView, RiskBadge, Stat, Tabs, date, shortDay, useLoad } from './common';

type Tab = 'home' | 'members' | 'alerts' | 'messages' | 'staff' | 'sensors' | 'report';
const memberName = (m: MemberRow) => (m.sharesData ? `${m.firstName} ${m.lastName}` : 'Dati non condivisi');
const monthLabel = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

interface MemberDetail {
  member: MemberRow;
  report: ClientReport;
  notes: Array<{ id: string; text: string; at: string; author: string }>;
}

/** Scheda dell'iscritto: report, note del CRM e messaggio diretto. */
function MemberPanel({ id, onBack, onMessage }: { id: string; onBack: () => void; onMessage: (userId: string) => void }) {
  const detail = useLoad<MemberDetail>(`/structure/members/${id}`);
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const d = detail.data;

  const addNote = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('POST', `/structure/members/${id}/notes`, { text: note });
      setNote('');
      await detail.reload();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <div className="stack">
      <div className="row between">
        <button className="btn ghost small" onClick={onBack}>← Tutti gli iscritti</button>
        {d && <button className="btn small" onClick={() => onMessage(id)}>Scrivi un messaggio</button>}
      </div>
      <ErrorBox error={error ?? detail.error} />
      {d && (
        <>
          <div>
            <h2>{memberName(d.member)}</h2>
            <p className="muted">{d.member.email} · iscritto dal {date(d.member.joinedAt)}{d.member.trainer ? ` · personal trainer: ${d.member.trainer}` : ''}</p>
          </div>
          <ReportView report={d.report} />
          <div className="card stack">
            <h3>Note</h3>
            <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={addNote}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <Field label="Aggiungi una nota per lo staff" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} required />
              </div>
              <button className="btn">Salva</button>
            </form>
            {d.notes.map((n) => (
              <div key={n.id} className="card flat">
                <p style={{ color: 'var(--ghiaccio)', fontSize: 14 }}>{n.text}</p>
                <span className="muted">{n.author} · {date(n.at)}</span>
              </div>
            ))}
            {d.notes.length === 0 && <p className="muted">Ancora nessuna nota.</p>}
          </div>
        </>
      )}
    </div>
  );
}

export function StructureDashboard({ me }: { me: MeResponse }) {
  const isOwner = me.role === 'owner';
  const s = isOwner ? me.ownedStructure! : { ...me.instructorOf!, status: 'approved' as const, code: null };
  const approved = s.status === 'approved';
  const [tab, setTab] = useState<Tab>(isOwner ? 'home' : 'members');
  const [member, setMember] = useState<string | null>(null);
  const [chatWith, setChatWith] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const [invite, setInvite] = useState({ email: '', role: 'instructor' });
  const [campaign, setCampaign] = useState({ text: '', segment: 'all' });

  const detail = useLoad<any>(isOwner ? '/structure' : null);
  const qr = useLoad<{ code: string; link: string; svg: string }>(approved && isOwner ? '/structure/qr' : null);
  const overview = useLoad<StructureOverview>(approved && isOwner ? '/structure/overview' : null);
  const members = useLoad<{ members: MemberRow[] }>(approved && tab === 'members' ? '/structure/members' : null);
  const alerts = useLoad<{ alerts: MemberRow[]; anonymousAtRisk: number }>(approved && tab === 'alerts' ? '/structure/alerts' : null);
  const staff = useLoad<any>(approved && isOwner && tab === 'staff' ? '/structure/staff' : null);
  const activity = useLoad<{ trainers: Array<{ trainerId: string; name: string; clients: number; sessions30d: number; clientsAtRisk: number }> }>(
    approved && isOwner && tab === 'staff' ? '/structure/trainers/activity' : null,
  );
  const report = useLoad<{ months: StructureReportMonth[] }>(approved && isOwner && tab === 'report' ? '/structure/report?months=6' : null);

  const act = async (fn: () => Promise<any>, ok?: string | ((r: any) => string)) => {
    setError(null);
    setNotice('');
    try {
      const r = await fn();
      if (r?.trainers && r?.instructors) staff.setData(r);
      if (ok) setNotice(typeof ok === 'string' ? ok : ok(r));
      return r;
    } catch (e) {
      setError(e);
    }
  };
  const go = (t: Tab) => {
    setTab(t);
    setMember(null);
    setNotice('');
    setError(null);
  };
  const message = (userId: string) => {
    setChatWith(userId);
    setMember(null);
    setTab('messages');
  };

  if (!approved)
    return (
      <div className="card stack">
        <div className="row between">
          <h2>{s.displayName}</h2>
          <Badge status={s.status} />
        </div>
        {s.status === 'pending' ? (
          <div className="alert info">La richiesta di affiliazione è in verifica. Appena il team BTECH la approva ricevi un’email e qui compaiono codice, QR e kit di lancio.</div>
        ) : (
          <div className="alert error">L’affiliazione non è attiva{detail.data?.statusReason ? `: ${detail.data.statusReason}` : ''}. Per chiarimenti contatta BTECH.</div>
        )}
      </div>
    );

  const tabs = isOwner
    ? { home: 'Panoramica', members: 'Iscritti', alerts: 'Alert', messages: 'Messaggi', staff: 'Staff', sensors: 'Sensori', report: 'Report' }
    : { members: 'I miei iscritti', alerts: 'Alert', messages: 'Messaggi' };
  const o = overview.data;

  return (
    <>
      <Tabs tabs={tabs as Record<Tab, string>} value={tab} onChange={go} />
      <ErrorBox error={error ?? overview.error ?? members.error ?? alerts.error ?? staff.error ?? report.error} />
      {notice && <div className="alert ok" style={{ marginBottom: 16 }}>{notice}</div>}

      {tab === 'home' && (
        <div className="stack">
          <div className="grid4">
            <Stat value={o?.members ?? '—'} label="Iscritti collegati all’app" />
            <Stat value={o?.activeThisWeek ?? '—'} label="Attivi negli ultimi 7 giorni" />
            <Stat value={o?.inTrial ?? '—'} label="In prova gratuita" />
            <Stat value={o?.subscribed ?? '—'} label="Abbonati" />
          </div>
          <div className="grid4">
            <Stat value={o?.atRisk ?? '—'} label="A rischio abbandono" />
            <Stat value={o ? o.avgSessionsPerWeek.toLocaleString('it-IT') : '—'} label="Sedute a settimana per iscritto" />
            <Stat value={o?.trainers ?? '—'} label="Personal trainer" />
            <Stat value={o?.instructors ?? '—'} label="Istruttori" />
          </div>
          {o && o.atRisk > 0 && (
            <div className="alert info row between">
              <span>{o.atRisk} {o.atRisk === 1 ? 'iscritto è' : 'iscritti sono'} a rischio abbandono.</span>
              <button className="btn small" onClick={() => go('alerts')}>Vedi gli alert</button>
            </div>
          )}
          <div className="card row" style={{ gap: 28, alignItems: 'flex-start' }}>
            {qr.data && <div className="qr" dangerouslySetInnerHTML={{ __html: qr.data.svg }} />}
            <div className="stack" style={{ flex: 1, minWidth: 240 }}>
              <span className="eyebrow">Codice della struttura</span>
              <div className="code">{s.code}</div>
              <p>Fai inquadrare il QR ai tuoi iscritti o comunica il codice: si registrano, sono collegati a {s.displayName} e provano MOTIX gratis per 14 giorni.</p>
              {qr.data && (
                <div className="row">
                  <Link className="btn small" to="/locandina" target="_blank">Locandina da stampare</Link>
                  <button className="btn ghost small" onClick={() => navigator.clipboard?.writeText(qr.data!.link).then(() => setNotice('Link copiato'))}>Copia il link</button>
                  <a className="btn ghost small" download={`motix-qr-${s.code}.svg`} href={`data:image/svg+xml;utf8,${encodeURIComponent(qr.data.svg)}`}>Scarica il QR</a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'members' && member && <MemberPanel id={member} onBack={() => setMember(null)} onMessage={message} />}
      {tab === 'members' && !member && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Iscritto</th><th>Obiettivo</th><th>Sedute (30 gg)</th><th>Ultima seduta</th><th>Abbonamento</th><th>Personal trainer</th><th>Rischio</th></tr>
              </thead>
              <tbody>
                {members.data?.members.map((m) => (
                  <tr key={m.id} className={m.sharesData ? 'clickable' : ''} onClick={() => m.sharesData && setMember(m.id)}>
                    <td>{m.sharesData ? <>{memberName(m)}<div className="muted">{m.email}</div></> : <span className="muted">Dati non condivisi</span>}</td>
                    <td>{m.goal ? GOAL_LABELS[m.goal] : '—'}</td>
                    <td>{m.sessions30d ?? '—'}</td>
                    <td>{m.lastSessionDay ? shortDay(m.lastSessionDay) : '—'}</td>
                    <td>{m.subscriptionStatus ? <Badge status={m.subscriptionStatus} /> : '—'}</td>
                    <td>{m.trainer ?? '—'}</td>
                    <td><RiskBadge risk={m.risk} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {members.data?.members.length === 0 && <div className="empty">{isOwner ? `Ancora nessun iscritto collegato: condividi il codice ${s.code}.` : 'Il titolare non ti ha ancora assegnato iscritti.'}</div>}
          <p className="muted" style={{ marginTop: 12 }}>Vedi dati personali e attività solo di chi ha dato il consenso alla condivisione con la struttura. Clicca un iscritto per aprire la scheda.</p>
        </div>
      )}

      {tab === 'alerts' && (
        <div className="stack">
          {alerts.data && alerts.data.alerts.length + alerts.data.anonymousAtRisk > 0 && (
            <div className="row between">
              <p>Gli iscritti che rischiano di smettere, con il motivo e cosa fare.</p>
              <button
                className="btn small"
                onClick={() => { setCampaign({ text: 'Ciao! È da un po’ che non ti vediamo: ti aspettiamo in struttura per ripartire insieme.', segment: 'at_risk' }); go('messages'); }}
              >
                Scrivi a tutti gli iscritti a rischio
              </button>
            </div>
          )}
          {alerts.data?.alerts.map((m) => (
            <div key={m.id} className="card stack tight">
              <div className="row between">
                <h3>{memberName(m)}</h3>
                <RiskBadge risk={m.risk} />
              </div>
              {m.risk?.reasons.map((r) => <p key={r} style={{ fontSize: 14 }}>• {r}</p>)}
              {m.risk?.suggestion && <p style={{ fontSize: 14, color: 'var(--acqua)' }}>Azione suggerita: {m.risk.suggestion}</p>}
              <div className="row">
                <button className="btn small" onClick={() => message(m.id)}>Scrivi</button>
                <button className="btn ghost small" onClick={() => { setTab('members'); setMember(m.id); }}>Apri la scheda</button>
              </div>
            </div>
          ))}
          {alerts.data && alerts.data.anonymousAtRisk > 0 && (
            <div className="alert info">
              Altri {alerts.data.anonymousAtRisk} iscritti a rischio non condividono i dati con la struttura: puoi raggiungerli solo con un messaggio di gruppo.
            </div>
          )}
          {alerts.data && alerts.data.alerts.length + alerts.data.anonymousAtRisk === 0 && <div className="card empty">Nessun iscritto a rischio in questo momento.</div>}
        </div>
      )}

      {tab === 'messages' && (
        <div className="stack">
          <form
            className="card stack"
            onSubmit={(e) => {
              e.preventDefault();
              void act(() => api('POST', '/structure/messages', campaign), (r) => `Messaggio inviato a ${r.sent} ${r.sent === 1 ? 'iscritto' : 'iscritti'}`).then((r) => r && setCampaign({ ...campaign, text: '' }));
            }}
          >
            <h3>Messaggio di gruppo</h3>
            <label className="field">
              Testo
              <textarea aria-label="Testo del messaggio di gruppo" value={campaign.text} onChange={(e) => setCampaign({ ...campaign, text: e.target.value })} maxLength={2000} required />
            </label>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <label className="field" style={{ flex: 1, minWidth: 220 }}>
                Destinatari
                <select value={campaign.segment} onChange={(e) => setCampaign({ ...campaign, segment: e.target.value })}>
                  <option value="all">Tutti gli iscritti</option>
                  <option value="at_risk">Iscritti a rischio abbandono</option>
                  <option value="inactive">Non attivi negli ultimi 7 giorni</option>
                  <option value="trial">In prova gratuita</option>
                </select>
              </label>
              <button className="btn">Invia a tutto il gruppo</button>
            </div>
          </form>
          <Messages openWith={chatWith} emptyHint="Nessuna conversazione: scrivi a un iscritto dalla sua scheda o invia un messaggio di gruppo." />
        </div>
      )}

      {tab === 'sensors' && isOwner && <StructureSensors />}

      {tab === 'staff' && (
        <div className="stack">
          <form
            className="card stack"
            onSubmit={(e) => {
              e.preventDefault();
              void act(() => api('POST', '/structure/staff/invite', invite), `Invito inviato a ${invite.email}`).then((r) => r && setInvite({ ...invite, email: '' }));
            }}
          >
            <h3>Invita un collaboratore</h3>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div style={{ flex: 2, minWidth: 220 }}>
                <Field label="Email" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} required />
              </div>
              <label className="field" style={{ flex: 1, minWidth: 180 }}>
                Ruolo
                <select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
                  <option value="instructor">Istruttore</option>
                  <option value="personal_trainer">Personal trainer</option>
                </select>
              </label>
              <button className="btn">Invia l’invito</button>
            </div>
          </form>
          <div className="card stack">
            <h3>Personal trainer</h3>
            {staff.data?.trainers.length ? (
              <table>
                <thead><tr><th>Personal trainer</th><th>Stato</th><th>Clienti qui</th><th>Sedute dei clienti (30 gg)</th><th>Clienti a rischio</th><th /></tr></thead>
                <tbody>
                  {staff.data.trainers.map((t: any) => {
                    const a = activity.data?.trainers.find((x) => x.trainerId === t.trainerId);
                    return (
                      <tr key={t.trainerId}>
                        <td>{t.firstName} {t.lastName}<div className="muted">{t.specializations.join(' · ')}</div></td>
                        <td><Badge status={t.status} /></td>
                        <td>{a?.clients ?? '—'}</td>
                        <td>{a?.sessions30d ?? '—'}</td>
                        <td>{a?.clientsAtRisk ?? '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="row" style={{ justifyContent: 'flex-end' }}>
                            {t.status === 'requested_by_trainer' && <button className="btn small" onClick={() => act(() => api('POST', `/structure/trainers/${t.trainerId}/accept`))}>Accetta</button>}
                            <button className="btn danger small" onClick={() => act(() => api('POST', `/structure/trainers/${t.trainerId}/remove`))}>Rimuovi</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : <div className="empty">Nessun personal trainer collegato.</div>}
          </div>
          <div className="card stack">
            <h3>Istruttori</h3>
            {staff.data?.instructors.length ? (
              <table>
                <tbody>
                  {staff.data.instructors.map((i: any) => (
                    <tr key={i.instructorId}>
                      <td>{i.firstName} {i.lastName}<div className="muted">{i.email}</div></td>
                      <td><Badge status={i.active ? 'active' : 'suspended'} label={i.active ? 'Attivo' : 'Disattivato'} /></td>
                      <td style={{ textAlign: 'right' }}>{i.active && <button className="btn danger small" onClick={() => act(() => api('DELETE', `/structure/instructors/${i.instructorId}`))}>Disattiva</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="empty">Nessun istruttore.</div>}
            {staff.data?.invites.length > 0 && (
              <>
                <h3>Inviti in attesa</h3>
                <table>
                  <tbody>
                    {staff.data.invites.map((i: any) => (
                      <tr key={i.id}>
                        <td>{i.email}</td>
                        <td>{i.role === 'instructor' ? 'Istruttore' : 'Personal trainer'}</td>
                        <td className="muted">scade il {date(i.expiresAt)}</td>
                        <td style={{ textAlign: 'right' }}><button className="btn ghost small" onClick={() => act(() => api('DELETE', `/structure/invites/${i.id}`))}>Annulla</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'report' && (
        <div className="card stack">
          <div className="row between">
            <h3>Andamento degli ultimi 6 mesi</h3>
            <button className="btn ghost small" onClick={() => act(() => download('/structure/report.csv?months=6', 'motix-report.csv'))}>Esporta in CSV</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Mese</th><th>Nuovi iscritti</th><th>Iscritti attivi</th><th>Sedute completate</th><th>Prove iniziate</th><th>Retention</th></tr></thead>
              <tbody>
                {report.data?.months.map((m) => (
                  <tr key={m.month}>
                    <td style={{ textTransform: 'capitalize' }}>{monthLabel(m.month)}</td>
                    <td>{m.newMembers}</td>
                    <td>{m.activeMembers}</td>
                    <td>{m.sessions}</td>
                    <td>{m.trialsStarted}</td>
                    <td>{m.retentionPct === null ? '—' : `${m.retentionPct}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">Iscritto attivo: ha completato almeno una seduta nel mese. Retention: quota degli attivi del mese prima che sono rimasti attivi.</p>
        </div>
      )}
    </>
  );
}
