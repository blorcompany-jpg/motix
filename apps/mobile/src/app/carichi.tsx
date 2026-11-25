import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { ExerciseHistory, ExerciseRecords } from '@motix/shared';
import { Bars, Card, ErrorBox, H3, Loading, Row, Screen, Small, TopBar } from '@/components/ui';
import { api } from '@/lib/api';
import { kg, shortDate } from '@/lib/dates';
import { PremiumCard, isPremiumError } from '@/lib/premium';
import { colors, font } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

export default function Carichi() {
  const { data, error: loadError } = useApi<ExerciseRecords>('/me/exercises/records');
  const [open, setOpen] = useState<string | null>(null);
  const [history, setHistory] = useState<ExerciseHistory | null>(null);
  const [error, setError] = useState<unknown>(null);

  const show = async (id: string) => {
    if (open === id) return setOpen(null);
    setOpen(id);
    setHistory(null);
    setError(null);
    try {
      setHistory(await api<ExerciseHistory>('GET', `/me/exercises/${id}/history`));
    } catch (e) {
      setError(e);
    }
  };

  return (
    <Screen>
      <TopBar title="I miei carichi" onBack={() => router.back()} />
      <ErrorBox error={loadError ?? (isPremiumError(error) ? null : error)} />
      {!data && !loadError && <Loading />}
      {data && !data.records.length && (
        <Card>
          <Small style={{ color: colors.nebbia }}>Qui trovi il carico migliore di ogni esercizio con i pesi, appena registri le prime serie.</Small>
        </Card>
      )}
      {data?.records.map((r) => (
        <Pressable key={r.exerciseId} onPress={() => void show(r.exerciseId)} accessibilityRole="button" accessibilityLabel={`Storico di ${r.name}`}>
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <H3>{r.name}</H3>
                <Small style={{ color: colors.nebbia }}>{r.sessions} {r.sessions === 1 ? 'seduta' : 'sedute'} · record il {shortDate(r.day)}</Small>
              </View>
              <Text style={{ fontFamily: font.displayHeavy, fontSize: 22, color: colors.energia }}>{kg(r.bestKg)}</Text>
            </Row>
            {open === r.exerciseId && isPremiumError(error) && <PremiumCard what="Lo storico completo dei carichi" />}
            {open === r.exerciseId && history && (
              <View style={{ gap: 6, marginTop: 6 }}>
                <Bars data={history.points.slice(-10).map((p) => ({ label: shortDate(p.day), value: p.bestKg ?? 0 }))} />
                {history.points.slice(-5).reverse().map((p) => (
                  <Small key={p.day} style={{ color: colors.nebbia }}>
                    {shortDate(p.day)} · {p.bestKg !== null ? kg(p.bestKg) : `${p.bestReps} rip.`} · {p.sets} serie · volume {kg(p.volumeKg)}
                  </Small>
                ))}
              </View>
            )}
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
