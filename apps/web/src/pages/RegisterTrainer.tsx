import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PROFESSIONS, PROFESSION_LABELS, REGISTERED_PROFESSIONS, type AuthResponse, type Profession } from '@motix/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import { AuthLayout, Check, ErrorBox, Field, fieldsOf } from '../ui';

export function RegisterTrainer() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [f, setF] = useState({
    firstName: '', lastName: '', email: '', password: '', birthDate: '',
    specializations: '', bio: '', structureCode: params.get('struttura') ?? '', acceptTerms: false,
    profession: 'personal_trainer' as Profession, city: '', registerName: '', registerNumber: '',
  });
  const needsRegister = REGISTERED_PROFESSIONS.includes(f.profession);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const fe = fieldsOf(error);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((v) => ({ ...v, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<AuthResponse>('POST', '/auth/register/trainer', {
        firstName: f.firstName,
        lastName: f.lastName,
        email: f.email,
        password: f.password,
        birthDate: f.birthDate,
        acceptTerms: f.acceptTerms,
        specializations: f.specializations.split(',').map((s) => s.trim()).filter(Boolean),
        bio: f.bio || undefined,
        structureCode: f.structureCode || undefined,
        profession: f.profession,
        city: f.city || undefined,
        registerName: needsRegister ? f.registerName || undefined : undefined,
        registerNumber: needsRegister ? f.registerNumber || undefined : undefined,
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
      suffix="coach"
      title={<>Segui i tuoi clienti, ovunque si allenino.</>}
      lead="Per i professionisti MOTIX è gratis, con tutte le funzioni: schede e template, piani alimentari, check-in, chat, report del sensore. E per ogni cliente abbonato ricevi in punti il 20% del suo abbonamento, da convertire in premi e buoni regalo."
    >
      <div className="stack tight">
        <h2>Registrati come professionista</h2>
        <p>Dopo la verifica di BTECH ricevi il tuo codice di invito per i clienti.</p>
      </div>
      <form className="stack" onSubmit={submit} noValidate>
        <ErrorBox error={error} />
        <div className="grid2">
          <Field label="Nome" value={f.firstName} onChange={set('firstName')} error={fe.firstName} autoComplete="given-name" />
          <Field label="Cognome" value={f.lastName} onChange={set('lastName')} error={fe.lastName} autoComplete="family-name" />
        </div>
        <Field label="Email" type="email" value={f.email} onChange={set('email')} error={fe.email} autoComplete="email" />
        <div className="grid2">
          <Field label="Password" type="password" value={f.password} onChange={set('password')} error={fe.password} hint="Almeno 8 caratteri" autoComplete="new-password" />
          <Field label="Data di nascita" type="date" value={f.birthDate} onChange={set('birthDate')} error={fe.birthDate} />
        </div>
        <div className="grid2">
          <label className="field">
            Che professionista sei
            <select value={f.profession} onChange={(e) => setF((v) => ({ ...v, profession: e.target.value as Profession }))} aria-label="Professione">
              {PROFESSIONS.map((p) => <option key={p} value={p}>{PROFESSION_LABELS[p]}</option>)}
            </select>
          </label>
          <Field label="Città" value={f.city} onChange={set('city')} error={fe.city} autoComplete="address-level2" />
        </div>
        {needsRegister && (
          <>
            <div className="grid2">
              <Field label="Albo o ordine" value={f.registerName} onChange={set('registerName')} error={fe.registerName} placeholder={f.profession === 'nutritionist' ? 'Ordine dei Biologi, Albo dei Dietisti…' : 'Albo dei Fisioterapisti…'} />
              <Field label="Numero di iscrizione" value={f.registerNumber} onChange={set('registerNumber')} error={fe.registerNumber} />
            </div>
            <p className="muted" style={{ fontSize: 13 }}>
              BTECH verifica l’iscrizione sul sito dell’ordine. {f.profession === 'nutritionist' ? 'Dopo la verifica puoi creare piani alimentari per i tuoi clienti.' : ''}
            </p>
          </>
        )}
        <Field label="Specializzazioni" value={f.specializations} onChange={set('specializations')} hint="Separate da virgola: forza, posturale, dimagrimento…" />
        <Field label="Codice della struttura (facoltativo)" value={f.structureCode} onChange={set('structureCode')} error={fe.structureCode} placeholder="MX…" />
        <Check checked={f.acceptTerms} onChange={(e) => setF((v) => ({ ...v, acceptTerms: e.target.checked }))}>
          Accetto i termini di servizio e l’informativa privacy di BTECH S.r.l.
        </Check>
        {fe.acceptTerms && <span className="field-error">{fe.acceptTerms}</span>}
        <button className="btn block" disabled={busy}>{busy ? 'Invio…' : 'Crea il profilo'}</button>
        <p style={{ fontSize: 14 }}>Hai già un account? <Link to="/login">Accedi</Link></p>
      </form>
    </AuthLayout>
  );
}
