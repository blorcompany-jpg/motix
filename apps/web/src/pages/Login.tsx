import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { AuthResponse } from '@motix/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import { AuthLayout, ErrorBox, Field } from '../ui';

export function Login() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      signIn(await api<AuthResponse>('POST', '/auth/login', { email, password }));
      nav('/app');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={<>Dal dato al miglioramento reale.</>}
      lead="L’area riservata di strutture, personal trainer e team BTECH: iscritti, clienti, codici di invito e affiliazioni in un unico posto."
    >
      <div className="stack tight">
        <h2>Accedi</h2>
        <p>Entra nella tua area MOTIX.</p>
      </div>
      <form className="stack" onSubmit={submit} noValidate>
        <ErrorBox error={error} />
        <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="btn block" disabled={busy}>{busy ? 'Accesso…' : 'Accedi'}</button>
        <Link to="/password-dimenticata" style={{ fontSize: 14 }}>Password dimenticata?</Link>
      </form>
      <div className="card flat stack tight">
        <h3>Non hai ancora un account?</h3>
        <p style={{ fontSize: 14 }}>L’affiliazione è gratuita per strutture e personal trainer.</p>
        <div className="row">
          <Link className="btn ghost small" to="/affiliazione">Affilia la tua struttura</Link>
          <Link className="btn ghost small" to="/pt/registrazione">Sono un personal trainer</Link>
        </div>
      </div>
    </AuthLayout>
  );
}
