import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { MUSCLE_LABELS, type PlanSessionSummary, type ProgressResponse } from '@motix/shared';
import { Bars, Body, Button, Card, Chip, ChipRow, ErrorBox, Eyebrow, H2, H3, HBar, Loading, Notice, Row, Screen, Small, Stat, TopBar } from '@/components/ui';
import { kg, liters, shortDate, today, weekdayInitial } from '@/lib/dates';
import { colors, font } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

export default function Progressi() {
  const [days, setDays] = useState(30);
  const { data: p, error, loading } = useApi<ProgressResponse>(`/me/progress?day=${today()}&days=${days}`);
  const diary = useApi<{ sessions: PlanSessionSummary[] }>('/me/sessions');
  const sessions = p?.weeks.reduce((n, w) => n + w.sessions, 0) ?? 0;
  const volume = p?.weeks.reduce((n, w) => n + w.volumeKg, 0) ?? 0;
  const maxMuscle = Math.max(1, ...(p?.muscles.map((m) => m.sets) ?? [1]));
  const water = p?.hydration.days.slice(-7) ?? [];

  return (
    <Screen>
      <TopBar title="Progressi" onBack={() => router.back()} />
      <View style={{ gap: 2 }}>
        <Eyebrow>{p ? `Ultimi ${p.days} giorni` : 'Progressi'}</Eyebrow>
        <H2>I tuoi progressi</H2>
      </View>
      {p && !p.limited && (
        <ChipRow>
          {[7, 30, 90].map((d) => <Chip key={d} label={`${d} giorni`} selected={days === d} onPress={() => setDays(d)} />)}
        </ChipRow>
      )}
      <ErrorBox error={error} />
      {!p && loading && <Loading />}
      {p?.limited && (
        <Pressable onPress={() => router.push('/abbonamento')} accessibilityRole="button">
          <Notice>Nella versione gratuita vedi gli ultimi 7 giorni. Con Premium hai lo storico completo e il confronto tra le sedute.</Notice>
        </Pressable>
      )}

      {p && (
        <>
          <Row style={{ alignItems: 'stretch', gap: 8 }}>
            <Stat value={sessions} label={sessions === 1 ? 'Seduta' : 'Sedute'} />
            <Stat value={volume.toLocaleString('it-IT')} label="Kg sollevati" />
            <Stat value={p.streakDays} label="Giorni di fila" />
          </Row>

          <Card>
            <H3>Sedute per settimana</H3>
            <Bars data={p.weeks.map((w) => ({ label: shortDate(w.weekStart).replace('.', ''), value: w.sessions }))} />
          </Card>

          {p.muscles.length > 0 && (
            <Card>
              <H3>Lavoro per gruppo muscolare</H3>
              {p.muscles.map((m) => <HBar key={m.muscle} label={MUSCLE_LABELS[m.muscle]} value={m.sets} max={maxMuscle} suffix="serie" />)}
            </Card>
          )}

          {p.strength.length > 0 && (
            <Card>
              <H3>Forza</H3>
              {p.strength.map((s) => {
                const first = s.points[0]!.bestLoadKg;
                const last = s.points.at(-1)!.bestLoadKg;
                const delta = last - first;
                return (
                  <Row key={s.exercise} style={{ justifyContent: 'space-between' }}>
                    <Text style={{ flex: 1, fontFamily: font.textMedium, fontSize: 14, color: colors.ghiaccio }}>{s.exercise}</Text>
                    <Text style={{ fontFamily: font.text, fontSize: 13, color: colors.nebbia }}>{kg(first)} → {kg(last)}</Text>
                    <Text style={{ fontFamily: font.textSemi, fontSize: 13, width: 64, textAlign: 'right', color: delta > 0 ? colors.energia : delta < 0 ? colors.corallo : colors.nebbia }}>
                      {delta > 0 ? '+' : ''}{kg(delta)}
                    </Text>
                  </Row>
                );
              })}
            </Card>
          )}

          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <H3>Peso</H3>
              {p.weight.length > 0 && <Text style={{ fontFamily: font.display, fontSize: 18, color: colors.ghiaccio }}>{kg(p.weight.at(-1)!.weightKg)}</Text>}
            </Row>
            {p.weight.length >= 2 ? (
              <Small style={{ color: colors.nebbia }}>
                Dal {shortDate(p.weight[0]!.day)}: {p.weight.at(-1)!.weightKg - p.weight[0]!.weightKg > 0 ? '+' : ''}{kg(Math.round((p.weight.at(-1)!.weightKg - p.weight[0]!.weightKg) * 10) / 10)}
              </Small>
            ) : (
              <Small style={{ color: colors.nebbia }}>Aggiungi una misura ogni settimana per vedere l’andamento.</Small>
            )}
            <Button title="Aggiungi una misura" variant="ghost" onPress={() => router.push('/misure')} />
          </Card>

          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <H3>Idratazione</H3>
              {p.hydration.trackedDays > 0 && <Small style={{ color: colors.nebbia }}>media {liters(p.hydration.averageMl)} al giorno</Small>}
            </Row>
            <Bars goal data={water.map((d) => ({ label: weekdayInitial(d.day), value: d.totalMl, goal: d.goalMl }))} height={72} />
            <Small style={{ color: colors.nebbia }}>
              {p.hydration.trackedDays > 0
                ? `Obiettivo raggiunto ${p.hydration.daysOnTarget} ${p.hydration.daysOnTarget === 1 ? 'giorno' : 'giorni'} su ${p.hydration.trackedDays}.`
                : 'Registra l’acqua che bevi per vedere l’andamento.'}
            </Small>
          </Card>
        </>
      )}

      <Card>
        <H3>Diario degli allenamenti</H3>
        {diary.data?.sessions.length === 0 && <Body style={{ fontSize: 14 }}>Le sedute completate compaiono qui.</Body>}
        {diary.data?.sessions.map((s, i) => (
          <Pressable key={s.id} onPress={() => router.push(`/seduta/riepilogo/${s.id}`)} accessibilityRole="button" accessibilityLabel={`${s.title} del ${shortDate(s.scheduledDate)}`}>
            <Row style={{ justifyContent: 'space-between', borderTopWidth: i ? 1 : 0, borderTopColor: colors.blu, paddingTop: i ? 10 : 0 }}>
              <Text style={{ fontFamily: font.textMedium, fontSize: 15, color: colors.ghiaccio }}>{s.title}</Text>
              <Small style={{ color: colors.nebbia }}>{shortDate(s.scheduledDate)} ›</Small>
            </Row>
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}
