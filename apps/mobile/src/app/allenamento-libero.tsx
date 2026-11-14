import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { MUSCLES, MUSCLE_LABELS, type Muscle, type SessionDetail } from '@motix/shared';
import { Body, Button, Chip, ChipRow, ErrorBox, Field, Loading, Screen, Small, TopBar } from '@/components/ui';
import { api } from '@/lib/api';
import { today } from '@/lib/dates';
import { colors, font, radii } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

interface LibraryItem {
  id: string;
  name: string;
  muscles: Muscle[];
  equipment: string[];
}

/** L'utente compone la seduta scegliendo gli esercizi dalla libreria. Disponibile anche nella versione gratuita. */
export default function AllenamentoLibero() {
  const { data, error: loadError } = useApi<{ exercises: LibraryItem[] }>('/exercises');
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<Muscle | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const list = useMemo(
    () =>
      (data?.exercises ?? []).filter(
        (e) => (!muscle || e.muscles[0] === muscle) && (!q.trim() || e.name.toLowerCase().includes(q.trim().toLowerCase())),
      ),
    [data, q, muscle],
  );

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await api<SessionDetail>('POST', '/me/sessions', { day: today(), exerciseIds: picked });
      router.replace(`/seduta/${s.id}`);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button title={picked.length ? `Inizia con ${picked.length} ${picked.length === 1 ? 'esercizio' : 'esercizi'}` : 'Scegli almeno un esercizio'} onPress={start} loading={busy} disabled={!picked.length || picked.length > 12} />}>
      <TopBar title="Allenamento libero" onBack={() => router.back()} />
      <Body style={{ fontSize: 14 }}>Scegli fino a 12 esercizi: li trovi nella seduta nell’ordine in cui li selezioni.</Body>
      <ErrorBox error={error ?? loadError} />
      <Field label="Cerca un esercizio" value={q} onChangeText={setQ} autoCorrect={false} />
      <ChipRow>
        <Chip label="Tutti" selected={muscle === null} onPress={() => setMuscle(null)} />
        {MUSCLES.map((m) => <Chip key={m} label={MUSCLE_LABELS[m]} selected={muscle === m} onPress={() => setMuscle(muscle === m ? null : m)} />)}
      </ChipRow>
      {!data && !loadError && <Loading />}
      <View style={{ gap: 8 }}>
        {list.map((e) => {
          const order = picked.indexOf(e.id);
          const on = order >= 0;
          return (
            <Pressable
              key={e.id}
              onPress={() => setPicked(on ? picked.filter((p) => p !== e.id) : [...picked, e.id])}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={e.name}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radii.md, borderWidth: 1, borderColor: on ? colors.acqua : colors.blu, backgroundColor: colors.ardesia, padding: 12, minHeight: 56 }}
            >
              <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: on ? colors.acqua : colors.pietra, backgroundColor: on ? colors.acqua : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {on && <Text style={{ fontFamily: font.textSemi, fontSize: 13, color: colors.notte }}>{order + 1}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: font.textMedium, fontSize: 15, color: colors.ghiaccio }}>{e.name}</Text>
                <Small style={{ color: colors.nebbia }}>{e.muscles.map((m) => MUSCLE_LABELS[m]).join(' · ')}{e.equipment.length === 0 ? ' · corpo libero' : ''}</Small>
              </View>
            </Pressable>
          );
        })}
        {data && list.length === 0 && <Small style={{ color: colors.nebbia }}>Nessun esercizio trovato.</Small>}
      </View>
    </Screen>
  );
}
