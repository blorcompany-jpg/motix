import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, Vibration, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MUSCLE_LABELS, type SessionDetail, type SessionExerciseDetail, type SessionSummary } from '@motix/shared';
import { Body, Button, Card, Chip, ChipRow, ErrorBox, Eyebrow, H2, H3, Loading, Pill, Row, Screen, Small, TopBar } from '@/components/ui';
import { api } from '@/lib/api';
import { shortDate } from '@/lib/dates';
import { colors, font, radii } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

const UNIT = { reps: 'rip.', seconds: 'sec', minutes: 'min' } as const;
const fmt = (n: number | null) => (n === null ? '' : String(n).replace('.', ','));
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
const EFFORT = ['', 'Molto facile', 'Facile', 'Facile', 'Moderata', 'Moderata', 'Impegnativa', 'Impegnativa', 'Dura', 'Molto dura', 'Massima'];

/** Una riga per serie: ripetizioni e carico già compilati con l'obiettivo, da confermare con «Fatto». */
function SetRow({
  ex,
  n,
  disabled,
  onSave,
}: {
  ex: SessionExerciseDetail;
  n: number;
  disabled: boolean;
  onSave: (reps: number, loadKg: number | null) => Promise<void>;
}) {
  const log = ex.logs.find((l) => l.setNumber === n);
  // Carico proposto: quello dell'ultima serie fatta oggi, poi l'obiettivo del piano, poi la volta precedente.
  const suggested = ex.logs.at(-1)?.loadKg ?? ex.targetLoadKg ?? ex.previous?.sets[0]?.loadKg ?? null;
  const [reps, setReps] = useState(String(log?.reps ?? ex.targetReps));
  const [load, setLoad] = useState(fmt(log ? log.loadKg : suggested));
  useEffect(() => {
    // Una serie non ancora fatta e senza carico scritto eredita quello appena usato.
    if (!log && suggested !== null) setLoad((current) => (current.trim() === '' ? fmt(suggested) : current));
  }, [log, suggested]);
  const [busy, setBusy] = useState(false);
  const dirty = log ? String(log.reps) !== reps || fmt(log.loadKg) !== load : false;
  const done = Boolean(log) && !dirty;

  const save = async () => {
    const r = Number(reps);
    const l = load.trim() === '' ? null : Number(load.replace(',', '.'));
    if (!Number.isInteger(r) || r < 0 || (l !== null && !(l >= 0))) return;
    setBusy(true);
    await onSave(r, ex.exercise.loadable ? l : null).finally(() => setBusy(false));
  };

  const input = { fontFamily: font.textSemi, fontSize: 16, color: colors.ghiaccio, backgroundColor: colors.notte, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.blu, minHeight: 44, textAlign: 'center' as const, width: 64, minWidth: 0, paddingHorizontal: 4 };
  return (
    <Row style={{ gap: 6 }}>
      <Text style={{ width: 16, fontFamily: font.displaySemi, fontSize: 15, color: done ? colors.energia : colors.nebbia }}>{n}</Text>
      <TextInput value={reps} onChangeText={setReps} keyboardType="number-pad" maxLength={3} editable={!disabled} style={input} accessibilityLabel={`Serie ${n}: ${UNIT[ex.exercise.unit]}`} />
      <Text style={{ fontFamily: font.text, fontSize: 12, color: colors.pietra, width: 24 }}>{UNIT[ex.exercise.unit]}</Text>
      {ex.exercise.loadable && (
        <>
          <TextInput value={load} onChangeText={setLoad} keyboardType="decimal-pad" maxLength={6} editable={!disabled} placeholder="—" placeholderTextColor={colors.pietra} style={input} accessibilityLabel={`Serie ${n}: carico in chili`} />
          <Text style={{ fontFamily: font.text, fontSize: 12, color: colors.pietra, width: 18 }}>kg</Text>
        </>
      )}
      <Pressable
        onPress={save}
        disabled={disabled || busy || done}
        accessibilityRole="button"
        accessibilityLabel={done ? `Serie ${n} registrata` : `Registra la serie ${n}`}
        style={{ flex: 1, minWidth: 76, minHeight: 44, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? 'transparent' : colors.acqua, borderWidth: 1, borderColor: done ? colors.energia : colors.acqua, opacity: busy ? 0.6 : 1 }}
      >
        <Text style={{ fontFamily: font.textSemi, fontSize: 14, color: done ? colors.energia : colors.notte }}>{done ? '✓ Fatta' : dirty ? 'Salva' : 'Fatto'}</Text>
      </Pressable>
    </Row>
  );
}

