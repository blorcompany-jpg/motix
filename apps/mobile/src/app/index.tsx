import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { PRICE_YEARLY_EUR, TRIAL_DAYS, brand, euro } from '@motix/shared';
import { Body, Button, Eyebrow, H1, Logo, Mark, Screen, Small } from '@/components/ui';
import { useAuth } from '@/lib/auth';

/** Benvenuto: prima schermata per chi non ha ancora fatto l'accesso. */
export default function Welcome() {
  const { user } = useAuth();
  if (user) return <Redirect href="/home" />;
  return (
    <Screen
      scroll={false}
      footer={
        <>
          <Button title={`Inizia la prova gratuita di ${TRIAL_DAYS} giorni`} onPress={() => router.push('/register')} />
          <Button title="Ho già un account" variant="ghost" onPress={() => router.push('/login')} />
          <Small style={{ textAlign: 'center', marginTop: 4 }}>
            Dopo la prova {euro(PRICE_YEARLY_EUR)} all’anno, IVA inclusa. Puoi disdire durante la prova.
          </Small>
        </>
      }
    >
      <View style={{ position: 'absolute', right: -110, top: 190, opacity: 0.07 }} pointerEvents="none">
        <Mark size={420} plain />
      </View>
      <Logo />
      <View style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
        <Eyebrow>{brand.payoffIt}</Eyebrow>
        <H1>Ogni ripetizione conta. Adesso la misuri.</H1>
        <Body>Un piano che cambia con te, il sensore che legge ogni movimento, l’acqua giusta al momento giusto e la community della tua palestra.</Body>
      </View>
    </Screen>
  );
}
