import { useState } from 'react';
import { euro, type MemberRow, type StructurePackagesResponse } from '@motix/shared';
import { api } from '../../api';
import { Badge, ErrorBox, Field } from '../../ui';
import { date, useLoad } from './common';

const STATUS = { requested: 'In attesa di pagamento', paid: 'Pagato', cancelled: 'Annullato' } as const;

/**
 * Pacchetti facoltativi: la palestra compra abbonamenti annuali scontati e li regala ai suoi iscritti.
 * MOTIX per la palestra resta gratuito: questa è solo una possibilità in più.
 */
export function StructurePackages() {
  const state = useLoad<StructurePackagesResponse>('/structure/packages');
  const members = useLoad<{ members: MemberRow[] }>('/structure/members');
  const [seats, setSeats] = useState('');
  const [userId, setUserId] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const s = state.data;
  const run = async (fn: () => Promise<StructurePackagesResponse>, ok: string) => {
    setError(null);
    setNotice('');
    try {
      state.setData(await fn());
      setNotice(ok);
      void members.reload();
      return true;
    } catch (e) {
      setError(e);
      return false;
    }
  };
  const n = Number(seats) || 0;
  const candidates = (members.data?.members ?? []).filter((m) => m.subscriptionStatus !== 'active');
  return (
    <div className="stack">
      <div className="card stack tight">
        <h3>Regala MOTIX Premium ai tuoi iscritti</h3>
        <p>
          MOTIX per la tua palestra è gratis. Se vuoi includere l’abbonamento nella quota di iscrizione, puoi comprare abbonamenti annuali in blocco a
          {s ? ` ${euro(s.rules.unitPriceEur)} invece di ${euro(s.rules.listPriceEur)}` : ' prezzo scontato'}, da un minimo di {s?.rules.minSeats ?? '…'}.
        </p>
      </div>
      <ErrorBox error={error ?? state.error} />
      {notice && <div className="alert ok">{notice}</div>}
      {s && (
        <div className="grid2">
          <form
            className="card stack"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => api('POST', '/structure/packages', { seats: n }), 'Richiesta inviata: BTECH ti manda i dati per il pagamento.').then((ok) => ok && setSeats(''));
            }}
          >
            <h3>Richiedi un pacchetto</h3>
            <Field label="Quanti abbonamenti" type="number" min={s.rules.minSeats} value={seats} onChange={(e) => setSeats(e.target.value)} required />
            {n > 0 && <p>Totale: <b>{euro(n * s.rules.unitPriceEur)}</b> IVA inclusa</p>}
            <div><button className="btn">Richiedi</button></div>
          </form>
          <form
            className="card stack"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => api('POST', '/structure/packages/assign', { userId }), 'Abbonamento regalato: l’iscritto è Premium per un anno.').then((ok) => ok && setUserId(''));
            }}
          >
            <h3>Regala un abbonamento</h3>
            <p>Disponibili: <b>{s.seatsAvailable}</b></p>
            <label className="field">
              Iscritto
              <select value={userId} onChange={(e) => setUserId(e.target.value)} disabled={!s.seatsAvailable} aria-label="Iscritto">
                <option value="">Scegli un iscritto senza abbonamento…</option>
                {candidates.map((m) => <option key={m.id} value={m.id}>{m.sharesData ? `${m.firstName} ${m.lastName}` : `Iscritto dal ${date(m.joinedAt)} (dati non condivisi)`}</option>)}
              </select>
            </label>
            <div><button className="btn" disabled={!userId || !s.seatsAvailable}>Regala</button></div>
          </form>
        </div>
      )}
      {s && s.packages.length > 0 && (
        <div className="card">
          <table>
            <thead><tr><th>Pacchetto</th><th>Totale</th><th>Stato</th><th>Usati</th><th>Richiesto</th></tr></thead>
            <tbody>
              {s.packages.map((p) => (
                <tr key={p.id}>
                  <td>{p.seats} abbonamenti × {euro(p.unitPriceEur)}</td>
                  <td>{euro(p.totalEur)}</td>
                  <td><Badge status={p.status === 'paid' ? 'approved' : p.status === 'requested' ? 'pending' : 'rejected'} label={STATUS[p.status]} /></td>
                  <td>{p.status === 'paid' ? `${p.used} su ${p.seats}` : '—'}</td>
                  <td className="muted">{date(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {s && s.seats.length > 0 && (
        <div className="card">
          <h3>Abbonamenti regalati</h3>
          <table>
            <tbody>
              {s.seats.map((x) => <tr key={x.id}><td>{x.user?.name ?? 'Account cancellato'}</td><td className="muted">dal {date(x.assignedAt)} al {date(x.endsAt)}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
