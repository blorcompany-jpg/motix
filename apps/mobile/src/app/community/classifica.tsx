import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { LeaderboardRow } from '@motix/shared';
import { Card, Chip, ChipRow, ErrorBox, Eyebrow, H2, Loading, Notice, Row, Screen, Small, TopBar } from '@/components/ui';
import { colors, font } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

export default function Classifica() {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const { data, error } = useApi<{ structure: string | null; rows: LeaderboardRow[] }>(`/community/leaderboard?period=${period}`);
  return (
    <Screen>
      <TopBar title="Classifica" onBack={() => router.back()} />
      <View style={{ gap: 2 }}>
        <Eyebrow>{data?.structure ?? 'La mia struttura'}</Eyebrow>
        <H2>Chi si allena di più</H2>
      </View>
      <ChipRow>
        <Chip label="Questa settimana" selected={period === 'week'} onPress={() => setPeriod('week')} />
        <Chip label="Ultimi 30 giorni" selected={period === 'month'} onPress={() => setPeriod('month')} />
      </ChipRow>
      <ErrorBox error={error} />
      {!data && !error && <Loading />}
      {data?.rows.map((r) => (
        <Pressable key={r.userId} onPress={() => router.push(`/community/profilo/${r.userId}`)} accessibilityRole="button" accessibilityLabel={`${r.rank}°, ${r.name}, ${r.sessions} sedute`}>
          <Card style={r.me ? { borderColor: colors.acqua } : undefined}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row>
                <Text style={{ fontFamily: font.displayHeavy, fontSize: 22, width: 36, color: r.rank === 1 ? colors.energia : colors.nebbia }}>{r.rank}</Text>
                <Text style={{ fontFamily: font.displaySemi, fontSize: 16, color: colors.ghiaccio }}>{r.name}{r.me ? ' (tu)' : ''}</Text>
              </Row>
              <Text style={{ fontFamily: font.textSemi, fontSize: 14, color: colors.acqua }}>{r.sessions} {r.sessions === 1 ? 'seduta' : 'sedute'}</Text>
            </Row>
          </Card>
        </Pressable>
      ))}
      {data && data.rows.length === 0 && <Notice>Collega la tua struttura dal profilo per vedere la classifica.</Notice>}
      <Small>In classifica compare solo chi ha il profilo visibile nella community. Tu ti vedi sempre.</Small>
    </Screen>
  );
}
