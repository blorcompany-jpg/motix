import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { PROFESSION_LABELS, type ProfessionalProfile } from '@motix/shared';
import { Body, Button, Card, ErrorBox, H2, H3, Loading, Notice, Pill, Row, Screen, Small, TopBar } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, font } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

export default function Professionista() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data: p, error: loadError } = useApi<ProfessionalProfile>(`/public/professionals/${id}`);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/me/trainer-links/request', { trainerId: id });
      setSent(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <TopBar title="Profilo" onBack={() => router.back()} />
      <ErrorBox error={error ?? loadError} />
      {!p && !loadError && <Loading />}
      {p && (
        <>
          <View style={{ gap: 4 }}>
            <H2>{p.name}</H2>
            <Row style={{ gap: 8 }}>
              <Pill>{PROFESSION_LABELS[p.profession]}</Pill>
              {p.verified && <Pill tone="energia">Albo verificato</Pill>}
            </Row>
            <Small style={{ color: colors.nebbia }}>{[p.city, `${p.clients} ${p.clients === 1 ? 'cliente' : 'clienti'} su MOTIX`].filter(Boolean).join(' · ')}</Small>
          </View>
          {p.bio && <Body>{p.bio}</Body>}
          {p.specializations.length > 0 && (
            <Card>
              <H3>Specializzazioni</H3>
              <Body style={{ fontSize: 14 }}>{p.specializations.join(' · ')}</Body>
            </Card>
          )}
          {p.structures.length > 0 && (
            <Card>
              <H3>Dove lavora</H3>
              {p.structures.map((s) => <Body key={s.displayName} style={{ fontSize: 14 }}>{s.displayName} · {s.city}</Body>)}
            </Card>
          )}
          {p.videos.length > 0 && (
            <Card>
              <H3>Video</H3>
              {p.videos.map((v) => (
                <Pressable key={v.id} onPress={() => void Linking.openURL(v.url)} accessibilityRole="link" accessibilityLabel={v.title}>
                  <Text style={{ fontFamily: font.textSemi, fontSize: 15, color: colors.acqua, paddingVertical: 4 }}>▶ {v.title}</Text>
                </Pressable>
              ))}
            </Card>
          )}
          {user?.role === 'user' &&
            (sent ? (
              <Notice tone="ok">Richiesta inviata: quando {p.name.split(' ')[0]} accetta, lo trovi nel tuo profilo.</Notice>
            ) : (
              <Button title={`Chiedi a ${p.name.split(' ')[0]} di seguirti`} onPress={ask} loading={busy} />
            ))}
          <Small style={{ color: colors.pietra }}>Per vedere i tuoi dati il professionista ha bisogno del tuo consenso, che gestisci da Profilo › Privacy e consensi.</Small>
        </>
      )}
    </Screen>
  );
}
