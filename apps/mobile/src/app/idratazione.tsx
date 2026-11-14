import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { CONTAINERS, CONTAINER_LABELS, CONTAINER_ML, type Container, type HydrationDay } from '@motix/shared';
import { Body, Card, ErrorBox, H3, Loading, Ring, Row, Screen, Small, TopBar } from '@/components/ui';
import { api } from '@/lib/api';
import { liters, today } from '@/lib/dates';
import { colors, font, radii } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

export default function Idratazione() {
  const day = today();
  const { data, error: loadError, setData } = useApi<HydrationDay>(`/me/hydration?day=${day}`);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<HydrationDay>) => {
    setBusy(key);
    setError(null);
    try {
      setData(await fn());
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const missing = data ? Math.max(0, data.goalMl - data.totalMl) : 0;
  return (
    <Screen>
      <TopBar title="Idratazione" onBack={() => router.back()} />
      <ErrorBox error={error ?? loadError} />
      {!data && !loadError && <Loading />}
      {data && (
        <>
          <View style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }}>
            <Ring value={data.totalMl} goal={data.goalMl} size={190} stroke={16}>
              <Text style={{ fontFamily: font.displayHeavy, fontSize: 38, color: colors.ghiaccio }}>{liters(data.totalMl)}</Text>
              <Small style={{ color: colors.nebbia }}>su {liters(data.goalMl)}</Small>
            </Ring>
            <Body style={{ fontSize: 15, color: missing === 0 ? colors.energia : colors.nebbia }}>
              {missing === 0 ? 'Obiettivo di oggi raggiunto' : `Ti mancano ${liters(missing)}`}
            </Body>
          </View>

          <H3>Aggiungi</H3>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CONTAINERS.map((c: Container) => (
              <Pressable
                key={c}
                onPress={() => run(c, () => api<HydrationDay>('POST', '/me/hydration', { day, container: c }))}
                disabled={busy !== null}
                accessibilityRole="button"
                accessibilityLabel={`Aggiungi ${CONTAINER_LABELS[c]}`}
                style={({ pressed }) => ({
                  flexBasis: '47%',
                  flexGrow: 1,
                  minHeight: 64,
                  borderRadius: radii.md,
                  borderWidth: 1,
                  borderColor: colors.blu,
                  backgroundColor: colors.ardesia,
                  padding: 12,
                  justifyContent: 'center',
                  opacity: busy === c ? 0.5 : pressed ? 0.75 : 1,
                })}
              >
                <Text style={{ fontFamily: font.textSemi, fontSize: 15, color: colors.ghiaccio }}>{CONTAINER_LABELS[c]}</Text>
                <Text style={{ fontFamily: font.text, fontSize: 13, color: colors.acqua }}>+{CONTAINER_ML[c]} ml</Text>
              </Pressable>
            ))}
          </View>

          <Card>
            <H3>Oggi</H3>
            {data.logs.length === 0 && <Small style={{ color: colors.nebbia }}>Ancora nessuna registrazione.</Small>}
            {data.logs.map((l) => (
              <Row key={l.id} style={{ justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: font.text, fontSize: 15, color: colors.ghiaccio }}>
                  {new Date(l.loggedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} · {CONTAINER_LABELS[l.container]}
                </Text>
                <Pressable onPress={() => run(l.id, () => api<HydrationDay>('DELETE', `/me/hydration/${l.id}`))} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Elimina ${CONTAINER_LABELS[l.container]}`}>
                  <Text style={{ fontFamily: font.textSemi, fontSize: 13, color: colors.corallo }}>Elimina</Text>
                </Pressable>
              </Row>
            ))}
          </Card>
          <Small>
            {data.personalized
              ? 'Obiettivo calcolato sul tuo peso, con mezzo litro in più nei giorni di allenamento.'
              : 'Obiettivo standard di 2 litri. Con Premium è calcolato sul tuo peso e sull’attività del giorno.'}
          </Small>
        </>
      )}
    </Screen>
  );
}
