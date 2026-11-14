import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { brand, type AuthResponse } from '@motix/shared';
import { api } from '../api';
import { useAuth } from '../auth';
import { CenterCard, ErrorBox, Field, fieldsOf } from '../ui';

/** Consenso del genitore per chi ha tra 14 e 17 anni. */
export function ParentalConsent() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [info, setInfo] = useState<{ childFirstName: string; childLastName: string; parentName: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<'confirmed' | 'rejected' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('GET', `/auth/parental-consent/${token}`).then(setInfo).catch(setError);
  }, [token]);

  const decide = async (decision: 'confirm' | 'reject') => {
    setBusy(true);
    try {
      const r = await api<{ status: 'confirmed' | 'rejected' }>('POST', `/auth/parental-consent/${token}`, { decision });
      setDone(r.status);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <CenterCard>
      <span className="eyebrow">Consenso del genitore</span>
      {done === 'confirmed' && <div className="alert ok">Consenso registrato. {info?.childFirstName} può ora accedere a MOTIX.</div>}
      {done === 'rejected' && <div className="alert info">Consenso negato. L’account e i dati di {info?.childFirstName} sono stati cancellati.</div>}
      {!done && <ErrorBox error={error} />}
      {!done && info && (
        <>
          <h2>{info.childFirstName} {info.childLastName} chiede di usare MOTIX</h2>
          <p>
            Gentile {info.parentName}, MOTIX è l’app di allenamento, benessere e idratazione di {brand.company}. Tra i 14 e i 17 anni
            l’iscrizione richiede il consenso di un genitore.
          </p>
          <div className="card flat stack tight">
            <h3>A cosa acconsente</h3>
            <p style={{ fontSize: 14 }}>• Creazione dell’account e trattamento dei dati di allenamento e salute per personalizzare il piano.</p>
            <p style={{ fontSize: 14 }}>• Prova gratuita di 14 giorni; l’abbonamento a pagamento parte solo dagli store e si può disdire durante la prova.</p>
            <p style={{ fontSize: 14 }}>• Profilo nella community privato per impostazione predefinita.</p>
            <p style={{ fontSize: 14 }}>Può revocare il consenso in ogni momento scrivendo a BTECH: l’account verrà cancellato.</p>
          </div>
          <div className="row">
            <button className="btn" disabled={busy} onClick={() => decide('confirm')}>Do il consenso</button>
            <button className="btn danger" disabled={busy} onClick={() => decide('reject')}>Nego il consenso</button>
          </div>
        </>
      )}
    </CenterCard>
  );
}

/** Invito a un istruttore: crea il suo accesso. */
export function StaffInvite() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [info, setInfo] = useState<{ email: string; structure: { displayName: string; city: string } } | null>(null);
  const [f, setF] = useState({ firstName: '', lastName: '', password: '' });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const fe = fieldsOf(error);

  useEffect(() => {
    api('GET', `/auth/staff-invite/${token}`).then(setInfo).catch(setError);
  }, [token]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      signIn(await api<AuthResponse>('POST', '/auth/staff-invite/accept', { token, ...f }));
      nav('/app');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <CenterCard>
      <span className="eyebrow">Invito dello staff</span>
      <ErrorBox error={error} />
      {info && (
        <form className="stack" onSubmit={submit} noValidate>
          <h2>{info.structure.displayName} ti ha invitato come istruttore</h2>
          <p>Crea il tuo accesso per {info.email}.</p>
          <div className="grid2">
            <Field label="Nome" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} error={fe.firstName} />
            <Field label="Cognome" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} error={fe.lastName} />
          </div>
          <Field label="Password" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} error={fe.password} hint="Almeno 8 caratteri" autoComplete="new-password" />
          <button className="btn block" disabled={busy}>Crea l’accesso</button>
        </form>
      )}
    </CenterCard>
  );
}

export function VerifyEmail() {
  const [params] = useSearchParams();
  const [state, setState] = useState<'wait' | 'ok' | 'ko'>('wait');
  useEffect(() => {
    api('POST', '/auth/email/verify', { token: params.get('token') ?? '' }).then(() => setState('ok')).catch(() => setState('ko'));
  }, [params]);
  return (
    <CenterCard>
      <h2>Verifica dell’email</h2>
      {state === 'wait' && <p>Un momento…</p>}
      {state === 'ok' && <div className="alert ok">Email confermata. Puoi tornare all’app.</div>}
      {state === 'ko' && <div className="alert error">Link non valido o scaduto.</div>}
    </CenterCard>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('POST', '/auth/password/forgot', { email });
      setSent(true);
    } catch (err) {
      setError(err);
    }
  };
  return (
    <CenterCard>
      <h2>Password dimenticata</h2>
      {sent ? (
        <div className="alert ok">Se l’indirizzo è registrato, riceverai un’email con il link per scegliere una nuova password.</div>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          <ErrorBox error={error} />
          <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldsOf(error).email} />
          <button className="btn block">Invia il link</button>
        </form>
      )}
      <Link to="/login" style={{ fontSize: 14 }}>Torna all’accesso</Link>
    </CenterCard>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('POST', '/auth/password/reset', { token: params.get('token') ?? '', password });
      setDone(true);
    } catch (err) {
      setError(err);
    }
  };
  return (
    <CenterCard>
      <h2>Nuova password</h2>
      {done ? (
        <>
          <div className="alert ok">Password aggiornata.</div>
          <Link className="btn" to="/login">Accedi</Link>
        </>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          <ErrorBox error={error} />
          <Field label="Nuova password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={fieldsOf(error).password} hint="Almeno 8 caratteri" autoComplete="new-password" />
          <button className="btn block">Salva</button>
        </form>
      )}
    </CenterCard>
  );
}

/** Pagina aperta dal QR della struttura o dal link del personal trainer. */
export function JoinLanding({ kind }: { kind: 'structure' | 'trainer' }) {
  const { code = '' } = useParams();
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    api('GET', kind === 'structure' ? `/public/structures/${code}` : `/public/trainers/${code}`)
      .then((r) => setName(kind === 'structure' ? `${r.displayName} · ${r.city}` : `${r.firstName} ${r.lastName}`))
      .catch(setError);
  }, [code, kind]);
  return (
    <CenterCard>
      <span className="eyebrow">{kind === 'structure' ? 'La tua struttura ti invita' : 'Il tuo personal trainer ti invita'}</span>
      <ErrorBox error={error} />
      {name && (
        <>
          <h2>{name}</h2>
          <p>Scarica MOTIX, registrati e inserisci questo codice: hai 14 giorni di prova gratuita con tutte le funzioni.</p>
          <div className="code">{code.toUpperCase()}</div>
          <p className="muted">L’app sarà disponibile su App Store e Google Play.</p>
        </>
      )}
    </CenterCard>
  );
}
