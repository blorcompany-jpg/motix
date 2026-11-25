import { useState, type FormEvent } from 'react';
import { euro as euroOf, type PointsResponse, type TrainerVideoView } from '@motix/shared';
import { api, upload } from '../../api';
import { Badge, ErrorBox, Field } from '../../ui';
import { date, useLoad } from './common';

const REASON = { subscription: 'Nuovo abbonamento', renewal: 'Rinnovo', bonus: 'Bonus', redemption: 'Premio richiesto', adjustment: 'Rettifica' } as const;
const REDEMPTION = { requested: 'In attesa', approved: 'Approvato', delivered: 'Consegnato', rejected: 'Rifiutato' } as const;
const REVIEW = { draft: 'Bozza', pending: 'In revisione', approved: 'Pubblicato', rejected: 'Non approvato' } as const;

/** Video del personal trainer: per i propri clienti (subito visibili) o per tutta la community (dopo la revisione di BTECH). */
export function TrainerVideos() {
  const videos = useLoad<{ videos: TrainerVideoView[] }>('/trainer/videos');
  const library = useLoad<{ exercises: Array<{ id: string; name: string }> }>('/exercises');
  const [file, setFile] = useState<File | null>(null);
  const [f, setF] = useState({ title: '', visibility: 'clients', exerciseId: '' });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) return;
    const form = e.currentTarget;
    setBusy(true);
    setError(null);
    try {
      const media = await upload(file);
      videos.setData(await api('POST', '/trainer/videos', { title: f.title, mediaId: media.id, visibility: f.visibility, exerciseId: f.exerciseId || undefined }));
      setF({ title: '', visibility: 'clients', exerciseId: '' });
      setFile(null);
      form.reset();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <form className="card stack" onSubmit={submit}>
        <h3>Carica un video</h3>
        <ErrorBox error={error ?? videos.error} />
        <div className="grid2">
          <Field label="Titolo" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={80} required />
          <label className="field">
            File video (MP4 o MOV, massimo 80 MB)
            <input type="file" accept="video/mp4,video/quicktime" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required aria-label="File video" />
          </label>
        </div>
        <div className="grid2">
          <label className="field">
            Chi lo vede
            <select value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value })}>
              <option value="clients">Solo i miei clienti</option>
              <option value="community">Tutta la community (dopo la revisione di BTECH)</option>
            </select>
          </label>
          <label className="field">
            Esercizio (facoltativo)
            <select value={f.exerciseId} onChange={(e) => setF({ ...f, exerciseId: e.target.value })} aria-label="Esercizio del video">
              <option value="">Nessuno</option>
              {library.data?.exercises.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        </div>
        <p className="muted">Se scegli un esercizio, i tuoi clienti vedono questo video quando lo trovano nel piano.</p>
        <div><button className="btn" disabled={busy || !file}>{busy ? 'Caricamento…' : 'Carica il video'}</button></div>
      </form>
      <div className="card">
        {videos.data?.videos.length ? (
          <table>
            <thead><tr><th>Video</th><th>Chi lo vede</th><th>Stato</th><th /></tr></thead>
            <tbody>
              {videos.data.videos.map((v) => (
                <tr key={v.id}>
                  <td><a href={v.url} target="_blank" rel="noreferrer">{v.title}</a><div className="muted">{[v.exercise, date(v.createdAt)].filter(Boolean).join(' · ')}</div></td>
                  <td>{v.visibility === 'clients' ? 'I miei clienti' : 'Community'}</td>
                  <td><Badge status={v.reviewStatus === 'approved' ? 'approved' : v.reviewStatus === 'rejected' ? 'rejected' : 'pending'} label={REVIEW[v.reviewStatus]} /></td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn danger small" onClick={async () => window.confirm('Eliminare questo video?') && videos.setData(await api('DELETE', `/trainer/videos/${v.id}`))}>Elimina</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="empty">Non hai ancora caricato video.</div>}
      </div>
    </div>
  );
}

/** Punti e premi: saldo, come si guadagnano, catalogo e richieste. */
export function TrainerPoints({ onBalance }: { onBalance: (n: number) => void }) {
  const points = useLoad<PointsResponse>('/trainer/points');
  const [error, setError] = useState<unknown>(null);
  const p = points.data;

  const redeem = async (id: string, name: string) => {
    if (!window.confirm(`Richiedere il premio «${name}»? I punti vengono scalati subito.`)) return;
    setError(null);
    try {
      const next = await api<PointsResponse>('POST', `/trainer/rewards/${id}/redeem`);
      points.setData(next);
      onBalance(next.balance);
    } catch (e) {
      setError(e);
    }
  };

  return (
    <div className="stack">
      <ErrorBox error={error ?? points.error} />
      {p && (
        <>
          <div className="grid2">
            <div className="card stack tight">
              <span className="eyebrow">Saldo</span>
              <div className="stat"><b>{p.balance} punti</b></div>
            </div>
            <div className="card stack tight">
              <h3>Come si guadagnano</h3>
              <p style={{ fontSize: 14 }}>• Per ogni tuo cliente che si abbona ricevi in punti il {p.rules.sharePct}% di quello che paga: con l’abbonamento annuale sono {p.rules.pointsPerSubscription} punti</p>
              <p style={{ fontSize: 14 }}>• Lo stesso a ogni rinnovo. Un punto vale {euroOf(p.rules.pointValueEur)} in premi fisici e buoni regalo</p>
              <p className="muted">I punti arrivano dopo il primo addebito: una prova disdetta non ne genera.</p>
            </div>
          </div>
          <div className="card stack">
            <h3>Premi</h3>
            {p.rewards.length ? (
              <table>
                <tbody>
                  {p.rewards.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}{r.description && <div className="muted">{r.description}</div>}</td>
                      <td>{r.pointsRequired} punti</td>
                      <td style={{ textAlign: 'right' }}>
                        {!r.available ? <span className="muted">Esaurito</span> : p.balance >= r.pointsRequired ? (
                          <button className="btn small" onClick={() => redeem(r.id, r.name)}>Richiedi</button>
                        ) : <span className="muted">Ti mancano {r.pointsRequired - p.balance} punti</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="empty">Il catalogo dei premi sarà pubblicato da BTECH.</div>}
          </div>
          {p.redemptions.length > 0 && (
            <div className="card stack">
              <h3>Le tue richieste</h3>
              <table>
                <tbody>
                  {p.redemptions.map((r) => (
                    <tr key={r.id}><td>{r.reward}</td><td>{r.points} punti</td><td><Badge status={r.status === 'rejected' ? 'rejected' : r.status === 'requested' ? 'pending' : 'approved'} label={REDEMPTION[r.status]} /></td><td className="muted">{date(r.at)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="card stack">
            <h3>Movimenti</h3>
            {p.movements.length ? (
              <table>
                <tbody>
                  {p.movements.map((m) => (
                    <tr key={m.id}>
                      <td>{REASON[m.reason]}{m.note && <div className="muted">{m.note}</div>}</td>
                      <td style={{ color: m.points > 0 ? 'var(--energia)' : 'var(--corallo)' }}>{m.points > 0 ? '+' : ''}{m.points}</td>
                      <td className="muted">saldo {m.balanceAfter}</td>
                      <td className="muted">{date(m.at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="empty">Ancora nessun movimento.</div>}
          </div>
        </>
      )}
    </div>
  );
}
