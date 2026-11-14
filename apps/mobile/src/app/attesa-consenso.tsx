import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Body, Button, ErrorBox, Field, H2, Logo, Notice, Screen } from '@/components/ui';
import { api } from '@/lib/api';

/** Tra 14 e 17 anni l'account si attiva quando un genitore dà il consenso dal link ricevuto per email. */
export default function WaitingForParent() {
  const params = useLocalSearchParams<{ email?: string; parentEmail?: string }>();
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const resend = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/auth/parental-consent/resend', { email: params.email, password });
      setSent(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button title="Ho il consenso: accedi" onPress={() => router.replace('/login')} />}>
      <Logo size={36} />
      <H2 style={{ marginTop: 24 }}>Manca solo il consenso di un genitore</H2>
      <Body>
        Abbiamo scritto {params.parentEmail ? `a ${params.parentEmail}` : 'al genitore che hai indicato'}. Appena apre il link e dà il consenso, il tuo account si
        attiva e parte la prova gratuita.
      </Body>
      {sent ? (
        <Notice tone="ok">Email inviata di nuovo.</Notice>
      ) : (
        <>
          <ErrorBox error={error} />
          <Field label="Per inviare di nuovo l’email, inserisci la tua password" value={password} onChangeText={setPassword} secureTextEntry />
          <Button title="Invia di nuovo l’email al genitore" variant="ghost" onPress={resend} loading={busy} disabled={!password || !params.email} />
        </>
      )}
    </Screen>
  );
}
