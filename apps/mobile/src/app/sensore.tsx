import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import type { SensorsResponse, SensorView } from '@motix/shared';
import { Body, Button, Card, ErrorBox, Field, H3, Loading, Notice, Pill, Row, Screen, Small, TopBar } from '@/components/ui';
import { api } from '@/lib/api';
import { shortDate } from '@/lib/dates';
import { pod, type PodInfo } from '@/lib/pod';
import { colors, font } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

export default function Sensore() {
  const { data, error: loadError, setData } = useApi<SensorsResponse>('/me/sensors');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState('');
  const [found, setFound] = useState<PodInfo[] | null>(null);
  const [serial, setSerial] = useState('');
  const [issueFor, setIssueFor] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy('');
    }
  };

  const pair = (value: string) =>
    run(`pair-${value}`, async () => {
      setData(await api<SensorsResponse>('POST', '/me/sensors/pair', { serial: value }));
      setFound(null);
      setSerial('');
    });

  const paired = (s: string) => data?.sensors.some((x) => x.serial === s) ?? false;

  return (
    <Screen>
      <TopBar title="Sensore motix pod" onBack={() => router.back()} />
      <Body style={{ fontSize: 14, lineHeight: 21 }}>
        Si fissa al macchinario o all’attrezzo e conta le ripetizioni al posto tuo. Misura anche velocità e regolarità del movimento, che ritrovi nel riepilogo della seduta.
      </Body>
      <ErrorBox error={error ?? loadError} />
      {!data && !loadError && <Loading />}

      {data && !data.premium && (
        <Card style={{ borderColor: colors.energia }}>
          <H3>Incluso in Premium</H3>
          <Body style={{ fontSize: 14 }}>Con la versione gratuita registri le serie a mano. Il sensore si usa con Premium.</Body>
          <Button title="Scopri Premium" onPress={() => router.push('/abbonamento')} />
        </Card>
      )}

      {data?.sensors.map((s: SensorView) => (
        <Card key={s.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text selectable style={{ fontFamily: font.displaySemi, fontSize: 18, color: colors.ghiaccio }}>{s.serial}</Text>
            <Pill tone={s.owner === 'mine' ? 'energia' : 'acqua'}>{s.owner === 'mine' ? 'Tuo' : 'Della struttura'}</Pill>
          </Row>
          <Small style={{ color: colors.nebbia }}>
            {s.batteryPct !== null ? `Batteria ${s.batteryPct}%` : 'Batteria non ancora letta'}
            {s.firmware ? ` · firmware ${s.firmware}` : ''}
            {s.lastSeenAt ? ` · usato il ${shortDate(s.lastSeenAt.slice(0, 10))}` : ' · mai usato'}
          </Small>
          {issueFor === s.id ? (
            <View style={{ gap: 8 }}>
              <Field label="Cosa non funziona?" value={note} onChangeText={setNote} multiline maxLength={500} />
              <Row style={{ gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Invia"
                    loading={busy === 'issue'}
                    disabled={note.trim().length < 5}
                    onPress={() =>
                      run('issue', async () => {
                        await api('POST', `/me/sensors/${s.id}/issues`, { note: note.trim() });
                        setIssueFor(null);
                        setNote('');
                        setSent(true);
                      })
                    }
                  />
                </View>
                <View style={{ flex: 1 }}><Button title="Annulla" variant="ghost" onPress={() => setIssueFor(null)} /></View>
              </Row>
            </View>
          ) : (
            <Row style={{ gap: 16 }}>
              <Button title="Segnala un guasto" variant="text" inline onPress={() => { setIssueFor(s.id); setSent(false); }} />
              {s.owner === 'mine' && (
                <Button title="Scollega" variant="text" inline loading={busy === s.id} onPress={() => run(s.id, async () => setData(await api<SensorsResponse>('DELETE', `/me/sensors/${s.id}`)))} />
              )}
            </Row>
          )}
        </Card>
      ))}
      {sent && <Notice tone="ok">Segnalazione inviata al team BTECH.</Notice>}
      {data && data.sensors.length === 0 && data.premium && <Small style={{ color: colors.nebbia }}>Non hai ancora un sensore abbinato.</Small>}

      {data?.premium && (
        <Card>
          <H3>Abbina un sensore</H3>
          {pod.available ? (
            <>
              <Small style={{ color: colors.nebbia }}>Accendi il sensore e tienilo vicino al telefono.</Small>
              <Button title="Cerca sensori vicini" variant="ghost" loading={busy === 'scan'} onPress={() => run('scan', async () => setFound(await pod.scan()))} />
              {found?.length === 0 && <Small>Nessun sensore trovato: controlla che sia acceso e carico.</Small>}
              {found?.map((p) => (
                <Row key={p.serial} style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: font.textSemi, fontSize: 15, color: colors.ghiaccio }}>{p.serial}</Text>
                    <Small style={{ color: colors.nebbia }}>{p.name}{p.batteryPct !== null ? ` · ${p.batteryPct}%` : ''}</Small>
                  </View>
                  {paired(p.serial) ? <Pill tone="energia">Abbinato</Pill> : <Button title="Abbina" inline loading={busy === `pair-${p.serial}`} onPress={() => pair(p.serial)} />}
                </Row>
              ))}
            </>
          ) : (
            <Notice>Su questa versione dell’app la ricerca via Bluetooth non è ancora attiva: abbina il sensore con il numero di serie.</Notice>
          )}
          <Field label="Numero di serie" hint="È scritto sul sensore: MP- seguito da lettere e cifre." value={serial} onChangeText={setSerial} autoCapitalize="characters" autoCorrect={false} placeholder="MP-…" maxLength={15} />
          <Button title="Abbina con il numero di serie" variant="ghost" disabled={serial.trim().length < 9} loading={busy === `pair-${serial.trim()}`} onPress={() => pair(serial.trim())} />
        </Card>
      )}

      <Button title="Non hai un sensore? Lo trovi nello Shop" variant="text" onPress={() => router.push('/shop')} />
    </Screen>
  );
}
