import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { STRUCTURE_TYPES, STRUCTURE_TYPE_LABELS, type AuthResponse } from '@motix/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import { AuthLayout, Check, ErrorBox, Field, fieldsOf } from '../ui';

export function RegisterStructure() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({
    firstName: '', lastName: '', email: '', password: '',
    legalName: '', displayName: '', type: 'gym', vatNumber: '', city: '', province: '', phone: '', membersEstimate: '',
    acceptTerms: false,
  });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const fe = fieldsOf(error);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((v) => ({ ...v, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<AuthResponse>('POST', '/auth/register/structure', {
        owner: { firstName: f.firstName, lastName: f.lastName, email: f.email, password: f.password },
        acceptTerms: f.acceptTerms,
        structure: {
          legalName: f.legalName,
          displayName: f.displayName,
          type: f.type,
          vatNumber: f.vatNumber || undefined,
          city: f.city,
          province: f.province,
          phone: f.phone || undefined,
          membersEstimate: f.membersEstimate ? Number(f.membersEstimate) : undefined,
        },
      });
      signIn(res);
      nav('/app');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      suffix="club"
      title={<>Affilia la tua struttura. È gratis.</>}
      lead="Dashboard, CRM e alert di abbandono senza costi: i tuoi iscritti provano MOTIX per 14 giorni con il codice della struttura."
    >
      <div className="stack tight">
        <h2>Richiesta di affiliazione</h2>
        <p>Il team BTECH la verifica e ti invia codice e QR per i tuoi iscritti.</p>
      </div>
      <form className="stack" onSubmit={submit} noValidate>
        <ErrorBox error={error} />
        <h3>La struttura</h3>
        <Field label="Nome della struttura" value={f.displayName} onChange={set('displayName')} error={fe['structure.displayName']} placeholder="Es. Fit Bari" />
        <Field label="Ragione sociale" value={f.legalName} onChange={set('legalName')} error={fe['structure.legalName']} />
        <div className="grid2">
          <label className="field">
            Tipo
            <select value={f.type} onChange={set('type')}>
              {STRUCTURE_TYPES.map((t) => <option key={t} value={t}>{STRUCTURE_TYPE_LABELS[t]}</option>)}
            </select>
          </label>
          <Field label="Partita IVA / C.F." value={f.vatNumber} onChange={set('vatNumber')} error={fe['structure.vatNumber']} />
        </div>
        <div className="grid2">
          <Field label="Città" value={f.city} onChange={set('city')} error={fe['structure.city']} />
          <Field label="Provincia" value={f.province} onChange={set('province')} error={fe['structure.province']} maxLength={2} placeholder="BA" />
        </div>
        <div className="grid2">
          <Field label="Telefono" value={f.phone} onChange={set('phone')} />
          <Field label="Iscritti (circa)" type="number" min={0} value={f.membersEstimate} onChange={set('membersEstimate')} />
        </div>
        <h3>Il titolare</h3>
        <div className="grid2">
          <Field label="Nome" value={f.firstName} onChange={set('firstName')} error={fe['owner.firstName']} autoComplete="given-name" />
          <Field label="Cognome" value={f.lastName} onChange={set('lastName')} error={fe['owner.lastName']} autoComplete="family-name" />
        </div>
        <Field label="Email" type="email" value={f.email} onChange={set('email')} error={fe['owner.email']} autoComplete="email" />
        <Field label="Password" type="password" value={f.password} onChange={set('password')} error={fe['owner.password']} hint="Almeno 8 caratteri" autoComplete="new-password" />
        <Check checked={f.acceptTerms} onChange={(e) => setF((v) => ({ ...v, acceptTerms: e.target.checked }))}>
          Accetto le condizioni di affiliazione e l’informativa privacy di BTECH S.r.l.
        </Check>
        {fe.acceptTerms && <span className="field-error">{fe.acceptTerms}</span>}
        <button className="btn block" disabled={busy}>{busy ? 'Invio…' : 'Invia la richiesta'}</button>
        <p style={{ fontSize: 14 }}>Hai già un account? <Link to="/login">Accedi</Link></p>
      </form>
    </AuthLayout>
  );
}
