import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ROLE_LABELS, STRUCTURE_TYPE_LABELS, type MeResponse, type StructureType } from '@motix/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import { Badge, ErrorBox, Field, Logo } from '../ui';

/** Carica dati dall'API e li ricarica su richiesta. */
function useLoad<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>('GET', path));
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [path]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, reload, setData };
}

function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Record<T, string>; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {(Object.keys(tabs) as T[]).map((t) => (
        <button key={t} role="tab" aria-selected={t === value} className={t === value ? 'on' : ''} onClick={() => onChange(t)}>
          {tabs[t]}
        </button>
      ))}
    </div>
  );
}

const Stat = ({ value, label }: { value: ReactNode; label: string }) => (
  <div className="card flat stat">
    <b>{value}</b>
    <span>{label}</span>
  </div>
);

const date = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString('it-IT') : '—');

/* ================= Titolare della struttura ================= */

function OwnerDashboard({ me }: { me: MeResponse }) {
  const s = me.ownedStructure!;
  const approved = s.status === 'approved';
  const [tab, setTab] = useState<'home' | 'members' | 'staff'>('home');
  const detail = useLoad<any>('/structure');
  const qr = useLoad<{ code: string; link: string; svg: string }>(approved ? '/structure/qr' : null);
  const overview = useLoad<any>(approved ? '/structure/overview' : null);
  const members = useLoad<{ members: any[] }>(approved && tab === 'members' ? '/structure/members' : null);
  const staff = useLoad<any>(approved && tab === 'staff' ? '/structure/staff' : null);
  const [invite, setInvite] = useState({ email: '', role: 'instructor' });
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');

  const act = async (fn: () => Promise<any>, ok?: string) => {
    setError(null);
    setNotice('');
    try {
      const r = await fn();
      if (r?.trainers) staff.setData(r);
      if (ok) setNotice(ok);
    } catch (e) {
      setError(e);
    }
  };

  const sendInvite = (e: FormEvent) => {
    e.preventDefault();
    void act(() => api('POST', '/structure/staff/invite', invite), `Invito inviato a ${invite.email}`).then(() => setInvite({ ...invite, email: '' }));
  };

  if (!approved)
    return (
      <div className="card stack">
        <div className="row between">
          <h2>{s.displayName}</h2>
          <Badge status={s.status} />
        </div>
        {s.status === 'pending' && (
          <div className="alert info">
            La richiesta di affiliazione è in verifica. Appena il team BTECH la approva ricevi un’email e qui compaiono codice, QR e kit di lancio.
          </div>
        )}
        {s.status !== 'pending' && (
          <div className="alert error">
            L’affiliazione non è attiva{detail.data?.statusReason ? `: ${detail.data.statusReason}` : ''}. Per chiarimenti contatta BTECH.
          </div>
        )}
      </div>
    );

  return (
    <>
      <Tabs tabs={{ home: 'Panoramica', members: 'Iscritti', staff: 'Staff' }} value={tab} onChange={setTab} />
      <ErrorBox error={error ?? overview.error ?? members.error ?? staff.error} />
      {notice && <div className="alert ok" style={{ marginBottom: 16 }}>{notice}</div>}

      {tab === 'home' && (
        <div className="stack">
          <div className="grid4">
            <Stat value={overview.data?.members ?? '—'} label="Iscritti collegati all’app" />
            <Stat value={overview.data?.inTrial ?? '—'} label="In prova gratuita" />
            <Stat value={overview.data?.subscribed ?? '—'} label="Abbonati" />
            <Stat value={(overview.data?.trainers ?? 0) + (overview.data?.instructors ?? 0)} label="Personal trainer e istruttori" />
          </div>
          <div className="card row" style={{ gap: 28, alignItems: 'flex-start' }}>
            {qr.data && <div className="qr" dangerouslySetInnerHTML={{ __html: qr.data.svg }} />}
            <div className="stack" style={{ flex: 1, minWidth: 240 }}>
              <span className="eyebrow">Codice della struttura</span>
              <div className="code">{s.code}</div>
              <p>
                Fai inquadrare il QR ai tuoi iscritti o comunica il codice: si registrano, sono collegati a {s.displayName} e provano MOTIX gratis per 14
                giorni.
              </p>
              {qr.data && (
                <div className="row">
                  <button className="btn ghost small" onClick={() => navigator.clipboard?.writeText(qr.data!.link).then(() => setNotice('Link copiato'))}>
                    Copia il link
                  </button>
                  <a className="btn ghost small" download={`motix-qr-${s.code}.svg`} href={`data:image/svg+xml;utf8,${encodeURIComponent(qr.data.svg)}`}>
                    Scarica il QR
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'members' && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Iscritto</th><th>Dal</th><th>Abbonamento</th><th>Personal trainer</th><th>Ultimo accesso</th></tr>
              </thead>
              <tbody>
                {members.data?.members.map((m) => (
                  <tr key={m.id}>
                    <td>{m.sharesData ? <>{m.firstName} {m.lastName}<div className="muted">{m.email}</div></> : <span className="muted">Dati non condivisi</span>}</td>
                    <td>{date(m.joinedAt)}</td>
                    <td>{m.subscriptionStatus ? <Badge status={m.subscriptionStatus} /> : '—'}</td>
                    <td>{m.trainer ?? '—'}</td>
                    <td>{date(m.lastLoginAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {members.data?.members.length === 0 && <div className="empty">Ancora nessun iscritto collegato: condividi il codice {s.code}.</div>}
          <p className="muted" style={{ marginTop: 12 }}>Vedi i dati personali solo di chi ha dato il consenso alla condivisione con la struttura.</p>
        </div>
      )}

      {tab === 'staff' && (
        <div className="stack">
          <form className="card stack" onSubmit={sendInvite}>
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
                <tbody>
                  {staff.data.trainers.map((t: any) => (
                    <tr key={t.trainerId}>
                      <td>{t.firstName} {t.lastName}<div className="muted">{t.specializations.join(' · ')}</div></td>
                      <td><Badge status={t.status} /></td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="row" style={{ justifyContent: 'flex-end' }}>
                          {t.status === 'requested_by_trainer' && (
                            <button className="btn small" onClick={() => act(() => api('POST', `/structure/trainers/${t.trainerId}/accept`))}>Accetta</button>
                          )}
                          <button className="btn danger small" onClick={() => act(() => api('POST', `/structure/trainers/${t.trainerId}/remove`))}>Rimuovi</button>
                        </div>
                      </td>
                    </tr>
                  ))}
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
                      <td style={{ textAlign: 'right' }}>
                        {i.active && <button className="btn danger small" onClick={() => act(() => api('DELETE', `/structure/instructors/${i.instructorId}`))}>Disattiva</button>}
                      </td>
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
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn ghost small" onClick={() => act(() => api('DELETE', `/structure/invites/${i.id}`))}>Annulla</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ================= Istruttore ================= */

function InstructorArea({ me }: { me: MeResponse }) {
  const members = useLoad<{ members: any[] }>('/structure/members');
  return (
    <div className="card stack">
      <h2>I miei iscritti · {me.instructorOf?.displayName}</h2>
      <ErrorBox error={members.error} />
      {members.data?.members.length ? (
        <table>
          <thead><tr><th>Iscritto</th><th>Abbonamento</th><th>Ultimo accesso</th></tr></thead>
          <tbody>
            {members.data.members.map((m) => (
              <tr key={m.id}>
                <td>{m.sharesData ? `${m.firstName} ${m.lastName}` : <span className="muted">Dati non condivisi</span>}</td>
                <td>{m.subscriptionStatus ? <Badge status={m.subscriptionStatus} /> : '—'}</td>
                <td>{date(m.lastLoginAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className="empty">Il titolare non ti ha ancora assegnato iscritti.</div>}
    </div>
  );
}

/* ================= Personal trainer ================= */

function TrainerArea({ me }: { me: MeResponse }) {
  const t = me.trainer!;
  const approved = t.status === 'approved';
  const [tab, setTab] = useState<'clients' | 'structures'>('clients');
  const profile = useLoad<any>('/trainer');
  const clients = useLoad<{ clients: any[] }>(approved ? '/trainer/clients' : null);
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

  return (
    <>
      {!approved && (
        <div className={`alert ${t.status === 'pending' ? 'info' : 'error'}`} style={{ marginBottom: 16 }}>
          {t.status === 'pending'
            ? 'Il tuo profilo è in verifica. Appena BTECH lo approva potrai invitare i clienti con il tuo codice.'
            : `Il profilo non è attivo${profile.data?.statusReason ? `: ${profile.data.statusReason}` : ''}.`}
        </div>
      )}
      <div className="grid2" style={{ marginBottom: 20 }}>
        <div className="card stack tight">
          <span className="eyebrow">Il tuo codice di invito</span>
          <div className="code">{t.inviteCode}</div>
          <p style={{ fontSize: 14 }}>Chi si registra con questo codice diventa subito tuo cliente.</p>
          {approved && profile.data && (
            <div>
              <button className="btn ghost small" onClick={() => navigator.clipboard?.writeText(profile.data.inviteLink).then(() => setNotice('Link copiato'))}>
                Copia il link di invito
              </button>
            </div>
          )}
        </div>
        <div className="card stack tight">
          <span className="eyebrow">Punti</span>
          <div className="stat"><b>{t.pointsBalance}</b></div>
          <p style={{ fontSize: 14 }}>Guadagni punti per ogni cliente che si abbona e rinnova; li converti in premi.</p>
        </div>
      </div>
      <Tabs tabs={{ clients: 'Clienti', structures: 'Strutture' }} value={tab} onChange={setTab} />
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
                void act(() => api('POST', '/trainer/clients/invite', { email }), `Invito inviato a ${email}`).then(() => {
                  setEmail('');
                  void clients.reload();
                });
              }}
            >
              <div style={{ flex: 1, minWidth: 220 }}>
                <Field label="Invita un cliente per email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <button className="btn">Invita</button>
            </form>
          )}
          <div className="card">
            {clients.data?.clients.length ? (
              <table>
                <thead><tr><th>Cliente</th><th>Stato</th><th>Abbonamento</th><th /></tr></thead>
                <tbody>
                  {clients.data.clients.map((c) => (
                    <tr key={c.linkId}>
                      <td>{c.client.firstName} {c.client.lastName}{!c.dataConsent && c.status === 'active' && <div className="muted">Non condivide i dati</div>}</td>
                      <td><Badge status={c.status} label={c.status === 'requested_by_trainer' ? 'Invito inviato' : undefined} /></td>
                      <td>{c.subscriptionStatus ? <Badge status={c.subscriptionStatus} /> : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="row" style={{ justifyContent: 'flex-end' }}>
                          {c.status === 'requested_by_user' && (
                            <>
                              <button className="btn small" onClick={() => act(() => api('POST', `/trainer/clients/${c.linkId}/accept`))}>Accetta</button>
                              <button className="btn ghost small" onClick={() => act(() => api('POST', `/trainer/clients/${c.linkId}/decline`))}>Rifiuta</button>
                            </>
                          )}
                          {c.status !== 'requested_by_user' && (
                            <button className="btn danger small" onClick={() => act(() => api('POST', `/trainer/clients/${c.linkId}/close`))}>Chiudi</button>
                          )}
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

      {tab === 'structures' && (
        <div className="stack">
          {approved && (
            <form
              className="card row"
              style={{ alignItems: 'flex-end' }}
              onSubmit={(e) => {
                e.preventDefault();
                void act(() => api('POST', '/trainer/structures', { code }), 'Richiesta inviata alla struttura').then(() => setCode(''));
              }}
            >
              <div style={{ flex: 1, minWidth: 220 }}>
                <Field label="Collegati a una struttura con il suo codice" value={code} onChange={(e) => setCode(e.target.value)} placeholder="MX…" required />
              </div>
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
                          {s.status === 'invited_by_structure' && approved && (
                            <button className="btn small" onClick={() => act(() => api('POST', `/trainer/structures/${s.structureId}/accept`))}>Accetta</button>
                          )}
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

/* ================= Pannello BTECH ================= */

function AdminPanel() {
  const [tab, setTab] = useState<'structures' | 'trainers' | 'users'>('structures');
  const [filter, setFilter] = useState('pending');
  const overview = useLoad<any>('/admin/overview');
  const structures = useLoad<{ structures: any[] }>(tab === 'structures' ? `/admin/structures${filter ? `?status=${filter}` : ''}` : null);
  const trainers = useLoad<{ trainers: any[] }>(tab === 'trainers' ? `/admin/trainers${filter ? `?status=${filter}` : ''}` : null);
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<any[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const decide = async (kind: 'structures' | 'trainers', id: string, action: 'approve' | 'reject' | 'suspend') => {
    setError(null);
    let reason: string | undefined;
    if (action !== 'approve') {
      const typed = window.prompt(action === 'reject' ? 'Motivo del rifiuto (viene inviato per email):' : 'Motivo della sospensione:');
      if (typed === null) return;
      reason = typed || undefined;
    }
    try {
      await api('POST', `/admin/${kind}/${id}/${action}`, { reason });
      await Promise.all([overview.reload(), kind === 'structures' ? structures.reload() : trainers.reload()]);
    } catch (e) {
      setError(e);
    }
  };

  const search = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      setUsers((await api<{ users: any[] }>('GET', `/admin/users?q=${encodeURIComponent(q)}`)).users);
    } catch (err) {
      setError(err);
    }
  };

  const o = overview.data;
  const actions = (kind: 'structures' | 'trainers', row: any) => (
    <div className="row" style={{ justifyContent: 'flex-end' }}>
      {row.status !== 'approved' && <button className="btn small" onClick={() => decide(kind, row.id, 'approve')}>Approva</button>}
      {row.status === 'pending' && <button className="btn danger small" onClick={() => decide(kind, row.id, 'reject')}>Rifiuta</button>}
      {row.status === 'approved' && <button className="btn danger small" onClick={() => decide(kind, row.id, 'suspend')}>Sospendi</button>}
    </div>
  );
  const filterBar = (
    <div className="row" style={{ marginBottom: 12 }}>
      {[['pending', 'In attesa'], ['approved', 'Approvati'], ['rejected', 'Rifiutati'], ['suspended', 'Sospesi'], ['', 'Tutti']].map(([v, l]) => (
        <button key={v} className={`btn small ${filter === v ? '' : 'ghost'}`} onClick={() => setFilter(v!)}>{l}</button>
      ))}
    </div>
  );

  return (
    <>
      <div className="grid4" style={{ marginBottom: 20 }}>
        <Stat value={o?.structures?.approved ?? 0} label={`Strutture affiliate · ${o?.structures?.pending ?? 0} in attesa`} />
        <Stat value={o?.trainers?.approved ?? 0} label={`Personal trainer · ${o?.trainers?.pending ?? 0} in attesa`} />
        <Stat value={o?.users ?? 0} label="Utenti registrati" />
        <Stat value={o?.subscriptions?.active ?? 0} label={`Abbonati · ${o?.subscriptions?.trial ?? 0} in prova`} />
      </div>
      <Tabs tabs={{ structures: 'Strutture', trainers: 'Personal trainer', users: 'Utenti' }} value={tab} onChange={setTab} />
      <ErrorBox error={error ?? structures.error ?? trainers.error} />

      {tab === 'structures' && (
        <div className="card">
          {filterBar}
          <div className="table-wrap">
            <table>
              <thead><tr><th>Struttura</th><th>Titolare</th><th>Iscritti</th><th>Stato</th><th>Codice</th><th /></tr></thead>
              <tbody>
                {structures.data?.structures.map((s) => (
                  <tr key={s.id}>
                    <td>{s.displayName}<div className="muted">{STRUCTURE_TYPE_LABELS[s.type as StructureType]} · {s.city} ({s.province})</div></td>
                    <td>{s.owner.firstName} {s.owner.lastName}<div className="muted">{s.owner.email}</div></td>
                    <td>{s.membersEstimate ?? '—'}</td>
                    <td><Badge status={s.status} /></td>
                    <td>{s.code ?? '—'}</td>
                    <td>{actions('structures', s)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {structures.data?.structures.length === 0 && <div className="empty">Nessuna struttura in questo elenco.</div>}
        </div>
      )}

      {tab === 'trainers' && (
        <div className="card">
          {filterBar}
          <div className="table-wrap">
            <table>
              <thead><tr><th>Personal trainer</th><th>Specializzazioni</th><th>Stato</th><th>Codice</th><th>Punti</th><th /></tr></thead>
              <tbody>
                {trainers.data?.trainers.map((t) => (
                  <tr key={t.id}>
                    <td>{t.firstName} {t.lastName}<div className="muted">{t.email}</div></td>
                    <td>{t.specializations.join(', ') || '—'}</td>
                    <td><Badge status={t.status} /></td>
                    <td>{t.inviteCode}</td>
                    <td>{t.pointsBalance}</td>
                    <td>{actions('trainers', t)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {trainers.data?.trainers.length === 0 && <div className="empty">Nessun personal trainer in questo elenco.</div>}
        </div>
      )}

      {tab === 'users' && (
        <div className="stack">
          <form className="card row" style={{ alignItems: 'flex-end' }} onSubmit={search}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <Field label="Cerca per nome o email" value={q} onChange={(e) => setQ(e.target.value)} minLength={2} required />
            </div>
            <button className="btn">Cerca</button>
          </form>
          {users && (
            <div className="card">
              {users.length ? (
                <table>
                  <thead><tr><th>Utente</th><th>Ruolo</th><th>Stato</th><th>Registrato</th><th>Ultimo accesso</th></tr></thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.firstName} {u.lastName}<div className="muted">{u.email}</div></td>
                        <td>{ROLE_LABELS[u.role as keyof typeof ROLE_LABELS]}</td>
                        <td><Badge status={u.status} label={u.status === 'pending_parental_consent' ? 'Attesa consenso genitore' : undefined} /></td>
                        <td>{date(u.createdAt)}</td>
                        <td>{date(u.lastLoginAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="empty">Nessun risultato.</div>}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ================= Cornice ================= */

export function Dashboard() {
  const { user, signOut } = useAuth();
  if (!user) return null;
  const suffix = user.role === 'owner' || user.role === 'instructor' ? 'club' : user.role === 'personal_trainer' ? 'coach' : user.role === 'admin' ? 'admin' : undefined;
  const title =
    user.role === 'owner' ? user.ownedStructure?.displayName
    : user.role === 'instructor' ? user.instructorOf?.displayName
    : user.role === 'admin' ? 'Pannello BTECH'
    : `Ciao ${user.firstName}`;
  return (
    <div className="shell">
      <header className="topbar">
        <Logo size={34} suffix={suffix} />
        <div className="row">
          <span className="muted">{user.firstName} {user.lastName} · {ROLE_LABELS[user.role]}</span>
          <button className="btn ghost small" onClick={() => void signOut()}>Esci</button>
        </div>
      </header>
      <h1 style={{ marginBottom: 20 }}>{title}</h1>
      {user.role === 'owner' && <OwnerDashboard me={user} />}
      {user.role === 'instructor' && <InstructorArea me={user} />}
      {user.role === 'personal_trainer' && <TrainerArea me={user} />}
      {user.role === 'admin' && <AdminPanel />}
      {user.role === 'user' && (
        <div className="card stack">
          <h2>Il tuo allenamento è nell’app</h2>
          <p>Questo sito è l’area di strutture, personal trainer e team BTECH. Per piano, sedute, idratazione e community usa l’app MOTIX sul telefono.</p>
        </div>
      )}
    </div>
  );
}
