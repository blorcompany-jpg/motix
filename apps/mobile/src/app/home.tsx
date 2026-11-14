import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { PRICE_MONTHLY_EUR, ROLE_LABELS, TRIAL_DAYS } from '@motix/shared';
import { Body, Button, Card, ErrorBox, Eyebrow, Field, H2, H3, Logo, Notice, Screen, Small } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, font } from '@/lib/theme';

interface TrainerLink {
  id: string;
  status: 'active' | 'requested_by_user' | 'requested_by_trainer';
  firstName: string;
  lastName: string;
}

/**
 * Prima schermata dopo l'accesso. In questa tappa mostra prova, struttura e personal trainer;
 * allenamento del giorno, idratazione e progressi arrivano con la tappa «app utente».
 */
export default function Home() {
  const { user, signOut, reload } = useAuth();
  const [links, setLinks] = useState<TrainerLink[]>([]);
  const [structureCode, setStructureCode] = useState('');
  const [trainerCode, setTrainerCode] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState('');
  const isUser = user?.role === 'user';

  const loadLinks = useCallback(async () => {
    if (!isUser) return;
    try {
      setLinks((await api<{ links: TrainerLink[] }>('GET', '/me/trainer-links')).links);
    } catch (e) {
      setError(e);
    }
  }, [isUser]);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  if (!user) return <Redirect href="/" />;

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      const r = (await fn()) as { links?: TrainerLink[] } | undefined;
      if (r?.links) setLinks(r.links);
      await reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy('');
    }
  };

  const sub = user.subscription;
  const active = links.find((l) => l.status === 'active');
  const invites = links.filter((l) => l.status === 'requested_by_trainer');
  const requests = links.filter((l) => l.status === 'requested_by_user');

  return (
    <Screen footer={<Button title="Esci" variant="text" onPress={() => void signOut()} />}>
      <Logo size={32} />
      <View style={{ gap: 4, marginTop: 8 }}>
        <Eyebrow>{isUser ? 'Benvenuto in MOTIX' : ROLE_LABELS[user.role]}</Eyebrow>
        <H2>Ciao {user.firstName}</H2>
      </View>
      <ErrorBox error={error} />

      {!isUser && (
        <Notice>
          L’area per {ROLE_LABELS[user.role].toLowerCase()} è disponibile sul sito MOTIX. Nell’app arriverà con le prossime tappe.
        </Notice>
      )}

      {isUser && sub?.status === 'trial' && (
        <Card style={{ borderColor: colors.acqua }}>
          <Eyebrow>Prova gratuita</Eyebrow>
          <Text style={{ fontFamily: font.displayHeavy, fontSize: 44, lineHeight: 48, color: colors.ghiaccio }}>
            {sub.trialDaysLeft} <Text style={{ fontSize: 18, fontFamily: font.displaySemi, color: colors.nebbia }}>giorni rimasti su {TRIAL_DAYS}</Text>
          </Text>
          <Small style={{ color: colors.nebbia }}>
            Hai tutte le funzioni Premium fino al {new Date(sub.trialEndsAt!).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}. Poi €
            {PRICE_MONTHLY_EUR.toFixed(2).replace('.', ',')} al mese per 12 mesi, solo se attivi l’abbonamento.
          </Small>
        </Card>
      )}

      {isUser && (
        <Card>
          <H3>La mia struttura</H3>
          {user.structure ? (
            <>
              <Body style={{ color: colors.ghiaccio }}>{user.structure.displayName} · {user.structure.city}</Body>
              <Button title="Lascia la struttura" variant="text" inline loading={busy === 'leave'} onPress={() => run('leave', () => api('DELETE', '/me/structure'))} />
            </>
          ) : (
            <>
              <Small style={{ color: colors.nebbia }}>Inserisci il codice che trovi in palestra, anche sul QR.</Small>
              <Field label="Codice della struttura" value={structureCode} onChangeText={setStructureCode} autoCapitalize="characters" autoCorrect={false} placeholder="MX…" />
              <Button
                title="Collega la struttura"
                variant="ghost"
                loading={busy === 'join'}
                disabled={structureCode.trim().length < 4}
                onPress={() => run('join', () => api('PUT', '/me/structure', { code: structureCode.trim() }).then(() => setStructureCode('')))}
              />
            </>
          )}
        </Card>
      )}

      {isUser && (
        <Card>
          <H3>Il mio personal trainer</H3>
          {active && (
            <>
              <Body style={{ color: colors.ghiaccio }}>{active.firstName} {active.lastName}</Body>
              <Button title="Chiudi il collegamento" variant="text" inline loading={busy === active.id} onPress={() => run(active.id, () => api('POST', `/me/trainer-links/${active.id}/close`))} />
            </>
          )}
          {invites.map((l) => (
            <View key={l.id} style={{ gap: 8 }}>
              <Body>{l.firstName} {l.lastName} vuole seguirti come personal trainer.</Body>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Button title="Accetta" loading={busy === l.id} onPress={() => run(l.id, () => api('POST', `/me/trainer-links/${l.id}/accept`))} /></View>
                <View style={{ flex: 1 }}><Button title="Rifiuta" variant="ghost" onPress={() => run(l.id, () => api('POST', `/me/trainer-links/${l.id}/decline`))} /></View>
              </View>
            </View>
          ))}
          {requests.map((l) => (
            <Small key={l.id} style={{ color: colors.nebbia }}>Richiesta inviata a {l.firstName} {l.lastName}: in attesa di risposta.</Small>
          ))}
          {!active && (
            <>
              <Small style={{ color: colors.nebbia }}>Hai un codice dal tuo personal trainer? Inseriscilo per collegarti.</Small>
              <Field label="Codice del personal trainer" value={trainerCode} onChangeText={setTrainerCode} autoCapitalize="characters" autoCorrect={false} placeholder="PT…" />
              <Button
                title="Collega il personal trainer"
                variant="ghost"
                loading={busy === 'pt'}
                disabled={trainerCode.trim().length < 4}
                onPress={() => run('pt', () => api('POST', '/me/trainer-links', { code: trainerCode.trim() }).then((r) => (setTrainerCode(''), r)))}
              />
            </>
          )}
        </Card>
      )}

      {isUser && user.referralCode && (
        <Card>
          <H3>Invita un amico</H3>
          <Small style={{ color: colors.nebbia }}>Un mese gratis per ogni amico che si abbona con il tuo codice.</Small>
          <Text style={{ fontFamily: font.display, fontSize: 24, letterSpacing: 2, color: colors.energia }}>{user.referralCode}</Text>
        </Card>
      )}
    </Screen>
  );
}
