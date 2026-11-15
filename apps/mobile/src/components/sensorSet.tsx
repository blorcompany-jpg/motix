import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { LiveRepCounter, PodRecorder, type SensorSetResponse, type SensorView, type SessionDetail, type SessionExerciseDetail } from '@motix/shared';
import { Body, Button, Chip, ChipRow, ErrorBox, Eyebrow, H3, Row, Small, Stat } from '@/components/ui';
import { ApiFailure, api } from '@/lib/api';
import { pod } from '@/lib/pod';
import { colors, font, radii } from '@/lib/theme';

type Phase = 'ready' | 'connecting' | 'recording' | 'sending' | 'done';
const fmt = (n: number | null) => (n === null ? '' : String(n).replace('.', ','));

/**
 * Una serie registrata con il motix pod: collegamento, conteggio in tempo reale, invio al server.
 * Il numero che resta nel diario è quello calcolato dal motore AI sull'intero segnale.
 */
export function SensorSet({
  sessionId,
  ex,
  setNumber,
  sensors,
  suggestedLoad,
  onSaved,
  onClose,
  onManual,
}: {
  sessionId: string;
  ex: SessionExerciseDetail;
  setNumber: number;
  sensors: SensorView[];
  suggestedLoad: number | null;
  onSaved: (session: SessionDetail) => void;
  onClose: () => void;
  /** Passa alla registrazione a mano, con le ripetizioni contate fin lì. */
  onManual: (reps: number) => void;
}) {
  const [phase, setPhase] = useState<Phase>('ready');
  const [sensorId, setSensorId] = useState(sensors[0]!.id);
  const [load, setLoad] = useState(fmt(suggestedLoad));
  const [reps, setReps] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [canManual, setCanManual] = useState(false);
  const [result, setResult] = useState<SensorSetResponse['analysis'] | null>(null);
  const recorder = useRef<PodRecorder | null>(null);
  const battery = useRef<{ batteryPct: number | null; firmware: string | null }>({ batteryPct: null, firmware: null });

  // Se la schermata si chiude a metà serie, il sensore smette di trasmettere.
  useEffect(() => () => void pod.stop(), []);

  const start = async () => {
    setError(null);
    setCanManual(false);
    setPhase('connecting');
    try {
      const sensor = sensors.find((s) => s.id === sensorId)!;
      const info = await pod.connect(sensor.serial);
      battery.current = { batteryPct: info.batteryPct, firmware: info.firmware };
      const rec = new PodRecorder(pod.sampleRateHz);
      const counter = new LiveRepCounter(pod.sampleRateHz);
      recorder.current = rec;
      setReps(0);
      setSeconds(0);
      await pod.start(
        (samples, seq) => {
          rec.push(samples, seq);
          setReps(counter.push(samples));
          setSeconds(Math.floor(rec.seconds));
        },
        { reps: ex.targetReps },
      );
      setPhase('recording');
    } catch (e) {
      setError(e);
      setPhase('ready');
    }
  };

  const finish = async () => {
    await pod.stop();
    const rec = recorder.current;
    if (!rec) return;
    setPhase('sending');
    const l = load.trim() === '' ? null : Number(load.replace(',', '.'));
    try {
      const res = await api<SensorSetResponse>('POST', `/me/sessions/${sessionId}/sets/sensor`, {
        sessionExerciseId: ex.id,
        setNumber,
        sensorId,
        loadKg: ex.exercise.loadable && l !== null && l >= 0 ? l : null,
        ...rec.signal(),
        ...(battery.current.batteryPct !== null ? { batteryPct: battery.current.batteryPct } : {}),
        ...(battery.current.firmware ? { firmware: battery.current.firmware } : {}),
      });
      setResult(res.analysis);
      setPhase('done');
      onSaved(res.session);
    } catch (e) {
      setError(e);
      // Se il sensore non ha visto ripetizioni o l'analisi non è disponibile, si può sempre registrare a mano.
      setCanManual(e instanceof ApiFailure && (e.code === 'no_reps' || e.code === 'analysis_unavailable' || e.status === 0));
      setPhase('ready');
    }
  };

  const box = { backgroundColor: colors.notte, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.energia, padding: 14, gap: 10 };
  return (
    <View style={box} accessibilityLabel={`Serie ${setNumber} con il sensore`}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Eyebrow style={{ color: colors.energia }}>Serie {setNumber} con il sensore</Eyebrow>
        {phase !== 'recording' && phase !== 'sending' && <Button title="Chiudi" variant="text" inline onPress={onClose} />}
      </Row>
      <ErrorBox error={error} />

      {(phase === 'ready' || phase === 'connecting') && (
        <>
          {sensors.length > 1 && (
            <ChipRow>
              {sensors.map((s) => <Chip key={s.id} label={s.serial} selected={sensorId === s.id} onPress={() => setSensorId(s.id)} />)}
            </ChipRow>
          )}
          {ex.exercise.loadable && (
            <Row style={{ gap: 8 }}>
              <Small style={{ color: colors.nebbia }}>Carico</Small>
              <TextInput
                value={load}
                onChangeText={setLoad}
                keyboardType="decimal-pad"
                maxLength={6}
                placeholder="—"
                placeholderTextColor={colors.pietra}
                accessibilityLabel="Carico in chili per la serie con il sensore"
                style={{ fontFamily: font.textSemi, fontSize: 16, color: colors.ghiaccio, backgroundColor: colors.ardesia, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.blu, minHeight: 44, width: 76, textAlign: 'center' }}
              />
              <Small style={{ color: colors.pietra }}>kg</Small>
            </Row>
          )}
          <Small style={{ color: colors.nebbia }}>Fissa il sensore all’attrezzo, premi «Avvia» e comincia: le ripetizioni si contano da sole.</Small>
          <Button title={error ? 'Riprova' : 'Avvia la serie'} onPress={start} loading={phase === 'connecting'} />
          {canManual && <Button title="Registra a mano" variant="ghost" onPress={() => onManual(reps)} />}
        </>
      )}

      {(phase === 'recording' || phase === 'sending') && (
        <>
          <View style={{ alignItems: 'center', gap: 2 }} accessibilityLiveRegion="polite">
            <Text style={{ fontFamily: font.displayHeavy, fontSize: 72, lineHeight: 80, color: colors.energia }} accessibilityLabel={`${reps} ripetizioni`}>{reps}</Text>
            <Small style={{ color: colors.nebbia }}>ripetizioni su {ex.targetReps} · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</Small>
          </View>
          <Button title="Fine serie" onPress={finish} loading={phase === 'sending'} />
        </>
      )}

      {phase === 'done' && result && (
        <>
          <H3>{result.reps} ripetizioni registrate</H3>
          <Row style={{ alignItems: 'stretch', gap: 8 }}>
            <Stat value={result.avgVelocity !== null ? result.avgVelocity.toFixed(2).replace('.', ',') : '—'} label="Velocità media (m/s)" />
            <Stat value={result.regularity !== null ? `${Math.round(result.regularity)}` : '—'} label="Regolarità su 100" />
            <Stat value={result.timeUnderTensionMs !== null ? `${Math.round(result.timeUnderTensionMs / 1000)} s` : '—'} label="Sotto tensione" />
          </Row>
          {result.velocityLossPct !== null && result.velocityLossPct > 35 && (
            <Body style={{ fontSize: 14 }}>Le ultime ripetizioni sono state molto più lente delle prime ({Math.round(result.velocityLossPct)}% in meno): sei vicino al limite con questo carico.</Body>
          )}
          <Small style={{ color: colors.nebbia }}>Se il numero non torna, correggilo nella riga della serie.</Small>
          <Button title="Continua" onPress={onClose} />
        </>
      )}
    </View>
  );
}
