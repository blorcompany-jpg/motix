import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import type { AuthResponse } from '@motix/shared';
import { Body, Button, ErrorBox, Field, H2, Logo, Screen } from '@/components/ui';
import { ApiFailure, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Login() {
  const { user, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Redirect href="/home" />;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(await api<AuthResponse>('POST', '/auth/login', { email, password }));
      router.replace('/home');
    } catch (e) {
      if (e instanceof ApiFailure && e.code === 'parental_consent_pending')
        router.replace({ pathname: '/attesa-consenso', params: { email } });
      else setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button title="Non ho un account: registrami" variant="text" onPress={() => router.replace('/register')} />}>
      <Logo size={36} />
      <H2 style={{ marginTop: 24 }}>Bentornato</H2>
      <Body>Accedi per riprendere da dove eri rimasto.</Body>
      <ErrorBox error={error} />
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={submit} />
      <Button title="Accedi" onPress={submit} loading={busy} disabled={!email || !password} />
    </Screen>
  );
}
