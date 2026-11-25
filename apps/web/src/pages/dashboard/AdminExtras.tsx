import { useState, type FormEvent } from 'react';
import { SHOP_CATEGORIES, SHOP_CATEGORY_LABELS } from '@motix/shared';
import { api } from '../../api';
import { Badge, ErrorBox, Field } from '../../ui';
import { date, useLoad } from './common';

const REDEMPTION = { requested: 'In attesa', approved: 'Approvato', delivered: 'Consegnato', rejected: 'Rifiutato' } as const;

/** Moderazione: segnalazioni della community e video dei personal trainer da approvare. */
export function Moderation() {
  const reports = useLoad<{ reports: any[] }>('/admin/reports');
  const videos = useLoad<{ videos: any[] }>('/admin/trainer-videos');
  const [error, setError] = useState<unknown>(null);
  const act = async (path: string, reload: () => Promise<void>) => {
    setError(null);
    try {
      await api('POST', path);
      await reload();
    } catch (e) {
      setError(e);
    }
  };
  return (
    <div className="stack">
      <ErrorBox error={error ?? reports.error ?? videos.error} />
      <div className="card stack">
        <h3>Segnalazioni da esaminare</h3>
        {reports.data?.reports.map((r) => (
          <div key={r.id} className="card flat stack tight">
            <div className="row between">
              <b>{r.targetType === 'post' ? 'Post' : r.targetType === 'comment' ? 'Commento' : r.targetType === 'user' ? 'Utente' : 'Video'} di {r.author?.name ?? 'autore non trovato'}</b>
              <span className="muted">{date(r.at)}</span>
            </div>
            <p style={{ fontSize: 14 }}>Motivo: {r.reason} · segnalato da {r.reporter}</p>
            {r.content?.text && <p style={{ fontSize: 14, color: 'var(--ghiaccio)' }}>«{r.content.text}»</p>}
            {r.content?.mediaUrl && <a href={r.content.mediaUrl} target="_blank" rel="noreferrer">Apri {r.content.mediaType === 'video' ? 'il video' : 'la foto'}</a>}
            <div className="row">
              <button className="btn ghost small" onClick={() => act(`/admin/reports/${r.id}/dismiss`, reports.reload)}>Nessuna violazione</button>
              <button className="btn danger small" onClick={() => act(`/admin/reports/${r.id}/remove`, reports.reload)}>Rimuovi il contenuto</button>
              <button className="btn danger small" onClick={() => window.confirm('Rimuovere il contenuto e sospendere l’autore?') && act(`/admin/reports/${r.id}/suspend`, reports.reload)}>Rimuovi e sospendi l’autore</button>
            </div>
          </div>
        ))}
        {reports.data?.reports.length === 0 && <div className="empty">Nessuna segnalazione in attesa.</div>}
      </div>
      <div className="card stack">
        <h3>Video dei personal trainer per la community</h3>
        {videos.data?.videos.length ? (
          <table>
            <tbody>
              {videos.data.videos.map((v) => (
                <tr key={v.id}>
                  <td><a href={v.url} target="_blank" rel="noreferrer">{v.title}</a><div className="muted">{v.trainerName} · {date(v.createdAt)}</div></td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn small" onClick={() => act(`/admin/trainer-videos/${v.id}/approve`, videos.reload)}>Approva</button>
                      <button className="btn danger small" onClick={() => act(`/admin/trainer-videos/${v.id}/reject`, videos.reload)}>Rifiuta</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="empty">Nessun video da approvare.</div>}
      </div>
    </div>
  );
}

/** Catalogo dello shop: ogni voce rimanda a una pagina del sito BLOR. */
export function ShopAdmin() {
  const catalog = useLoad<{ products: any[] }>('/admin/shop/products');
  const [f, setF] = useState({ name: '', category: 'equipment', blorUrl: '', position: '10' });
  const [error, setError] = useState<unknown>(null);
  const run = async (fn: () => Promise<any>) => {
    setError(null);
    try {
      catalog.setData(await fn());
      return true;
    } catch (e) {
      setError(e);
      return false;
    }
  };
  const add = (e: FormEvent) => {
    e.preventDefault();
    void run(() => api('POST', '/admin/shop/products', { ...f, position: Number(f.position) || 0 })).then((ok) => ok && setF({ ...f, name: '', blorUrl: '' }));
  };
  return (
    <div className="stack">
      <ErrorBox error={error ?? catalog.error} />
      <form className="card stack" onSubmit={add}>
        <h3>Aggiungi una voce</h3>
        <div className="grid2">
          <Field label="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          <label className="field">
            Categoria
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {SHOP_CATEGORIES.map((c) => <option key={c} value={c}>{SHOP_CATEGORY_LABELS[c]}</option>)}
            </select>
          </label>
        </div>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 260 }}><Field label="Link alla pagina su blorcompany.com" value={f.blorUrl} onChange={(e) => setF({ ...f, blorUrl: e.target.value })} placeholder="https://blorcompany.com/…" required /></div>
          <div style={{ width: 110 }}><Field label="Ordine" type="number" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} /></div>
          <button className="btn">Aggiungi</button>
        </div>
      </form>
      <div className="card">
        <table>
          <thead><tr><th>Voce</th><th>Categoria</th><th>Link</th><th>Visibile</th><th /></tr></thead>
          <tbody>
            {catalog.data?.products.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{SHOP_CATEGORY_LABELS[p.category as keyof typeof SHOP_CATEGORY_LABELS]}</td>
                <td><a href={p.blorUrl} target="_blank" rel="noreferrer" style={{ overflowWrap: 'anywhere' }}>{p.blorUrl.replace('https://', '')}</a></td>
                <td><Badge status={p.visible ? 'approved' : 'neutral'} label={p.visible ? 'Sì' : 'No'} /></td>
                <td style={{ textAlign: 'right' }}>
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn ghost small" onClick={() => run(() => api('PUT', `/admin/shop/products/${p.id}`, { name: p.name, category: p.category, blorUrl: p.blorUrl, imageUrl: p.imageUrl ?? undefined, position: p.position, visible: !p.visible }))}>{p.visible ? 'Nascondi' : 'Mostra'}</button>
                    <button className="btn danger small" onClick={() => window.confirm(`Eliminare «${p.name}»?`) && run(() => api('DELETE', `/admin/shop/products/${p.id}`))}>Elimina</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Punti e premi: valore dei punti, catalogo e richieste dei personal trainer. */
export function RewardsAdmin() {
  const state = useLoad<{ rules: { sharePct: number; pointValueEur: number; pointsPerSubscription: number }; rewards: any[]; redemptions: any[] }>('/admin/rewards');
  const [rules, setRules] = useState<{ sharePct: string; pointValueEur: string } | null>(null);
  const [f, setF] = useState({ name: '', description: '', pointsRequired: '', stock: '' });
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const s = state.data;
  const r = rules ?? (s ? { sharePct: String(s.rules.sharePct), pointValueEur: String(s.rules.pointValueEur) } : { sharePct: '', pointValueEur: '' });
  const run = async (fn: () => Promise<any>, ok?: string) => {
    setError(null);
    setNotice('');
    try {
      state.setData(await fn());
      if (ok) setNotice(ok);
      return true;
    } catch (e) {
      setError(e);
      return false;
    }
  };
  return (
    <div className="stack">
      <ErrorBox error={error ?? state.error} />
      {notice && <div className="alert ok">{notice}</div>}
      <form className="card stack" onSubmit={(e) => { e.preventDefault(); void run(() => api('PUT', '/admin/points/rules', { sharePct: Number(r.sharePct), pointValueEur: Number(r.pointValueEur) }), 'Valore dei punti aggiornato'); }}>
        <h3>Quota dei professionisti in punti</h3>
        <p className="muted">Per ogni abbonato portato da un professionista: percentuale di quanto ha pagato, alla sottoscrizione e a ogni rinnovo.</p>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ width: 200 }}><Field label="Quota (%)" type="number" min={0} max={100} step={0.5} value={r.sharePct} onChange={(e) => setRules({ ...r, sharePct: e.target.value })} /></div>
          <div style={{ width: 200 }}><Field label="Valore di 1 punto (€)" type="number" min={0.01} step={0.01} value={r.pointValueEur} onChange={(e) => setRules({ ...r, pointValueEur: e.target.value })} /></div>
          <button className="btn">Salva</button>
        </div>
        {s && <p style={{ fontSize: 14 }}>Con l’abbonamento annuale a €49,99 un professionista riceve <b>{s.rules.pointsPerSubscription} punti</b> per ogni cliente.</p>}
      </form>
      <form className="card stack" onSubmit={(e) => { e.preventDefault(); void run(() => api('POST', '/admin/rewards', { name: f.name, description: f.description || undefined, pointsRequired: Number(f.pointsRequired), stock: f.stock === '' ? null : Number(f.stock) })).then((ok) => ok && setF({ name: '', description: '', pointsRequired: '', stock: '' })); }}>
        <h3>Catalogo dei premi</h3>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: 200 }}><Field label="Nome del premio" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
          <div style={{ width: 140 }}><Field label="Punti richiesti" type="number" min={1} value={f.pointsRequired} onChange={(e) => setF({ ...f, pointsRequired: e.target.value })} required /></div>
          <div style={{ width: 150 }}><Field label="Pezzi disponibili" type="number" min={0} value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} placeholder="illimitati" /></div>
          <button className="btn">Aggiungi</button>
        </div>
        {s?.rewards.length ? (
          <table>
            <tbody>
              {s.rewards.map((x) => (
                <tr key={x.id}>
                  <td>{x.name}</td>
                  <td>{x.pointsRequired} punti</td>
                  <td>{x.stock === null ? 'Illimitati' : `${x.stock} disponibili`}</td>
                  <td><Badge status={x.active ? 'approved' : 'neutral'} label={x.active ? 'Attivo' : 'Nascosto'} /></td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn ghost small" onClick={() => run(() => api('PUT', `/admin/rewards/${x.id}`, { name: x.name, description: x.description ?? undefined, pointsRequired: x.pointsRequired, stock: x.stock, active: !x.active }))}>{x.active ? 'Nascondi' : 'Riattiva'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="empty">Ancora nessun premio.</div>}
      </form>
      <div className="card stack">
        <h3>Richieste dei personal trainer</h3>
        {s?.redemptions.length ? (
          <table>
            <tbody>
              {s.redemptions.map((x) => (
                <tr key={x.id}>
                  <td>{x.reward}<div className="muted">{x.trainer} · {x.email}</div></td>
                  <td>{x.points} punti</td>
                  <td><Badge status={x.status === 'rejected' ? 'rejected' : x.status === 'requested' ? 'pending' : 'approved'} label={REDEMPTION[x.status as keyof typeof REDEMPTION]} /></td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      {x.status === 'requested' && <button className="btn small" onClick={() => run(() => api('POST', `/admin/redemptions/${x.id}/approve`))}>Approva</button>}
                      {(x.status === 'requested' || x.status === 'approved') && <button className="btn ghost small" onClick={() => run(() => api('POST', `/admin/redemptions/${x.id}/deliver`))}>Consegnato</button>}
                      {(x.status === 'requested' || x.status === 'approved') && <button className="btn danger small" onClick={() => window.confirm('Rifiutare la richiesta? I punti tornano al personal trainer.') && run(() => api('POST', `/admin/redemptions/${x.id}/reject`))}>Rifiuta</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="empty">Nessuna richiesta.</div>}
      </div>
    </div>
  );
}

/** Pacchetti di abbonamenti richiesti dalle palestre: BTECH conferma il pagamento ricevuto e imposta prezzo e minimo. */
export function PackagesAdmin() {
  const state = useLoad<{ rules: { minSeats: number; unitPriceEur: number }; packages: any[] }>('/admin/packages');
  const [rules, setRules] = useState<{ minSeats: string; unitPriceEur: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const s = state.data;
  const r = rules ?? (s ? { minSeats: String(s.rules.minSeats), unitPriceEur: String(s.rules.unitPriceEur) } : { minSeats: '', unitPriceEur: '' });
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setError(null);
    setNotice('');
    try {
      await fn();
      setNotice(ok);
      await state.reload();
    } catch (e) {
      setError(e);
    }
  };
  const STATUS = { requested: 'In attesa di pagamento', paid: 'Pagato', cancelled: 'Annullato' } as const;
  return (
    <div className="stack">
      <ErrorBox error={error ?? state.error} />
      {notice && <div className="alert ok">{notice}</div>}
      <form className="card stack" onSubmit={(e) => { e.preventDefault(); void run(() => api('PUT', '/admin/packages/rules', { minSeats: Number(r.minSeats), unitPriceEur: Number(r.unitPriceEur) }), 'Condizioni aggiornate'); }}>
        <h3>Condizioni dei pacchetti</h3>
        <p className="muted">Facoltativi: la palestra compra abbonamenti annuali in blocco per regalarli ai suoi iscritti. Prezzo pieno per l’utente: €49,99.</p>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ width: 200 }}><Field label="Abbonamenti minimi" type="number" min={1} value={r.minSeats} onChange={(e) => setRules({ ...r, minSeats: e.target.value })} /></div>
          <div style={{ width: 220 }}><Field label="Prezzo per abbonamento (€, IVA incl.)" type="number" min={0} step={0.01} value={r.unitPriceEur} onChange={(e) => setRules({ ...r, unitPriceEur: e.target.value })} /></div>
          <button className="btn">Salva</button>
        </div>
      </form>
      <div className="card">
        {s?.packages.length ? (
          <table>
            <thead><tr><th>Palestra</th><th>Abbonamenti</th><th>Totale</th><th>Stato</th><th>Richiesto</th><th /></tr></thead>
            <tbody>
              {s.packages.map((p) => (
                <tr key={p.id}>
                  <td>{p.structure}<div className="muted">{p.city}</div></td>
                  <td>{p.seats} × €{p.unitPriceEur.toFixed(2).replace('.', ',')}</td>
                  <td>€{p.totalEur.toFixed(2).replace('.', ',')}</td>
                  <td><Badge status={p.status === 'paid' ? 'approved' : p.status === 'requested' ? 'pending' : 'rejected'} label={STATUS[p.status as keyof typeof STATUS]} /></td>
                  <td className="muted">{date(p.createdAt)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {p.status === 'requested' && (
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn small" onClick={() => window.confirm(`Confermi di aver ricevuto €${p.totalEur.toFixed(2).replace('.', ',')} da ${p.structure}?`) && void run(() => api('POST', `/admin/packages/${p.id}/confirm`), 'Pagamento confermato: gli abbonamenti sono disponibili per la palestra')}>Pagamento ricevuto</button>
                        <button className="btn danger small" onClick={() => void run(() => api('POST', `/admin/packages/${p.id}/cancel`), 'Richiesta annullata')}>Annulla</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="empty">Nessun pacchetto richiesto.</div>}
      </div>
    </div>
  );
}
