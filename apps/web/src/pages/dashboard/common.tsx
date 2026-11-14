import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  GOAL_LABELS,
  LEVEL_LABELS,
  LIMITATION_LABELS,
  type ChatMessage,
  type ClientReport,
  type ConversationSummary,
  type RiskInfo,
} from '@motix/shared';
import { api } from '../../api';
import { Badge, ErrorBox } from '../../ui';

/** Carica dati dall'API e li ricarica su richiesta. */
export function useLoad<T>(path: string | null) {
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

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Record<T, string>; value: T; onChange: (t: T) => void }) {
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

export const Stat = ({ value, label }: { value: ReactNode; label: string }) => (
  <div className="card flat stat">
    <b>{value}</b>
    <span>{label}</span>
  </div>
);

export const date = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString('it-IT') : '—');


export const kg = (n: number) => `${n.toLocaleString('it-IT', { maximumFractionDigits: 1 })} kg`;
export const shortDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

const RISK_LABEL = { low: 'Basso', medium: 'Medio', high: 'Alto' } as const;

export function RiskBadge({ risk }: { risk: RiskInfo | null }) {
  if (!risk) return <span className="muted">—</span>;
  return <span className={`badge risk-${risk.level}`}>{RISK_LABEL[risk.level]}</span>;
}

