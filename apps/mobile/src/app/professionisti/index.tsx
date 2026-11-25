import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { PROFESSIONS, PROFESSION_LABELS, type Profession, type ProfessionalCard } from '@motix/shared';
import { Card, Chip, ChipRow, ErrorBox, Field, H3, Loading, Pill, Row, Screen, Small, TopBar } from '@/components/ui';
import { colors, font } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

/** Vetrina dei professionisti: personal trainer, preparatori, fisioterapisti e nutrizionisti con l'albo verificato. */
export default function Professionisti() {
  const [profession, setProfession] = useState<Profession | null>(null);
  const [city, setCity] = useState('');
  const params = new URLSearchParams();
  if (profession) params.set('profession', profession);
  if (city.trim().length >= 2) params.set('city', city.trim());
  const { data, error } = useApi<{ professionals: ProfessionalCard[] }>(`/public/professionals?${params.toString()}`);

  return (
    <Screen>
      <TopBar title="Professionisti" onBack={() => router.back()} />
      <Small style={{ color: colors.nebbia }}>Scegli chi ti segue: il professionista ti prepara il piano e lo vedi qui nell’app. Senza professionista il piano lo crea l’AI.</Small>
      <ChipRow>
        <Chip label="Tutti" selected={!profession} onPress={() => setProfession(null)} />
        {PROFESSIONS.map((p) => <Chip key={p} label={PROFESSION_LABELS[p]} selected={profession === p} onPress={() => setProfession(p)} />)}
      </ChipRow>
      <Field label="Città" value={city} onChangeText={setCity} placeholder="Es. Bari" autoCorrect={false} />
      <ErrorBox error={error} />
      {!data && !error && <Loading />}
      {data && !data.professionals.length && <Small style={{ color: colors.nebbia }}>Nessun professionista con questi filtri.</Small>}
      {data?.professionals.map((p) => (
        <Pressable key={p.id} onPress={() => router.push(`/professionisti/${p.id}`)} accessibilityRole="button" accessibilityLabel={`Profilo di ${p.name}`}>
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <H3>{p.name}</H3>
                <Small style={{ color: colors.acqua }}>{PROFESSION_LABELS[p.profession]}{p.city ? ` · ${p.city}` : ''}</Small>
              </View>
              {p.verified && <Pill tone="energia">Albo verificato</Pill>}
            </Row>
            {p.specializations.length > 0 && <Small style={{ color: colors.nebbia }}>{p.specializations.join(' · ')}</Small>}
            {p.bio && <Text numberOfLines={2} style={{ fontFamily: font.text, fontSize: 14, color: colors.ghiaccio }}>{p.bio}</Text>}
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
