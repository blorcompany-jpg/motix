import { useState, type FormEvent } from 'react';
import { ROLE_LABELS, STRUCTURE_TYPE_LABELS, type StructureType } from '@motix/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import { Badge, ErrorBox, Field, Logo } from '../ui';
import { Stat, Tabs, date, useLoad } from './dashboard/common';
import { Moderation, RewardsAdmin, ShopAdmin } from './dashboard/AdminExtras';
import { SensorsAdmin } from './dashboard/Sensors';
import { StructureDashboard } from './dashboard/Owner';
import { TrainerArea } from './dashboard/Trainer';

/* ================= Pannello BTECH ================= */

function AdminPanel() {
  const [tab, setTab] = useState<'structures' | 'trainers' | 'users' | 'sensors' | 'moderation' | 'shop' | 'rewards'>('structures');
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
      <Tabs tabs={{ structures: 'Strutture', trainers: 'Personal trainer', users: 'Utenti', sensors: 'Sensori', moderation: 'Moderazione', shop: 'Shop', rewards: 'Punti e premi' }} value={tab} onChange={setTab} />
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

      {tab === 'sensors' && <SensorsAdmin />}
      {tab === 'moderation' && <Moderation />}
      {tab === 'shop' && <ShopAdmin />}
      {tab === 'rewards' && <RewardsAdmin />}

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
                  <thead><tr><th>Utente</th><th>Ruolo</th><th>Stato</th><th>Registrato</th><th>Ultimo accesso</th><th /></tr></thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.firstName} {u.lastName}<div className="muted">{u.email}</div></td>
                        <td>{ROLE_LABELS[u.role as keyof typeof ROLE_LABELS]}</td>
                        <td><Badge status={u.status} label={u.status === 'pending_parental_consent' ? 'Attesa consenso genitore' : undefined} /></td>
                        <td>{date(u.createdAt)}</td>
                        <td>{date(u.lastLoginAt)}</td>
                        <td style={{ textAlign: 'right' }}>
                          {u.role === 'user' && (
                            <button
                              className="btn ghost small"
                              onClick={async () => {
                                if (!window.confirm(`Attivare l’abbonamento di ${u.firstName} ${u.lastName}? Se ha un personal trainer, gli vengono assegnati i punti.`)) return;
                                setError(null);
                                try {
                                  const r = await api<{ points: number }>('POST', `/admin/users/${u.id}/subscription/activate`);
                                  window.alert(r.points ? `Abbonamento attivato: ${r.points} punti al personal trainer.` : 'Abbonamento attivato.');
                                } catch (e) {
                                  setError(e);
                                }
                              }}
                            >
                              Attiva abbonamento
                            </button>
                          )}
                        </td>
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
      {(user.role === 'owner' || user.role === 'instructor') && <StructureDashboard me={user} />}
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
