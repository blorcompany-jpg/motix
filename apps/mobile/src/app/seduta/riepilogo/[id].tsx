import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { SessionSummary, Trend } from '@motix/shared';
import { Body, Button, Card, ErrorBox, Eyebrow, H2, H3, Loading, Row, Screen, Small, Stat } from '@/components/ui';
import { kg, shortDate } from '@/lib/dates';
import { velocity } from '@/lib/pod';
import { colors, font } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

const TREND: Record<Trend, { symbol: string; color: string; label: string }> = {
  up: { symbol: '▲', color: colors.energia, label: 'meglio' },
  same: { symbol: '=', color: colors.nebbia, label: 'uguale' },
  down: { symbol: '▼', color: colors.corallo, label: 'meno' },
  new: { symbol: '•', color: colors.acqua, label: 'prima volta' },
};
const num = (n: number) => n.toLocaleString('it-IT');

export default function Riepilogo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: s, error } = useApi<SessionSummary>(`/me/sessions/${id}/summary`);
  return (
    <Screen footer={<Button title="Torna alla home" onPress={() => router.replace('/home')} />}>
      <View style={{ gap: 2, marginTop: 8 }}>
        <Eyebrow>Seduta completata{s ? ` · ${shortDate(s.day)}` : ''}</Eyebrow>
        <H2>{s?.title ?? 'Riepilogo'}</H2>
      </View>
      <ErrorBox error={error} />
      {!s && !error && <Loading />}
      {s && (
        <>
          <Row style={{ alignItems: 'stretch', gap: 8 }}>
            <Stat value={s.durationMin !== null ? `${s.durationMin}′` : '—'} label="Durata" />
            <Stat value={s.totals.sets} label="Serie" />
            <Stat value={s.totals.volumeKg > 0 ? num(s.totals.volumeKg) : num(s.totals.reps)} label={s.totals.volumeKg > 0 ? 'Kg sollevati' : 'Ripetizioni'} />
          </Row>

          <Card>
            <H3>Rispetto a prima</H3>
            {s.previous ? (
              <Body style={{ fontSize: 14, lineHeight: 21 }}>
                Ultima «{s.title}» il {shortDate(s.previous.day)}:{' '}
                {s.previous.volumeDeltaPct !== null ? (
                  <Text style={{ color: s.previous.volumeDeltaPct >= 0 ? colors.energia : colors.corallo, fontFamily: font.textSemi }}>
                    {s.previous.volumeDeltaPct >= 0 ? '+' : ''}{s.previous.volumeDeltaPct}% di volume
                  </Text>
                ) : (
                  `${s.totals.reps - s.previous.reps >= 0 ? '+' : ''}${s.totals.reps - s.previous.reps} ripetizioni`
                )}
                {s.previous.volumeDeltaPct !== null ? ` (${num(s.previous.volumeKg)} → ${num(s.totals.volumeKg)} kg).` : '.'}
              </Body>
            ) : (
              <Body style={{ fontSize: 14 }}>È la prima volta che fai questa seduta: da qui parte il confronto.</Body>
            )}
            <Body style={{ fontSize: 14, lineHeight: 21 }}>
              Questa settimana {s.week.sessionsThisWeek} {s.week.sessionsThisWeek === 1 ? 'seduta' : 'sedute'}
              {s.week.volumeThisWeek > 0 ? ` e ${num(s.week.volumeThisWeek)} kg` : ''}; la settimana scorsa {s.week.sessionsLastWeek}
              {s.week.volumeLastWeek > 0 ? ` e ${num(s.week.volumeLastWeek)} kg` : ''}.
            </Body>
          </Card>

          {s.sensor && (
            <Card style={{ borderColor: colors.energia }}>
              <H3>Con il sensore</H3>
              <Row style={{ alignItems: 'stretch', gap: 8 }}>
                <Stat value={s.sensor.sets} label={s.sensor.sets === 1 ? 'Serie misurata' : 'Serie misurate'} />
                <Stat value={s.sensor.avgVelocity !== null ? s.sensor.avgVelocity.toFixed(2).replace('.', ',') : '—'} label="Velocità media (m/s)" />
                <Stat value={s.sensor.regularity !== null ? Math.round(s.sensor.regularity) : '—'} label="Regolarità su 100" />
              </Row>
              <Small style={{ color: colors.nebbia }}>
                {Math.round(s.sensor.timeUnderTensionMs / 1000)} secondi sotto tensione. La regolarità dice quanto le ripetizioni si somigliano per ritmo e ampiezza.
              </Small>
            </Card>
          )}

          <Card>
            <H3>Esercizi</H3>
            {s.exercises.map((e, i) => {
              const t = TREND[e.trend];
              return (
                <Row key={i} style={{ justifyContent: 'space-between', borderTopWidth: i ? 1 : 0, borderTopColor: colors.blu, paddingTop: i ? 10 : 2 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontFamily: font.textMedium, fontSize: 15, color: colors.ghiaccio }}>{e.name}</Text>
                    <Small style={{ color: colors.nebbia }}>
                      {e.sets} serie · {e.reps} rip.{e.bestLoadKg !== null ? ` · max ${kg(e.bestLoadKg)}` : ''}
                      {e.previous ? `  (prima: ${e.previous.reps} rip.${e.previous.bestLoadKg !== null ? `, ${kg(e.previous.bestLoadKg)}` : ''})` : ''}
                    </Small>
                    {e.sensor && (
                      <Small style={{ color: colors.energia }}>
                        Sensore: {velocity(e.sensor.avgVelocity)}
                        {e.sensor.previousAvgVelocity !== null ? ` (prima ${velocity(e.sensor.previousAvgVelocity)})` : ''}
                        {e.sensor.regularity !== null ? ` · regolarità ${Math.round(e.sensor.regularity)}` : ''}
                      </Small>
                    )}
                  </View>
                  <Text style={{ fontFamily: font.textSemi, fontSize: 13, color: t.color }} accessibilityLabel={t.label}>{t.symbol} {t.label}</Text>
                </Row>
              );
            })}
          </Card>

          <Card style={{ borderColor: colors.acqua }}>
            <H3>Consigli</H3>
            {s.tips.map((tip, i) => <Body key={i} style={{ fontSize: 14, lineHeight: 21 }}>• {tip}</Body>)}
          </Card>
        </>
      )}
    </Screen>
  );
}