/** Report di un utente: profilo, rischio, sedute, forza, peso e idratazione. */
export function ReportView({ report: r }: { report: ClientReport }) {
  const sessions = r.weeks.reduce((n, w) => n + w.sessions, 0);
  const max = Math.max(1, ...r.weeks.map((w) => w.sessions));
  return (
    <div className="stack">
      <div className="grid4">
        <Stat value={sessions} label="Sedute nelle ultime 4 settimane" />
        <Stat value={r.lastSessionDay ? shortDay(r.lastSessionDay) : '—'} label="Ultima seduta" />
        <Stat value={r.weight.length ? kg(r.weight.at(-1)!.weightKg) : '—'} label="Peso" />
        <Stat value={r.hydration.trackedDays ? `${(r.hydration.averageMl / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })} L` : '—'} label="Acqua al giorno, in media" />
      </div>
      <div className="grid2">
        <div className="card flat stack tight">
          <div className="row between">
            <h3>Rischio abbandono</h3>
            <RiskBadge risk={r.risk} />
          </div>
          {r.risk.reasons.length ? r.risk.reasons.map((x) => <p key={x} style={{ fontSize: 14 }}>• {x}</p>) : <p style={{ fontSize: 14 }}>Si allena con regolarità.</p>}
          {r.risk.suggestion && <p style={{ fontSize: 14, color: 'var(--acqua)' }}>Azione suggerita: {r.risk.suggestion}</p>}
        </div>
        <div className="card flat stack tight">
          <h3>Profilo</h3>
          {r.profile?.goal ? (
            <>
              <p style={{ fontSize: 14 }}>Obiettivo: {GOAL_LABELS[r.profile.goal]} · Livello: {r.profile.level ? LEVEL_LABELS[r.profile.level] : '—'} · {r.profile.daysPerWeek} giorni a settimana</p>
              <p style={{ fontSize: 14 }}>Limitazioni: {r.profile.limitations.length ? r.profile.limitations.map((l) => LIMITATION_LABELS[l].toLowerCase()).join(', ') : 'nessuna'}</p>
            </>
          ) : (
            <p style={{ fontSize: 14 }}>Non ha ancora compilato il questionario.</p>
          )}
          <p style={{ fontSize: 14 }}>Abbonamento: {r.subscriptionStatus ? <Badge status={r.subscriptionStatus} /> : '—'}</p>
        </div>
      </div>
      <div className="card flat stack tight">
        <h3>Sedute per settimana</h3>
        <div className="bars">
          {r.weeks.map((w) => (
            <div key={w.weekStart} className="bar-col">
              <div className="bar-track"><div className="bar" style={{ height: `${(w.sessions / max) * 100}%` }} title={`${w.sessions} sedute`} /></div>
              <span>{shortDay(w.weekStart)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid2">
        <div className="card flat stack tight">
          <h3>Ultime sedute</h3>
          {r.sessions.length ? (
            <table>
              <tbody>
                {r.sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.title}<div className="muted">{shortDay(s.day)}</div></td>
                    <td>{s.sets} serie</td>
                    <td>{s.volumeKg ? `${s.volumeKg.toLocaleString('it-IT')} kg` : '—'}</td>
                    <td>{s.perceivedEffort ? `fatica ${s.perceivedEffort}/10` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty">Nessuna seduta completata nel periodo.</div>}
        </div>
        <div className="card flat stack tight">
          <h3>Forza</h3>
          {r.strength.length ? (
            <table>
              <tbody>
                {r.strength.map((s) => (
                  <tr key={s.exercise}>
                    <td>{s.exercise}</td>
                    <td>{kg(s.firstKg)} → {kg(s.lastKg)}</td>
                    <td style={{ color: s.lastKg > s.firstKg ? 'var(--energia)' : s.lastKg < s.firstKg ? 'var(--corallo)' : undefined }}>{s.lastKg - s.firstKg > 0 ? '+' : ''}{kg(s.lastKg - s.firstKg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty">Servono almeno due sedute con lo stesso esercizio.</div>}
        </div>
      </div>
    </div>
  );
}

/** Messaggi: elenco delle conversazioni e chat aperta. Si aggiorna da solo ogni pochi secondi. */
export function Messages({ openWith, emptyHint }: { openWith?: string | null; emptyHint: string }) {
  const [list, setList] = useState<ConversationSummary[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [thread, setThread] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<unknown>(null);
  const end = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    try {
      setList((await api<{ conversations: ConversationSummary[] }>('GET', '/conversations')).conversations);
    } catch (e) {
      setError(e);
    }
  }, []);
  const loadThread = useCallback(async (id: string) => {
    try {
      setThread((await api<{ messages: ChatMessage[] }>('GET', `/conversations/${id}/messages`)).messages);
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      if (openWith) {
        try {
          const c = await api<{ id: string }>('POST', '/conversations', { userId: openWith });
          setActive(c.id);
        } catch (e) {
          setError(e);
        }
      }
      await loadList();
    })();
  }, [openWith, loadList]);

  useEffect(() => {
    if (active) void loadThread(active);
    const t = setInterval(() => {
      void loadList();
      if (active) void loadThread(active);
    }, 8000);
    return () => clearInterval(t);
  }, [active, loadList, loadThread]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [thread.length]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!active || !text.trim()) return;
    setError(null);
    try {
      const m = await api<ChatMessage>('POST', `/conversations/${active}/messages`, { text });
      setThread((t) => [...t, m]);
      setText('');
      void loadList();
    } catch (err) {
      setError(err);
    }
  };

  const current = list?.find((c) => c.id === active);
  return (
    <div className="split">
      <div className="card flat stack tight" style={{ padding: 8 }}>
        {list?.length === 0 && <div className="empty">{emptyHint}</div>}
        {list?.map((c) => (
          <button key={c.id} className={`conv ${c.id === active ? 'on' : ''}`} onClick={() => setActive(c.id)}>
            <span className="row between">
              <b>{c.with.name}</b>
              {c.unread > 0 && <span className="badge approved">{c.unread}</span>}
            </span>
            <span className="muted">{c.lastMessage ? `${c.lastMessage.mine ? 'Tu: ' : ''}${c.lastMessage.text}` : 'Nessun messaggio'}</span>
          </button>
        ))}
      </div>
      <div className="card flat chat">
        <ErrorBox error={error} />
        {!active && <div className="empty">Scegli una conversazione.</div>}
        {active && (
          <>
            <h3>{current?.with.name ?? ''}</h3>
            <div className="thread" aria-live="polite">
              {thread.map((m) => (
                <div key={m.id} className={`bubble ${m.mine ? 'mine' : ''}`}>
                  {m.text}
                  <span>{new Date(m.at).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
              {thread.length === 0 && <div className="empty">Scrivi il primo messaggio.</div>}
              <div ref={end} />
            </div>
            <form className="row" onSubmit={send}>
              <input aria-label="Messaggio" value={text} onChange={(e) => setText(e.target.value)} placeholder="Scrivi un messaggio" maxLength={2000} style={{ flex: 1 }} />
              <button className="btn" disabled={!text.trim()}>Invia</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