export default function Seduta() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error: loadError, setData } = useApi<SessionDetail>(`/me/sessions/${id}`);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [rest, setRest] = useState<{ endsAt: number; total: number } | null>(null);
  const [left, setLeft] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [effort, setEffort] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const opened = useRef(false);

  // All'apertura si espande il primo esercizio non ancora completato.
  useEffect(() => {
    if (!data || opened.current) return;
    opened.current = true;
    setOpen((data.exercises.find((e) => e.logs.length < e.targetSets) ?? data.exercises[0])?.id ?? null);
  }, [data]);

  // Timer di recupero.
  useEffect(() => {
    if (!rest) return;
    const tick = () => {
      const s = Math.max(0, Math.ceil((rest.endsAt - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) {
        Vibration.vibrate(400);
        setRest(null);
      }
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [rest]);

  const saveSet = useCallback(
    async (ex: SessionExerciseDetail, setNumber: number, reps: number, loadKg: number | null) => {
      setError(null);
      try {
        const next = await api<SessionDetail>('PUT', `/me/sessions/${id}/sets`, { sessionExerciseId: ex.id, setNumber, reps, loadKg });
        setData(next);
        const updated = next.exercises.find((e) => e.id === ex.id)!;
        const wasNew = !ex.logs.some((l) => l.setNumber === setNumber);
        if (wasNew && ex.restSeconds > 0) setRest({ endsAt: Date.now() + ex.restSeconds * 1000, total: ex.restSeconds });
        // Finito l'esercizio si passa al successivo.
        if (updated.logs.length >= updated.targetSets) {
          const following = next.exercises.find((e) => e.position > updated.position && e.logs.length < e.targetSets);
          if (following) setOpen(following.id);
        }
      } catch (e) {
        setError(e);
      }
    },
    [id, setData],
  );

  const complete = async () => {
    if (!effort) return;
    setBusy(true);
    setError(null);
    try {
      await api<SessionSummary>('POST', `/me/sessions/${id}/complete`, { perceivedEffort: effort });
      router.replace(`/seduta/riepilogo/${id}`);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  if (!data)
    return (
      <Screen>
        <TopBar title="Seduta" onBack={() => router.back()} />
        <ErrorBox error={loadError} />
        {!loadError && <Loading />}
      </Screen>
    );

  const completed = Boolean(data.completedAt);
  const doneSets = data.exercises.reduce((n, e) => n + Math.min(e.logs.length, e.targetSets), 0);
  const totalSets = data.exercises.reduce((n, e) => n + e.targetSets, 0);

  return (
    <Screen
      footer={
        completed ? (
          <Button title="Vedi il riepilogo" onPress={() => router.replace(`/seduta/riepilogo/${id}`)} />
        ) : rest ? (
          <View style={{ backgroundColor: colors.ardesia, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.acqua, padding: 14, gap: 8 }} accessibilityLiveRegion="polite">
            <Row style={{ justifyContent: 'space-between' }}>
              <View>
                <Eyebrow>Recupero</Eyebrow>
                <Text style={{ fontFamily: font.displayHeavy, fontSize: 34, color: colors.ghiaccio }}>{clock(left)}</Text>
              </View>
              <Row style={{ gap: 8 }}>
                <Button title="+15 s" variant="ghost" onPress={() => setRest({ endsAt: rest.endsAt + 15_000, total: rest.total + 15 })} />
                <Button title="Salta" variant="ghost" onPress={() => setRest(null)} />
              </Row>
            </Row>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.blu }}>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.acqua, width: `${Math.min(100, (left / rest.total) * 100)}%` }} />
            </View>
          </View>
        ) : finishing ? null : (
          <Button title={doneSets >= totalSets ? 'Termina la seduta' : `Termina la seduta (${doneSets}/${totalSets} serie)`} variant={doneSets >= totalSets ? 'primary' : 'ghost'} onPress={() => setFinishing(true)} disabled={doneSets === 0} />
        )
      }
    >
      <TopBar title={data.title} onBack={() => router.back()} />
      <Row style={{ justifyContent: 'space-between' }}>
        <Small>{shortDate(data.scheduledDate)} · {data.exercises.length} esercizi</Small>
        <Pill tone={doneSets >= totalSets ? 'energia' : 'acqua'}>{doneSets}/{totalSets} serie</Pill>
      </Row>
      <ErrorBox error={error} />

      {finishing && !completed && (
        <Card style={{ borderColor: colors.acqua }}>
          <H2 style={{ fontSize: 20 }}>Com’è andata?</H2>
          <Body style={{ fontSize: 14 }}>Indica la fatica percepita da 1 a 10: serve ad adattare le prossime sedute.</Body>
          <ChipRow>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <Chip key={n} label={String(n)} selected={effort === n} onPress={() => setEffort(n)} />)}
          </ChipRow>
          {effort && <Small style={{ color: colors.ghiaccio }}>{EFFORT[effort]}</Small>}
          <Button title="Salva e vedi il riepilogo" onPress={complete} loading={busy} disabled={!effort} />
          <Button title="Continua l’allenamento" variant="text" onPress={() => setFinishing(false)} />
        </Card>
      )}

      {data.exercises.map((ex) => {
        const isOpen = open === ex.id;
        const done = ex.logs.length >= ex.targetSets;
        const rows = Math.max(ex.targetSets, ex.logs.length) + (isOpen && done && !completed ? 1 : 0);
        return (
          <Card key={ex.id} style={isOpen ? { borderColor: colors.acqua } : undefined}>
            <Pressable onPress={() => setOpen(isOpen ? null : ex.id)} accessibilityRole="button" accessibilityState={{ expanded: isOpen }} accessibilityLabel={ex.exercise.name}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <H3>{ex.position}. {ex.exercise.name}</H3>
                  <Small style={{ color: colors.nebbia }}>
                    {ex.targetSets} × {ex.targetReps} {UNIT[ex.exercise.unit]}
                    {ex.targetLoadKg !== null ? ` · ${fmt(ex.targetLoadKg)} kg` : ''}
                    {ex.restSeconds > 0 ? ` · recupero ${ex.restSeconds} s` : ''}
                  </Small>
                </View>
                <Text style={{ fontFamily: font.textSemi, fontSize: 13, color: done ? colors.energia : colors.pietra }}>{done ? '✓' : `${ex.logs.length}/${ex.targetSets}`}</Text>
              </Row>
            </Pressable>
            {isOpen && (
              <View style={{ gap: 10, marginTop: 6 }}>
                {ex.exercise.description && <Body style={{ fontSize: 14, lineHeight: 20 }}>{ex.exercise.description}</Body>}
                <Small>{ex.exercise.muscles.map((m) => MUSCLE_LABELS[m]).join(' · ')}</Small>
                {ex.previous && (
                  <Small style={{ color: colors.acqua }}>
                    L’ultima volta ({shortDate(ex.previous.day)}): {ex.previous.sets.map((p) => `${p.reps}${p.loadKg !== null ? ` × ${fmt(p.loadKg)} kg` : ''}`).join(' · ')}
                  </Small>
                )}
                {Array.from({ length: rows }, (_, i) => i + 1).map((n) => (
                  <SetRow key={`${ex.id}-${n}-${ex.logs.find((l) => l.setNumber === n)?.id ?? 'new'}`} ex={ex} n={n} disabled={completed} onSave={(r, l) => saveSet(ex, n, r, l)} />
                ))}
              </View>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}
