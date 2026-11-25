/**
 * Strumenti dei professionisti (gratuiti): template delle schede, check-in, carichi, app salute,
 * piano alimentare (solo nutrizionisti verificati), messaggi automatici e profilo pubblico.
 */
import { useMemo, useState } from 'react';
import {
  AUTOMATION_LABELS,
  CHECK_IN_SCALE_LABELS,
  FOOD_CATEGORIES,
  FOOD_CATEGORY_LABELS,
  HEALTH_SOURCE_LABELS,
  MEALS,
  MEAL_LABELS,
  PROFESSION_LABELS,
  type Automation,
  type CheckInScale,
  type CheckInsResponse,
  type ExerciseHistory,
  type ExerciseRecords,
  type Food,
  type FoodCategory,
  type FoodDiaryDay,
  type HealthDay,
  type Macros,
  type Meal,
  type MealPlanView,
  type PlanEditorResponse,
  type PlanTemplate,
  type Profession,
} from '@motix/shared';
import { ApiFailure, api } from '../../api';
import { ErrorBox, Field } from '../../ui';
import { date, kg, shortDay, useLoad } from './common';

const UNIT = { reps: 'Ripetizioni', seconds: 'Secondi', minutes: 'Minuti' } as const;
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const num = (v: string, min: number) => Math.max(min, Math.round(Number(v) || 0));

function useAction() {
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      const r = await fn();
      if (ok) setNotice(ok);
      return r;
    } catch (e) {
      setError(e);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { error, notice, busy, run, setNotice };
}

/* ================= Template delle schede ================= */

type TplSession = PlanTemplate['sessions'][number];
interface LibraryItem {
  id: string;
  name: string;
  loadable: boolean;
  unit: 'reps' | 'seconds' | 'minutes';
}

