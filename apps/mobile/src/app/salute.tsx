import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { HEALTH_SOURCE_LABELS, type HealthDay } from '@motix/shared';
import { Bars, Body, Button, Card, ErrorBox, Field, H3, Loading, Notice, Row, Screen, Small, TopBar } from '@/components/ui';
import { api } from '@/lib/api';
import { shortDate, today } from '@/lib/dates';
import { PremiumCard, isPremiumError } from '@/lib/premium';
import { colors } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

/**
 * Dati delle app salute. Il collegamento automatico con Apple Salute (HealthKit) e Health Connect richiede
 * un modulo nativo e una build di sviluppo: TODO prima del lancio. Fino ad allora i dati del giorno si inseriscono a mano,
 * e l'API (POST /me/health) è già pronta a ricevere quelli letti dal telefono.
 */
export default function Salute() {
  const { data, error: loadError, setData } = useApi<{ days: HealthDay[] }>('/me/health');
  const [steps, setSteps] = useState('');
  const [sleep, setSleep] = useState('');
  const [hr, setHr] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const int = (v: string) => (v.trim() ? Math.round(Number(v.replace(',', '.'))) : undefined);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const hours = sleep.trim() ? Number(sleep.replace(',', '.')) : undefined;
      setData(await api('POST', '/me/health', { source: 'manual', days: [{ day: today(), steps: int(steps), sleepMinutes: hours === undefined ? undefined : Math.round(hours * 60), restingHr: int(hr) }] }));
      setSteps('');
      setSleep('');
      setHr('');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const days = data?.days ?? [];
  return (
    <Screen>
      <TopBar title="App salute" onBack={() => router.back()} />
      <ErrorBox error={loadError ?? (isPremiumError(error) ? null : error)} />
      {!data && !loadError && <Loading />}
      <Notice>
        Con l’app pubblicata MOTIX leggerà da solo passi, sonno e battito da Apple Salute e Health Connect, con il tuo permesso. Il tuo professionista li vede solo se condividi i dati con lui.
      </Notice>
      {data && days.length > 0 && (
        <Card>
          <H3>Passi</H3>
          <Bars data={days.map((d) => ({ label: shortDate(d.day), value: d.steps ?? 0 }))} />
          {[...days].reverse().slice(0, 7).map((d) => (
            <Small key={d.day} style={{ color: colors.nebbia }}>
              {shortDate(d.day)} · {d.steps?.toLocaleString('it-IT') ?? '—'} passi
              {d.sleepMinutes !== null ? ` · sonno ${Math.floor(d.sleepMinutes / 60)} h ${d.sleepMinutes % 60} min` : ''}
              {d.restingHr !== null ? ` · ${d.restingHr} bpm` : ''} · {HEALTH_SOURCE_LABELS[d.source]}
            </Small>
          ))}
        </Card>
      )}
      {isPremiumError(error) ? (
        <PremiumCard what="Il collegamento con le app salute" />
      ) : (
        <Card>
          <H3>Inserisci i dati di oggi</H3>
          <Body style={{ fontSize: 14 }}>Intanto puoi scriverli a mano.</Body>
          <Row style={{ gap: 8 }}>
            <View style={{ flex: 1 }}><Field label="Passi" value={steps} onChangeText={setSteps} keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><Field label="Sonno (ore)" value={sleep} onChangeText={setSleep} keyboardType="decimal-pad" /></View>
            <View style={{ flex: 1 }}><Field label="Battito" value={hr} onChangeText={setHr} keyboardType="number-pad" /></View>
          </Row>
          <Button title="Salva" variant="ghost" onPress={save} loading={busy} disabled={!steps && !sleep && !hr} />
        </Card>
      )}
    </Screen>
  );
}
