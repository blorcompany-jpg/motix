import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import {
  EQUIPMENT,
  EQUIPMENT_LABELS,
  GOALS,
  GOAL_LABELS,
  LEVELS,
  LEVEL_HINTS,
  LEVEL_LABELS,
  LIMITATIONS,
  LIMITATION_LABELS,
  SEXES,
  SEX_LABELS,
  type Equipment,
  type Goal,
  type Level,
  type Limitation,
  type Sex,
  type SportProfile,
} from '@motix/shared';
import { Body, Button, Chip, ChipRow, ErrorBox, Eyebrow, Field, H2, H3, Logo, Notice, Screen, Small, fieldsOf } from '@/components/ui';
import { ApiFailure, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { today } from '@/lib/dates';
import { colors } from '@/lib/theme';

const TITLES = ['Parlaci di te', 'Il tuo obiettivo', 'Livello e giorni', 'Attrezzi', 'Limitazioni'] as const;
const GOAL_HINTS: Record<Goal, string> = {
  lose_weight: 'Perdere peso con sedute dinamiche',
  tone: 'Definire i muscoli su tutto il corpo',
  strength: 'Sollevare di più, in sicurezza',
  endurance: 'Reggere lo sforzo più a lungo',
  health: 'Muovermi meglio e stare bene',
};
const toNumber = (v: string) => Number(v.replace(',', '.'));

/** Questionario iniziale: da qui nasce il piano. Si può riaprire dal profilo per modificarlo. */
export default function Questionario() {
  const { user, reload } = useAuth();
  const [step, setStep] = useState(0);
  const [sex, setSex] = useState<Sex | null>(null);
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [goal, setGoal] = useState<Goal | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [limitations, setLimitations] = useState<Limitation[]>([]);
  const [local, setLocal] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const editing = Boolean(user?.hasProfile);

  useEffect(() => {
    if (!editing) return;
    api<SportProfile>('GET', '/me/profile')
      .then((p) => {
        setSex(p.sex);
        setWeight(p.weightKg ? String(p.weightKg).replace('.', ',') : '');
        setHeight(p.heightCm ? String(p.heightCm) : '');
        setGoal(p.goal);
        setLevel(p.level);
        setDays(p.daysPerWeek);
        setEquipment(p.equipment as Equipment[]);
        setLimitations(p.limitations);
      })
      .catch(setError);
  }, [editing]);

  if (!user) return <Redirect href="/" />;
  if (user.role !== 'user') return <Redirect href="/home" />;

  const validate = () => {
    const e: Record<string, string> = {};
    if (step === 0) {
      if (!sex) e.sex = 'Scegli un’opzione';
      const w = toNumber(weight);
      if (!(w >= 30 && w <= 250)) e.weightKg = 'Peso non valido';
      const h = toNumber(height);
      if (!(h >= 120 && h <= 230)) e.heightCm = 'Altezza non valida';
    }
    if (step === 1 && !goal) e.goal = 'Scegli un obiettivo';
    if (step === 2) {
      if (!level) e.level = 'Scegli il tuo livello';
      if (!days) e.days = 'Scegli quanti giorni';
    }
    setLocal(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('PUT', '/me/profile', { sex, weightKg: toNumber(weight), heightCm: Math.round(toNumber(height)), goal, level, daysPerWeek: days, equipment, limitations });
      // Il piano nuovo nasce dal questionario aggiornato (in Premium).
      await api('POST', '/me/plan/generate', { day: today() }).catch((e) => {
        if (!(e instanceof ApiFailure && e.code === 'premium_required')) throw e;
      });
      await reload();
      router.replace('/piano');
    } catch (e) {
      setError(e);
      if (Object.keys(fieldsOf(e)).some((k) => k === 'weightKg' || k === 'heightCm')) setStep(0);
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    setError(null);
    if (!validate()) return;
    if (step < 4) setStep(step + 1);
    else void submit();
  };
  const back = () => (step > 0 ? setStep(step - 1) : editing ? router.back() : undefined);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((i) => i !== v) : [...list, v]);
  const fe = { ...fieldsOf(error), ...local };
  const err = (k: string) => (fe[k] ? <Small style={{ color: colors.corallo }}>{fe[k]}</Small> : null);
  const fullGym = equipment.length === EQUIPMENT.length;

  return (
    <Screen
      footer={
        <>
          <Button title={step === 4 ? (editing ? 'Salva e aggiorna il piano' : 'Crea il mio piano') : 'Continua'} onPress={next} loading={busy} />
          {(step > 0 || editing) && <Button title={step > 0 ? 'Indietro' : 'Annulla'} variant="text" onPress={back} />}
        </>
      }
    >
      <Logo size={30} />
      <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={`Passo ${step + 1} di 5`}>
        {TITLES.map((_, i) => (
          <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? colors.acqua : colors.blu }} />
        ))}
      </View>
      <View style={{ gap: 4 }}>
        <Eyebrow>Passo {step + 1} di 5</Eyebrow>
        <H2>{TITLES[step]}</H2>
      </View>
      <ErrorBox error={error} />

      {step === 0 && (
        <>
          <Body>Servono a calcolare carichi, calorie e obiettivo di idratazione.</Body>
          <H3>Sesso</H3>
          <ChipRow>
            {SEXES.map((s) => <Chip key={s} label={SEX_LABELS[s]} selected={sex === s} onPress={() => setSex(s)} />)}
          </ChipRow>
          {err('sex')}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><Field label="Peso (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" maxLength={5} error={fe.weightKg} placeholder="70" /></View>
            <View style={{ flex: 1 }}><Field label="Altezza (cm)" value={height} onChangeText={setHeight} keyboardType="number-pad" maxLength={3} error={fe.heightCm} placeholder="170" /></View>
          </View>
        </>
      )}

      {step === 1 && (
        <>
          {GOALS.map((g) => <Chip key={g} label={GOAL_LABELS[g]} hint={GOAL_HINTS[g]} selected={goal === g} onPress={() => setGoal(g)} />)}
          {err('goal')}
        </>
      )}

      {step === 2 && (
        <>
          <H3>Il tuo livello</H3>
          {LEVELS.map((l) => <Chip key={l} label={LEVEL_LABELS[l]} hint={LEVEL_HINTS[l]} selected={level === l} onPress={() => setLevel(l)} />)}
          {err('level')}
          <H3 style={{ marginTop: 8 }}>Quanti giorni a settimana puoi allenarti?</H3>
          <ChipRow>
            {[1, 2, 3, 4, 5, 6].map((n) => <Chip key={n} label={String(n)} selected={days === n} onPress={() => setDays(n)} />)}
          </ChipRow>
          {err('days')}
        </>
      )}

      {step === 3 && (
        <>
          <Body>Scegli gli attrezzi che puoi usare. Senza attrezzi il piano è a corpo libero.</Body>
          <Chip label="Palestra completa" hint="Ho a disposizione tutti gli attrezzi" selected={fullGym} onPress={() => setEquipment(fullGym ? [] : [...EQUIPMENT])} />
          <ChipRow>
            {EQUIPMENT.map((eq) => <Chip key={eq} label={EQUIPMENT_LABELS[eq]} selected={equipment.includes(eq)} onPress={() => setEquipment(toggle(equipment, eq))} />)}
          </ChipRow>
        </>
      )}

      {step === 4 && (
        <>
          <Body>Hai dolori o infortuni? Il piano esclude gli esercizi che caricano le zone che indichi. Se non ne hai, continua.</Body>
          <ChipRow>
            {LIMITATIONS.map((l) => <Chip key={l} label={LIMITATION_LABELS[l]} selected={limitations.includes(l)} onPress={() => setLimitations(toggle(limitations, l))} />)}
          </ChipRow>
          <Notice>MOTIX non è un dispositivo medico. Se hai una patologia o senti dolore durante un esercizio, fermati e chiedi al tuo medico.</Notice>
        </>
      )}
    </Screen>
  );
}