function TemplateEditor({ initial, onDone }: { initial: PlanTemplate | null; onDone: (list?: PlanTemplate[]) => void }) {
  const library = useLoad<{ exercises: LibraryItem[] }>('/exercises');
  const [name, setName] = useState(initial?.name ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [sessions, setSessions] = useState<TplSession[]>(initial?.sessions ?? [{ title: 'Seduta A', dayOffset: 0, exercises: [] }]);
  const { error, busy, run } = useAction();

  const patchSession = (i: number, patch: Partial<TplSession>) => setSessions(sessions.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const patchExercise = (i: number, k: number, patch: Partial<TplSession['exercises'][number]>) =>
    patchSession(i, { exercises: sessions[i]!.exercises.map((e, j) => (j === k ? { ...e, ...patch } : e)) });
  const addExercise = (i: number, id: string) => {
    const ex = library.data?.exercises.find((e) => e.id === id);
    if (!ex) return;
    patchSession(i, {
      exercises: [
        ...sessions[i]!.exercises,
        { exerciseId: ex.id, name: ex.name, unit: ex.unit, loadable: ex.loadable, sets: ex.unit === 'minutes' ? 1 : 3, reps: ex.unit === 'minutes' ? 10 : ex.unit === 'seconds' ? 30 : 10, loadKg: null, restSeconds: ex.unit === 'minutes' ? 0 : 60 },
      ],
    });
  };
  const save = async () => {
    const body = {
      name,
      note: note.trim() || undefined,
      sessions: sessions.map((s) => ({
        title: s.title,
        dayOffset: s.dayOffset,
        exercises: s.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets, reps: e.reps, loadKg: e.loadable ? e.loadKg : null, restSeconds: e.restSeconds })),
      })),
    };
    const r = await run(() => api<{ templates: PlanTemplate[] }>(initial ? 'PUT' : 'POST', initial ? `/trainer/templates/${initial.id}` : '/trainer/templates', body));
    if (r) onDone(r.templates);
  };

  return (
    <div className="stack">
      <div className="row between">
        <h3>{initial ? 'Modifica il template' : 'Nuovo template'}</h3>
        <button className="btn ghost small" onClick={() => onDone()}>Annulla</button>
      </div>
      <ErrorBox error={error ?? library.error} />
      <div className="card stack">
        <Field label="Nome del template" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Es. Tonificazione 3 giorni · principianti" />
        <label className="field">
          Nota per il cliente (compare in «Perché questo piano»)
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={600} aria-label="Nota per il cliente" />
        </label>
      </div>
      {sessions.map((s, i) => (
        <div key={i} className="card stack">
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: 2, minWidth: 200 }}><Field label="Nome della seduta" value={s.title} onChange={(e) => patchSession(i, { title: e.target.value })} maxLength={60} /></div>
            <div style={{ width: 160 }}>
              <Field label="Giorno del ciclo" type="number" min={1} max={28} value={s.dayOffset + 1} onChange={(e) => patchSession(i, { dayOffset: Math.min(27, num(e.target.value, 1) - 1) })} hint="1 = giorno di partenza" />
            </div>
            <button className="btn danger small" onClick={() => setSessions(sessions.filter((_, j) => j !== i))}>Elimina la seduta</button>
          </div>
          {s.exercises.map((ex, k) => (
            <div key={k} className="ex-row">
              <b style={{ fontSize: 14, alignSelf: 'center' }}>{k + 1}. {ex.name}</b>
              <label>Serie<input className="in-sm" type="number" min={1} max={10} value={ex.sets} onChange={(e) => patchExercise(i, k, { sets: num(e.target.value, 1) })} aria-label={`${ex.name}: serie`} /></label>
              <label>{UNIT[ex.unit]}<input className="in-sm" type="number" min={1} max={200} value={ex.reps} onChange={(e) => patchExercise(i, k, { reps: num(e.target.value, 1) })} aria-label={`${ex.name}: ${UNIT[ex.unit].toLowerCase()}`} /></label>
              <label>
                Kg
                <input className="in-sm" type="number" min={0} step={0.5} disabled={!ex.loadable} value={ex.loadKg ?? ''} placeholder={ex.loadable ? 'libero' : '—'} onChange={(e) => patchExercise(i, k, { loadKg: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} aria-label={`${ex.name}: chili`} />
              </label>
              <label>Recupero (s)<input className="in-sm" type="number" min={0} max={600} step={15} value={ex.restSeconds} onChange={(e) => patchExercise(i, k, { restSeconds: num(e.target.value, 0) })} aria-label={`${ex.name}: recupero`} /></label>
              <button className="btn ghost small" onClick={() => patchSession(i, { exercises: s.exercises.filter((_, j) => j !== k) })}>Rimuovi</button>
            </div>
          ))}
          <label className="field" style={{ maxWidth: 360 }}>
            Aggiungi un esercizio
            <select value="" onChange={(e) => addExercise(i, e.target.value)} aria-label={`Aggiungi un esercizio a ${s.title}`}>
              <option value="">Scegli dalla libreria…</option>
              {library.data?.exercises.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
        </div>
      ))}
      <div className="row">
        {sessions.length < 7 && (
          <button className="btn ghost" onClick={() => setSessions([...sessions, { title: `Seduta ${String.fromCharCode(65 + sessions.length)}`, dayOffset: Math.min(27, (sessions.at(-1)?.dayOffset ?? -2) + 2), exercises: [] }])}>
            Aggiungi una seduta
          </button>
        )}
        <button className="btn" onClick={save} disabled={busy || name.trim().length < 2 || !sessions.length || sessions.some((s) => !s.exercises.length)}>Salva il template</button>
      </div>
    </div>
  );
}

