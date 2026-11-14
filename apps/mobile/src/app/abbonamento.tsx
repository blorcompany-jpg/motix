import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { TRIAL_DAYS, type SubscriptionResponse } from '@motix/shared';
import { Body, Button, Card, ErrorBox, Eyebrow, H2, H3, Loading, Notice, Screen, Small, TopBar } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { longDate } from '@/lib/dates';
import { colors, font } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

const PREMIUM = [
  'Piano personalizzato, con la spiegazione delle scelte',
  'Sensore motix pod e app salute',
  'Storico completo e confronto tra le sedute',
  'Idratazione calcolata su peso e attività, con promemoria',
  'Chat con il personal trainer e video nella community',
];

export default function Abbonamento() {
  const { reload } = useAuth();
  const { data: s, error: loadError, setData } = useApi<SubscriptionResponse>('/me/subscription');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const price = s ? `€${s.priceMonthlyEur.toFixed(2).replace('.', ',')}` : '';

  const act = async (path: string) => {
    setBusy(true);
    setError(null);
    try {
      setData(await api<SubscriptionResponse>('POST', path));
      setConfirm(false);
      await reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <TopBar title="Abbonamento" onBack={() => router.back()} />
      <ErrorBox error={error ?? loadError} />
      {!s && !loadError && <Loading />}
      {s && (
        <>
          {s.status === 'trial' && (
            <Card style={{ borderColor: colors.acqua }}>
              <Eyebrow>Prova gratuita</Eyebrow>
              <Text style={{ fontFamily: font.displayHeavy, fontSize: 44, lineHeight: 48, color: colors.ghiaccio }}>
                {s.trialDaysLeft} <Text style={{ fontSize: 18, fontFamily: font.displaySemi, color: colors.nebbia }}>giorni rimasti su {TRIAL_DAYS}</Text>
              </Text>
              <Body style={{ fontSize: 14 }}>
                {s.cancelled
                  ? `Hai disdetto: resti Premium fino al ${longDate(s.trialEndsAt!)}, poi passi alla versione gratuita. Nessun addebito.`
                  : `Hai tutte le funzioni Premium fino al ${longDate(s.trialEndsAt!)}.`}
              </Body>
            </Card>
          )}
          {s.status === 'active' && (
            <Card style={{ borderColor: colors.energia }}>
              <Eyebrow>Premium attivo</Eyebrow>
              <H2>{s.installmentsPaid} rate pagate su {s.installmentsTotal}</H2>
              {s.commitmentEndsAt && <Body style={{ fontSize: 14 }}>Impegno fino al {longDate(s.commitmentEndsAt)}. L’abbonamento si gestisce dallo store.</Body>}
            </Card>
          )}
          {!s.premium && (
            <Card>
              <Eyebrow>Versione gratuita</Eyebrow>
              <Body style={{ fontSize: 14 }}>La prova è terminata. Restano diario, allenamenti liberi, idratazione di base e community.</Body>
            </Card>
          )}

          <Card>
            <H3>Premium · {price} al mese</H3>
            <Small style={{ color: colors.nebbia }}>IVA inclusa, impegno di {s.installmentsTotal} mesi con pagamento mensile.</Small>
            <View style={{ gap: 6, marginTop: 4 }}>
              {PREMIUM.map((line) => <Body key={line} style={{ fontSize: 14, lineHeight: 20 }}>✓ {line}</Body>)}
            </View>
          </Card>

          <Notice>
            L’abbonamento si attiverà da App Store e Google Play quando l’app sarà pubblicata. Fino ad allora nessuno può esserti addebitato nulla.
          </Notice>

          {s.status === 'trial' && !s.cancelled && !confirm && <Button title="Disdici la prova" variant="text" onPress={() => setConfirm(true)} />}
          {confirm && (
            <Card style={{ borderColor: colors.corallo }}>
              <Body style={{ fontSize: 14 }}>
                Se disdici resti Premium fino alla fine della prova e poi passi alla versione gratuita, senza addebiti. Puoi ripensarci finché la prova è in corso.
              </Body>
              <Button title="Conferma la disdetta" variant="ghost" onPress={() => act('/me/subscription/cancel')} loading={busy} />
              <Button title="Resto in prova" variant="text" onPress={() => setConfirm(false)} />
            </Card>
          )}
          {s.status === 'trial' && s.cancelled && <Button title="Annulla la disdetta" variant="ghost" onPress={() => act('/me/subscription/resume')} loading={busy} />}
        </>
      )}
    </Screen>
  );
}
