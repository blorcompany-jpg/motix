import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import type { TrainerCard } from '@motix/shared';
import { Card, ErrorBox, Field, Loading, Notice, Screen, Small, TopBar } from '@/components/ui';
import { colors, font } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

/** Elenco dei personal trainer con profilo pubblico, da contattare. */
export default function Trainers() {
  const [q, setQ] = useState('');
  const { data, error } = useApi<{ trainers: TrainerCard[] }>(`/community/trainers${q.trim().length >= 2 ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
  return (
    <Screen>
      <TopBar title="Personal trainer" onBack={() => router.back()} />
      <Field label="Cerca per nome o specializzazione" value={q} onChangeText={setQ} autoCorrect={false} placeholder="Es. posturale" />
      <ErrorBox error={error} />
      {!data && !error && <Loading />}
      {data?.trainers.map((t) => (
        <Pressable key={t.trainerId} onPress={() => router.push(`/community/profilo/${t.userId}`)} accessibilityRole="button" accessibilityLabel={`Profilo di ${t.name}`}>
          <Card>
            <Text style={{ fontFamily: font.displaySemi, fontSize: 17, color: colors.ghiaccio }}>{t.name}</Text>
            {t.specializations.length > 0 && <Small style={{ color: colors.acqua }}>{t.specializations.join(' · ')}</Small>}
            {t.bio && <Small style={{ color: colors.nebbia }} numberOfLines={2}>{t.bio}</Small>}
          </Card>
        </Pressable>
      ))}
      {data && data.trainers.length === 0 && <Notice>Nessun personal trainer trovato.</Notice>}
    </Screen>
  );
}