export function TemplateLibrary() {
  const list = useLoad<{ templates: PlanTemplate[] }>('/trainer/templates');
  const [editing, setEditing] = useState<PlanTemplate | 'new' | null>(null);
  const { error, run } = useAction();
  if (editing)
    return (
      <TemplateEditor
        initial={editing === 'new' ? null : editing}
        onDone={(templates) => {
          if (templates) list.setData({ templates });
          setEditing(null);
        }}
      />
    );
  return (
    <div className="stack">
      <div className="row between">
        <p>Schede preimpostate da assegnare ai clienti in un clic, dalla scheda del cliente.</p>
        <button className="btn small" onClick={() => setEditing('new')}>Nuovo template</button>
      </div>
      <ErrorBox error={error ?? list.error} />
      <div className="card">
        {list.data?.templates.length ? (
          <table>
            <thead><tr><th>Template</th><th>Sedute</th><th>Aggiornato</th><th /></tr></thead>
            <tbody>
              {list.data.templates.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}{t.note && <div className="muted">{t.note}</div>}</td>
                  <td>{t.sessions.map((s) => `${s.title} (g. ${s.dayOffset + 1})`).join(' · ')}</td>
                  <td className="muted">{date(t.updatedAt)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn ghost small" onClick={() => setEditing(t)}>Modifica</button>
                      <button
                        className="btn danger small"
                        onClick={() => window.confirm(`Eliminare il template «${t.name}»? I piani già assegnati restano.`) && void run(() => api<{ templates: PlanTemplate[] }>('DELETE', `/trainer/templates/${t.id}`)).then((r) => r && list.setData(r))}
                      >
                        Elimina
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">Nessun template. Creane uno da zero, oppure salva come template il piano di un cliente.</div>
        )}
      </div>
    </div>
  );
}

/** Sopra l'editor del piano: assegna un template o salva il piano attuale come template. */
export function TemplateTools({ linkId, onApplied }: { linkId: string; onApplied: () => void }) {
  const list = useLoad<{ templates: PlanTemplate[] }>('/trainer/templates');
  const [templateId, setTemplateId] = useState('');
  const [startDay, setStartDay] = useState(todayIso());
  const { error, notice, busy, run } = useAction();

  const apply = async () => {
    if (!window.confirm('Il template sostituisce il piano attivo del cliente. Le sedute già fatte restano nel suo diario. Continuare?')) return;
    const ok = await run(() => api('POST', `/trainer/clients/${linkId}/plan/template`, { templateId, startDay }), 'Template assegnato: il cliente lo trova subito nell’app.');
    if (ok) onApplied();
  };
  const saveCurrent = async () => {
    const name = window.prompt('Nome del nuovo template:');
    if (!name) return;
    await run(async () => {
      const plan = await api<PlanEditorResponse>('GET', `/trainer/clients/${linkId}/plan`);
      if (!plan.sessions.length) throw new ApiFailure(409, 'no_plan', 'Il cliente non ha ancora un piano da salvare');
      const first = plan.sessions.map((s) => s.day).sort()[0]!;
      const offset = (day: string) => Math.round((new Date(`${day}T12:00:00`).getTime() - new Date(`${first}T12:00:00`).getTime()) / 86_400_000);
      const r = await api<{ templates: PlanTemplate[] }>('POST', '/trainer/templates', {
        name,
        note: plan.note || undefined,
        sessions: plan.sessions.map((s) => ({
          title: s.title,
          dayOffset: Math.min(27, offset(s.day)),
          exercises: s.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets, reps: e.reps, loadKg: e.loadable ? e.loadKg : null, restSeconds: e.restSeconds })),
        })),
      });
      list.setData(r);
    }, `Template «${name}» salvato`);
  };

  return (
    <div className="card stack tight">
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: 2, minWidth: 220 }}>
          Assegna un template
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} aria-label="Template">
            <option value="">{list.data?.templates.length ? 'Scegli un template…' : 'Nessun template salvato'}</option>
            {list.data?.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <div style={{ width: 170 }}><Field label="Dal giorno" type="date" value={startDay} onChange={(e) => setStartDay(e.target.value)} /></div>
        <button className="btn small" onClick={apply} disabled={busy || !templateId}>Assegna</button>
        <button className="btn ghost small" onClick={saveCurrent} disabled={busy}>Salva il piano attuale come template</button>
      </div>
      <ErrorBox error={error} />
      {notice && <div className="alert ok">{notice}</div>}
    </div>
  );
}

/* ================= Check-in ================= */

const SCALES = Object.keys(CHECK_IN_SCALE_LABELS) as CheckInScale[];

