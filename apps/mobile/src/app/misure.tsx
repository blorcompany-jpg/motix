import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, ErrorBox, Field, H3, Screen, TopBar } from '@/components/ui';
import { api } from '@/lib/api';
import { today } from '@/lib/dates';

const PARTS = [['waist', 'Vita'], ['hips', 'Fianchi'], ['chest', 'Petto'], ['arm', 'Braccio'], ['thigh', 'Coscia']] as const;
const toNumber = (v: string) => Number(v.replace(',', '.'));

export default function Misure() {
  const [weight, setWeight] = useState('');
  const [parts, setParts] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setLocal('');
    setError(null);
    const w = weight.trim() ? toNumber(weight) : undefined;
    if (w !== undefined && !(w >= 30 && w <= 250)) return setLocal('Peso non valido');
    const circumferences: Record<string, number> = {};
    for (const [key] of PARTS) {
      const v = parts[key]?.trim();
      if (!v) continue;
      const n = toNumber(v);
      if (!(n >= 10 && n <= 250)) return setLocal('Controlla le circonferenze: valori in centimetri');
      circumferences[key] = n;
    }
    if (w === undefined && !Object.keys(circumferences).length) return setLocal('Inserisci almeno una misura');
    setBusy(true);
    try {
      await api('POST', '/me/measurements', { day: today(), weightKg: w, circumferences: Object.keys(circumferences).length ? circumferences : undefined });
      router.back();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button title="Salva le misure" onPress={save} loading={busy} />}>
      <TopBar title="Nuova misura" onBack={() => router.back()} />
      <Body>Meglio la mattina, sempre nelle stesse condizioni. Compila solo quello che vuoi seguire.</Body>
      <ErrorBox error={error} />
      <Field label="Peso (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" maxLength={5} error={local || undefined} />
      <H3>Circonferenze (cm)</H3>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {PARTS.map(([key, label]) => (
          <View key={key} style={{ flexBasis: '46%', flexGrow: 1 }}>
            <Field label={label} value={parts[key] ?? ''} onChangeText={(v) => setParts({ ...parts, [key]: v })} keyboardType="decimal-pad" maxLength={5} />
          </View>
        ))}
      </View>
    </Screen>
  );
}
