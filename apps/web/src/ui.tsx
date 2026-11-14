import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { brand, logoPaths } from '@motix/shared';
import { ApiFailure } from './api';

export function Mark({ size = 40, plain = false }: { size?: number; plain?: boolean }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#38D3EE" />
          <stop offset="1" stopColor="#B5E853" />
        </linearGradient>
      </defs>
      {!plain && <rect width="120" height="120" rx="30" fill="#13203A" />}
      <path d={logoPaths.under} stroke="#EEF3FA" strokeWidth={logoPaths.strokeWidth} strokeLinecap="round" fill="none" />
      <path d={logoPaths.rise} stroke={`url(#${id})`} strokeWidth={logoPaths.strokeWidth} strokeLinecap="round" fill="none" />
      <circle {...logoPaths.dot} fill="#B5E853" />
    </svg>
  );
}

export function Logo({ size = 40, suffix }: { size?: number; suffix?: string }) {
  return (
    <span className="row" style={{ gap: size * 0.28 }}>
      <Mark size={size} />
      <span className="wordmark" style={{ fontSize: size * 0.72 }}>
        moti<b>x</b>
        {suffix && <span style={{ color: 'var(--acqua)', fontSize: '0.6em', marginLeft: 6, fontWeight: 600 }}>{suffix}</span>}
      </span>
    </span>
  );
}

export function Field({
  label,
  error,
  hint,
  ...props
}: { label: string; error?: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const note = error ?? hint;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-invalid={error ? true : undefined} aria-describedby={note ? `${id}-note` : undefined} {...props} />
      {note && (
        <span id={`${id}-note`} className={error ? 'field-error' : 'muted'}>
          {note}
        </span>
      )}
    </div>
  );
}

export function Check({ children, ...props }: { children: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="check">
      <input type="checkbox" {...props} />
      <span>{children}</span>
    </label>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof ApiFailure ? error.message : 'Si è verificato un errore: riprova';
  return (
    <div className="alert error" role="alert">
      {message}
    </div>
  );
}

export const fieldsOf = (e: unknown): Record<string, string> => (e instanceof ApiFailure ? e.fields : {});

const STATUS_LABELS: Record<string, string> = {
  pending: 'In attesa',
  approved: 'Approvato',
  rejected: 'Rifiutato',
  suspended: 'Sospeso',
  active: 'Attivo',
  trial: 'In prova',
  cancelled: 'Disdetto',
  expired: 'Scaduto',
  free: 'Gratuito',
  invited_by_structure: 'Invitato',
  requested_by_trainer: 'Ha chiesto di collaborare',
  requested_by_user: 'Richiesta da accettare',
  requested_by_trainer_client: 'Invito inviato',
};

export function Badge({ status, label }: { status: string; label?: string }) {
  const tone = ['pending', 'approved', 'rejected', 'suspended', 'active'].includes(status)
    ? status
    : status.startsWith('requested') || status.startsWith('invited')
      ? 'pending'
      : 'neutral';
  return <span className={`badge ${tone}`}>{label ?? STATUS_LABELS[status] ?? status}</span>;
}

/** Cornice delle pagine di accesso: brand a sinistra, modulo a destra. */
export function AuthLayout({ title, lead, children, suffix }: { title: ReactNode; lead: string; children: ReactNode; suffix?: string }) {
  return (
    <div className="auth">
      <aside className="auth-hero">
        <Logo size={44} suffix={suffix} />
        <div className="stack">
          <span className="eyebrow">{brand.payoff}</span>
          <h1>{title}</h1>
          <p style={{ fontSize: 17, maxWidth: 460 }}>{lead}</p>
        </div>
        <span className="muted">Un’app di {brand.company}</span>
        <span className="mark-bg">
          <Mark size={520} plain />
        </span>
      </aside>
      <main className="auth-main">
        <div className="stack">{children}</div>
      </main>
    </div>
  );
}

export function CenterCard({ children }: { children: ReactNode }) {
  return (
    <div className="center-page">
      <div className="card stack">
        <Logo size={36} />
        {children}
      </div>
    </div>
  );
}