export function CheckInsPanel({ linkId }: { linkId: string }) {
  const state = useLoad<CheckInsResponse & { myEveryDays: number | null }>(`/trainer/clients/${linkId}/check-ins`);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const { error, notice, run } = useAction();
  const s = state.data;
  return (
    <div className="stack">
      <ErrorBox error={error ?? state.error} />
      {notice && <div className="alert ok">{notice}</div>}
      <div className="card row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ width: 260 }}>
          Chiedi un check-in
          <select
            value={s?.myEveryDays ?? 0}
            onChange={(e) =>
              void run(() => api('PUT', `/trainer/clients/${linkId}/check-in-frequency`, { everyDays: Number(e.target.value) }), 'Frequenza aggiornata').then(() => state.reload())
            }
            aria-label="Frequenza del check-in"
          >
            <option value={0}>Mai</option>
            <option value={7}>Ogni settimana</option>
            <option value={14}>Ogni due settimane</option>
            <option value={30}>Ogni mese</option>
          </select>
        </label>
        {s?.nextDue && <p>Prossimo check-in atteso: <b>{shortDay(s.nextDue)}</b></p>}
      </div>
      {s && !s.checkIns.length && <div className="card empty">Ancora nessun check-in.</div>}
      {s?.checkIns.map((c) => (
        <div key={c.id} className="card stack tight">
          <div className="row between">
            <h3>{shortDay(c.day)}</h3>
            <span className="muted">{[c.weightKg !== null && kg(c.weightKg), c.waistCm !== null && `vita ${c.waistCm} cm`].filter(Boolean).join(' · ')}</span>
          </div>
          <div className="row">
            {SCALES.filter((k) => c[k] !== null).map((k) => (
              <span key={k} className="badge neutral">{CHECK_IN_SCALE_LABELS[k]}: {c[k]}/5</span>
            ))}
          </div>
          {c.notes && <p>«{c.notes}»</p>}
          {c.photos.length > 0 && (
            <div className="row">
              {c.photos.map((p) => <a key={p} href={p} target="_blank" rel="noreferrer"><img src={p} alt="Foto di progresso" style={{ width: 110, height: 140, objectFit: 'cover', borderRadius: 12 }} /></a>)}
            </div>
          )}
          {c.comment ? (
            <div className="alert info">Il tuo commento: {c.comment}</div>
          ) : (
            <form
              className="row"
              style={{ alignItems: 'flex-end' }}
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => api<CheckInsResponse>('POST', `/trainer/clients/${linkId}/check-ins/${c.id}/comment`, { comment: drafts[c.id] ?? '' }), 'Commento inviato').then((r) => r && state.reload());
              }}
            >
              <div style={{ flex: 1, minWidth: 220 }}><Field label="Rispondi al check-in" value={drafts[c.id] ?? ''} onChange={(e) => setDrafts({ ...drafts, [c.id]: e.target.value })} maxLength={1000} /></div>
              <button className="btn small" disabled={!(drafts[c.id] ?? '').trim()}>Invia</button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}

/* ================= Carichi e app salute ================= */

export function LoadsPanel({ linkId }: { linkId: string }) {
  const records = useLoad<ExerciseRecords>(`/trainer/clients/${linkId}/exercises`);
  const [open, setOpen] = useState<string | null>(null);
  const history = useLoad<ExerciseHistory>(open ? `/trainer/clients/${linkId}/exercises/${open}` : null);
  const max = Math.max(1, ...(history.data?.points.map((p) => p.bestKg ?? 0) ?? [1]));
  return (
    <div className="stack">
      <ErrorBox error={records.error ?? history.error} />
      <div className="card">
        {records.data?.records.length ? (
          <table>
            <thead><tr><th>Esercizio</th><th>Carico migliore</th><th>Sedute</th><th /></tr></thead>
            <tbody>
              {records.data.records.map((r) => (
                <tr key={r.exerciseId} className="clickable" onClick={() => setOpen(r.exerciseId)}>
                  <td>{r.name}</td>
                  <td>{kg(r.bestKg)} <span className="muted">il {shortDay(r.day)}</span></td>
                  <td>{r.sessions}</td>
                  <td style={{ textAlign: 'right' }}><button className="btn ghost small">Storico</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="empty">Nessun carico registrato finora.</div>}
      </div>
      {history.data && open && (
        <div className="card stack">
          <div className="row between"><h3>{history.data.exercise.name}</h3><button className="btn ghost small" onClick={() => setOpen(null)}>Chiudi</button></div>
          {history.data.points.map((p) => (
            <div key={p.day} className="row" style={{ alignItems: 'center' }}>
              <span style={{ width: 70 }} className="muted">{shortDay(p.day)}</span>
              <div style={{ flex: 1, background: 'var(--ardesia, #13203A)', borderRadius: 8, height: 14 }}>
                <div style={{ width: `${((p.bestKg ?? 0) / max) * 100}%`, background: 'var(--acqua, #38D3EE)', height: 14, borderRadius: 8 }} />
              </div>
              <span style={{ width: 210, fontSize: 14 }}>{p.bestKg !== null ? kg(p.bestKg) : `${p.bestReps} rip.`} · {p.sets} serie · vol. {kg(p.volumeKg)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function HealthPanel({ linkId }: { linkId: string }) {
  const state = useLoad<{ days: HealthDay[] }>(`/trainer/clients/${linkId}/health`);
  const days = state.data?.days ?? [];
  return (
    <div className="stack">
      <ErrorBox error={state.error} />
      <div className="card">
        {days.length ? (
          <table>
            <thead><tr><th>Giorno</th><th>Passi</th><th>Sonno</th><th>Battito a riposo</th><th>Calorie attive</th><th>Fonte</th></tr></thead>
            <tbody>
              {[...days].reverse().map((d) => (
                <tr key={d.day}>
                  <td>{shortDay(d.day)}</td>
                  <td>{d.steps?.toLocaleString('it-IT') ?? '—'}</td>
                  <td>{d.sleepMinutes !== null ? `${Math.floor(d.sleepMinutes / 60)} h ${d.sleepMinutes % 60} min` : '—'}</td>
                  <td>{d.restingHr !== null ? `${d.restingHr} bpm` : '—'}</td>
                  <td>{d.activeKcal ?? '—'}</td>
                  <td className="muted">{HEALTH_SOURCE_LABELS[d.source]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <div className="empty">Il cliente non ha ancora collegato Apple Salute o Health Connect.</div>}
      </div>
    </div>
  );
}

/* ================= Alimentazione (solo nutrizionisti verificati) ================= */

type Item = { foodId: string; grams: number };
type DayDraft = { name: string; meals: Array<{ meal: Meal; time: string; items: Item[]; alternatives: Item[][] }> };

const macrosOf = (f: Food | undefined, grams: number): Macros =>
  f ? { kcal: (f.kcal * grams) / 100, protein: (f.protein * grams) / 100, carbs: (f.carbs * grams) / 100, fat: (f.fat * grams) / 100 } : { kcal: 0, protein: 0, carbs: 0, fat: 0 };
const add = (list: Macros[]) => list.reduce((a, m) => ({ kcal: a.kcal + m.kcal, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
const macroText = (m: Macros) => `${Math.round(m.kcal)} kcal · P ${Math.round(m.protein)} g · C ${Math.round(m.carbs)} g · G ${Math.round(m.fat)} g`;

function ItemsEditor({ items, foods, onChange, label }: { items: Item[]; foods: Food[]; onChange: (v: Item[]) => void; label: string }) {
  const byId = new Map(foods.map((f) => [f.id, f]));
  return (
    <div className="stack tight">
      {items.map((it, k) => (
        <div key={k} className="row" style={{ alignItems: 'center' }}>
          <span style={{ flex: 1, minWidth: 180 }}>{byId.get(it.foodId)?.name ?? 'Alimento'}</span>
          <input className="in-sm" type="number" min={1} max={2000} value={it.grams} onChange={(e) => onChange(items.map((x, j) => (j === k ? { ...x, grams: num(e.target.value, 1) } : x)))} aria-label={`${byId.get(it.foodId)?.name}: grammi`} />
          <span className="muted">g · {Math.round(macrosOf(byId.get(it.foodId), it.grams).kcal)} kcal</span>
          <button className="btn ghost small" onClick={() => onChange(items.filter((_, j) => j !== k))}>Rimuovi</button>
        </div>
      ))}
      <select value="" onChange={(e) => e.target.value && onChange([...items, { foodId: e.target.value, grams: 100 }])} aria-label={label} style={{ maxWidth: 360 }}>
        <option value="">{label}…</option>
        {FOOD_CATEGORIES.map((c) => (
          <optgroup key={c} label={FOOD_CATEGORY_LABELS[c]}>
            {foods.filter((f) => f.category === c).map((f) => <option key={f.id} value={f.id}>{f.name}{f.custom ? ' (tuo)' : ''}</option>)}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

function NewFood({ onAdded }: { onAdded: (f: Food) => void }) {
  const [f, setF] = useState({ name: '', category: 'other' as FoodCategory, kcal: '', protein: '', carbs: '', fat: '' });
  const { error, run } = useAction();
  return (
    <form
      className="card stack tight"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => api<Food>('POST', '/trainer/foods', { name: f.name, category: f.category, kcal: Number(f.kcal), protein: Number(f.protein), carbs: Number(f.carbs), fat: Number(f.fat) })).then((food) => {
          if (food) {
            onAdded(food);
            setF({ name: '', category: 'other', kcal: '', protein: '', carbs: '', fat: '' });
          }
        });
      }}
    >
      <h3>Aggiungi un alimento alla tua libreria</h3>
      <ErrorBox error={error} />
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: 2, minWidth: 180 }}><Field label="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
        <label className="field" style={{ width: 190 }}>
          Categoria
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as FoodCategory })}>
            {FOOD_CATEGORIES.map((c) => <option key={c} value={c}>{FOOD_CATEGORY_LABELS[c]}</option>)}
          </select>
        </label>
        {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => (
          <div key={k} style={{ width: 110 }}>
            <Field label={{ kcal: 'Kcal', protein: 'Proteine', carbs: 'Carboidrati', fat: 'Grassi' }[k]} type="number" min={0} step={0.1} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} required />
          </div>
        ))}
        <button className="btn small">Aggiungi</button>
      </div>
      <span className="muted">Valori per 100 g.</span>
    </form>
  );
}

export function MealPlanPanel({ linkId, canSeeDiary }: { linkId: string; canSeeDiary: boolean }) {
  const foods = useLoad<{ foods: Food[] }>('/foods');
  const current = useLoad<{ plan: MealPlanView | null; days: DayDraft[] | null }>(`/trainer/clients/${linkId}/meal-plan`);
  const diary = useLoad<FoodDiaryDay>(canSeeDiary ? `/trainer/clients/${linkId}/food-diary` : null);
  const [draft, setDraft] = useState<{ title: string; notes: string; days: DayDraft[] } | null>(null);
  const { error, notice, busy, run } = useAction();
  const list = foods.data?.foods ?? [];
  const byId = useMemo(() => new Map(list.map((f) => [f.id, f])), [list]);
  const totals = (items: Item[]) => add(items.map((i) => macrosOf(byId.get(i.foodId), i.grams)));

  const start = () => {
    const p = current.data;
    setDraft({
      title: p?.plan?.title ?? 'Piano alimentare',
      notes: p?.plan?.notes ?? '',
      days: p?.days?.map((d) => ({ name: d.name, meals: d.meals.map((m) => ({ meal: m.meal, time: m.time ?? '', items: m.items, alternatives: m.alternatives ?? [] })) })) ?? [
        { name: 'Giorno tipo', meals: [{ meal: 'breakfast', time: '07:30', items: [], alternatives: [] }, { meal: 'lunch', time: '13:00', items: [], alternatives: [] }, { meal: 'dinner', time: '20:00', items: [], alternatives: [] }] },
      ],
    });
  };
  const patchDay = (i: number, d: DayDraft) => draft && setDraft({ ...draft, days: draft.days.map((x, j) => (j === i ? d : x)) });
  const save = async () => {
    if (!draft) return;
    const body = {
      title: draft.title,
      notes: draft.notes.trim() || undefined,
      days: draft.days.map((d) => ({
        name: d.name,
        meals: d.meals.filter((m) => m.items.length).map((m) => ({ meal: m.meal, ...(m.time ? { time: m.time } : {}), items: m.items, alternatives: m.alternatives.filter((a) => a.length) })),
      })),
    };
    const r = await run(() => api<{ plan: MealPlanView }>('PUT', `/trainer/clients/${linkId}/meal-plan`, body), 'Piano alimentare assegnato: il cliente lo trova nell’app.');
    if (r) {
      setDraft(null);
      void current.reload();
    }
  };

  if (draft)
    return (
      <div className="stack">
        <ErrorBox error={error ?? foods.error} />
        <div className="card stack">
          <Field label="Titolo del piano" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={80} />
          <label className="field">
            Indicazioni per il cliente
            <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} maxLength={1500} aria-label="Indicazioni per il cliente" />
          </label>
        </div>
        {draft.days.map((d, i) => (
          <div key={i} className="card stack">
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: 200 }}><Field label="Nome del giorno" value={d.name} onChange={(e) => patchDay(i, { ...d, name: e.target.value })} maxLength={40} /></div>
              <b>{macroText(add(d.meals.map((m) => totals(m.items))))}</b>
              {draft.days.length > 1 && <button className="btn danger small" onClick={() => setDraft({ ...draft, days: draft.days.filter((_, j) => j !== i) })}>Elimina il giorno</button>}
            </div>
            {d.meals.map((m, k) => (
              <div key={k} className="card flat stack tight">
                <div className="row" style={{ alignItems: 'flex-end' }}>
                  <label className="field" style={{ width: 200 }}>
                    Pasto
                    <select value={m.meal} onChange={(e) => patchDay(i, { ...d, meals: d.meals.map((x, j) => (j === k ? { ...x, meal: e.target.value as Meal } : x)) })}>
                      {MEALS.map((ml) => <option key={ml} value={ml}>{MEAL_LABELS[ml]}</option>)}
                    </select>
                  </label>
                  <div style={{ width: 120 }}><Field label="Orario" type="time" value={m.time} onChange={(e) => patchDay(i, { ...d, meals: d.meals.map((x, j) => (j === k ? { ...x, time: e.target.value } : x)) })} /></div>
                  <span className="muted">{macroText(totals(m.items))}</span>
                  <button className="btn ghost small" onClick={() => patchDay(i, { ...d, meals: d.meals.filter((_, j) => j !== k) })}>Togli il pasto</button>
                </div>
                <ItemsEditor items={m.items} foods={list} label="Aggiungi un alimento" onChange={(items) => patchDay(i, { ...d, meals: d.meals.map((x, j) => (j === k ? { ...x, items } : x)) })} />
                {m.alternatives.map((alt, a) => (
                  <div key={a} className="stack tight" style={{ borderLeft: '3px solid var(--acqua, #38D3EE)', paddingLeft: 12 }}>
                    <div className="row between"><b>Alternativa {a + 1}</b><span className="muted">{macroText(totals(alt))}</span></div>
                    <ItemsEditor
                      items={alt}
                      foods={list}
                      label="Aggiungi all’alternativa"
                      onChange={(items) => patchDay(i, { ...d, meals: d.meals.map((x, j) => (j === k ? { ...x, alternatives: items.length ? x.alternatives.map((y, b) => (b === a ? items : y)) : x.alternatives.filter((_, b) => b !== a) } : x)) })}
                    />
                  </div>
                ))}
                {m.alternatives.length < 3 && m.items.length > 0 && (
                  <div><button className="btn ghost small" onClick={() => patchDay(i, { ...d, meals: d.meals.map((x, j) => (j === k ? { ...x, alternatives: [...x.alternatives, []] } : x)) })}>Aggiungi un’alternativa</button></div>
                )}
              </div>
            ))}
            {d.meals.length < MEALS.length && (
              <div>
                <button className="btn ghost small" onClick={() => patchDay(i, { ...d, meals: [...d.meals, { meal: MEALS.find((ml) => !d.meals.some((x) => x.meal === ml)) ?? 'snack_pm', time: '', items: [], alternatives: [] }] })}>
                  Aggiungi un pasto
                </button>
              </div>
            )}
          </div>
        ))}
        <NewFood onAdded={(f) => foods.setData({ foods: [...list, f] })} />
        <div className="row">
          {draft.days.length < 7 && <button className="btn ghost" onClick={() => setDraft({ ...draft, days: [...draft.days, { name: `Giorno ${draft.days.length + 1}`, meals: [] }] })}>Aggiungi un giorno</button>}
          <button className="btn" onClick={save} disabled={busy || draft.days.every((d) => d.meals.every((m) => !m.items.length))}>Assegna il piano al cliente</button>
          <button className="btn ghost" onClick={() => setDraft(null)}>Annulla</button>
        </div>
      </div>
    );

  const p = current.data?.plan;
  return (
    <div className="stack">
      <ErrorBox error={error ?? current.error ?? diary.error} />
      {notice && <div className="alert ok">{notice}</div>}
      <div className="row between">
        <p>{p ? `Piano attivo: «${p.title}», assegnato il ${date(p.createdAt)}.` : 'Il cliente non ha ancora un piano alimentare.'}</p>
        <button className="btn small" onClick={start} disabled={!foods.data}>{p ? 'Modifica il piano' : 'Crea il piano alimentare'}</button>
      </div>
      {p?.days.map((d) => (
        <div key={d.name} className="card stack tight">
          <div className="row between"><h3>{d.name}</h3><b>{macroText(d.totals)}</b></div>
          {d.meals.map((m) => (
            <div key={m.meal}>
              <b>{MEAL_LABELS[m.meal]}{m.time ? ` · ${m.time}` : ''}</b> <span className="muted">{macroText(m.totals)}</span>
              <div style={{ fontSize: 14 }}>{m.items.map((i) => `${i.name} ${i.grams} g`).join(', ')}</div>
              {m.alternatives.map((a, k) => <div key={k} className="muted">Oppure: {a.items.map((i) => `${i.name} ${i.grams} g`).join(', ')}</div>)}
            </div>
          ))}
        </div>
      ))}
      {canSeeDiary && diary.data && (
        <div className="card stack tight">
          <div className="row between"><h3>Diario di oggi</h3><span>{macroText(diary.data.totals)}{diary.data.target ? ` su ${Math.round(diary.data.target.kcal)} kcal` : ''}</span></div>
          {diary.data.entries.length ? diary.data.entries.map((e) => <div key={e.id} style={{ fontSize: 14 }}>{MEAL_LABELS[e.meal]}: {e.name} {e.grams} g</div>) : <div className="muted">Nessun alimento registrato oggi.</div>}
        </div>
      )}
      <p className="muted">Il piano alimentare è riservato ai nutrizionisti con l’iscrizione all’albo verificata da BTECH.</p>
    </div>
  );
}

/* ================= Messaggi automatici ================= */

export function AutomationsPanel() {
  const state = useLoad<{ automations: Automation[] }>('/trainer/automations');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const { error, notice, run } = useAction();
  const save = (a: Automation) => run(() => api<{ automations: Automation[] }>('PUT', '/trainer/automations', a), 'Salvato').then((r) => r && state.setData(r));
  return (
    <div className="stack">
      <p>Messaggi che partono da soli dalla tua chat. Scrivi <code>{'{nome}'}</code> per il nome del cliente. Ogni messaggio arriva una volta sola.</p>
      <ErrorBox error={error ?? state.error} />
      {notice && <div className="alert ok">{notice}</div>}
      {state.data?.automations.map((a) => (
        <div key={a.kind} className="card stack tight">
          <div className="row between">
            <h3>{AUTOMATION_LABELS[a.kind]}</h3>
            <label className="row" style={{ gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={a.enabled} onChange={(e) => void save({ ...a, text: drafts[a.kind] ?? a.text, enabled: e.target.checked })} />
              {a.enabled ? 'Attivo' : 'Spento'}
            </label>
          </div>
          <textarea value={drafts[a.kind] ?? a.text} onChange={(e) => setDrafts({ ...drafts, [a.kind]: e.target.value })} maxLength={600} aria-label={AUTOMATION_LABELS[a.kind]} />
          {drafts[a.kind] !== undefined && drafts[a.kind] !== a.text && <div><button className="btn small" onClick={() => void save({ ...a, text: drafts[a.kind]! })}>Salva il testo</button></div>}
          {(a.kind === 'inactive' || a.kind === 'at_risk') && <span className="muted">Solo per i clienti che condividono i loro dati con te.</span>}
        </div>
      ))}
    </div>
  );
}

/* ================= Profilo professionale ================= */

interface TrainerProfile {
  profession: Profession;
  city: string | null;
  bio: string | null;
  specializations: string[];
  publicProfile: boolean;
  registerName: string | null;
  registerNumber: string | null;
  registerVerified: boolean;
  registerRequired: boolean;
  canPrescribeNutrition: boolean;
}

export function ProfilePanel() {
  const state = useLoad<TrainerProfile>('/trainer');
  const [f, setF] = useState<Record<string, string | boolean> | null>(null);
  const { error, notice, busy, run } = useAction();
  const p = state.data;
  if (!p) return <ErrorBox error={state.error} />;
  const v = f ?? { city: p.city ?? '', bio: p.bio ?? '', specializations: p.specializations.join(', '), publicProfile: p.publicProfile, registerName: p.registerName ?? '', registerNumber: p.registerNumber ?? '' };
  const set = (k: string, val: string | boolean) => setF({ ...v, [k]: val });
  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          () =>
            api('PATCH', '/trainer', {
              city: String(v.city),
              bio: String(v.bio),
              specializations: String(v.specializations).split(',').map((s) => s.trim()).filter(Boolean),
              publicProfile: Boolean(v.publicProfile),
              ...(p.registerRequired ? { registerName: String(v.registerName), registerNumber: String(v.registerNumber) } : {}),
            }),
          'Profilo aggiornato',
        ).then(() => state.reload().then(() => setF(null)));
      }}
    >
      <ErrorBox error={error} />
      {notice && <div className="alert ok">{notice}</div>}
      <p>Professione: <b>{PROFESSION_LABELS[p.profession]}</b></p>
      {p.registerRequired && (
        <div className={`alert ${p.registerVerified ? 'ok' : 'info'}`}>
          {p.registerVerified ? 'Iscrizione all’albo verificata da BTECH.' : 'Iscrizione all’albo in verifica da parte di BTECH.'}
          {p.profession === 'nutritionist' && !p.canPrescribeNutrition && ' Potrai creare piani alimentari dopo la verifica.'}
        </div>
      )}
      <div className="grid2">
        <Field label="Città" value={String(v.city)} onChange={(e) => set('city', e.target.value)} />
        <Field label="Specializzazioni" value={String(v.specializations)} onChange={(e) => set('specializations', e.target.value)} hint="Separate da virgola" />
      </div>
      {p.registerRequired && (
        <div className="grid2">
          <Field label="Albo o ordine" value={String(v.registerName)} onChange={(e) => set('registerName', e.target.value)} />
          <Field label="Numero di iscrizione" value={String(v.registerNumber)} onChange={(e) => set('registerNumber', e.target.value)} hint="Se lo cambi, BTECH lo verifica di nuovo" />
        </div>
      )}
      <label className="field">
        Presentazione
        <textarea value={String(v.bio)} onChange={(e) => set('bio', e.target.value)} maxLength={600} aria-label="Presentazione" />
      </label>
      <label className="row" style={{ gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={Boolean(v.publicProfile)} onChange={(e) => set('publicProfile', e.target.checked)} />
        Mostra il mio profilo nella vetrina dei professionisti dell’app, con i video pubblici
      </label>
      <div><button className="btn" disabled={busy}>Salva</button></div>
    </form>
  );
}
