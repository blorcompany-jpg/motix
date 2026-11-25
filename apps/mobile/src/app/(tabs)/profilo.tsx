import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { CONSENT_LABELS, PROFESSION_LABELS, ROLE_LABELS, type ConsentType, type Profession } from '@motix/shared';
import { Body, Button, Card, Checkbox, ErrorBox, Eyebrow, Field, H2, H3, Pill, Row, Screen, Small } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, font } from '@/lib/theme';

interface TrainerLink {
  id: string;
  trainerUserId: string;
  status: 'active' | 'requested_by_user' | 'requested_by_trainer';
  firstName: string;
  lastName: string;
  profession: Profession;
}

const OPTIONAL_CONSENTS: ConsentType[] = ['share_structure', 'share_trainer', 'marketing'];

export default function Profilo() {
  const { user, signOut, reload } = useAuth();
  const [links, setLinks] = useState<TrainerLink[]>([]);
  const [structureCode, setStructureCode] = useState('');
  const [trainerCode, setTrainerCode] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState('');
  const [deleting, setDeleting] = useState(false);
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

  if (!user) return null;

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

  const actives = links.filter((l) => l.status === 'active');
  const invites = links.filter((l) => l.status === 'requested_by_trainer');
  const requests = links.filter((l) => l.status === 'requested_by_user');
  const sub = user.subscription;

  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <Eyebrow>{ROLE_LABELS[user.role]}</Eyebrow>
        <H2>{user.firstName} {user.lastName}</H2>
        <Small style={{ color: colors.nebbia }}>{user.email}</Small>
      </View>
      <ErrorBox error={error} />

      {isUser && (
        <Pressable onPress={() => router.push('/abbonamento')} accessibilityRole="button" accessibilityLabel="Gestisci l’abbonamento">
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <H3>Abbonamento</H3>
              <Pill tone={user.premium ? 'energia' : 'neutral'}>
                {sub?.status === 'trial' ? `Prova · ${sub.trialDaysLeft} ${sub.trialDaysLeft === 1 ? 'giorno' : 'giorni'}` : user.premium ? 'Premium' : 'Gratuita'}
              </Pill>
            </Row>
            <Small style={{ color: colors.acqua }}>Gestisci ›</Small>
          </Card>
        </Pressable>
      )}

      {isUser && (
        <Card>
          <H3>Il mio piano</H3>
          <Small style={{ color: colors.nebbia }}>Obiettivo, livello, giorni, attrezzi e limitazioni da cui nasce il piano.</Small>
          <Button title="Modifica il questionario" variant="text" inline onPress={() => router.push('/questionario')} />
        </Card>
      )}

      {isUser && (
        <Pressable onPress={() => router.push('/sensore')} accessibilityRole="button" accessibilityLabel="Sensore motix pod">
          <Card>
            <H3>Sensore motix pod</H3>
            <Small style={{ color: colors.nebbia }}>Conta le ripetizioni e misura velocità e regolarità.</Small>
            <Small style={{ color: colors.acqua }}>Abbina o gestisci ›</Small>
          </Card>
        </Pressable>
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
          <H3>I miei professionisti</H3>
          {actives.map((a) => (
            <View key={a.id} style={{ gap: 4 }}>
              <Body style={{ color: colors.ghiaccio }}>{a.firstName} {a.lastName}</Body>
              <Small style={{ color: colors.nebbia }}>{PROFESSION_LABELS[a.profession]}</Small>
              <Row style={{ gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Scrivi"
                    variant="ghost"
                    loading={busy === `chat-${a.id}`}
                    onPress={() =>
                      run(`chat-${a.id}`, async () => {
                        const c = await api<{ id: string }>('POST', '/conversations', { userId: a.trainerUserId });
                        router.push(`/messaggi/${c.id}`);
                      })
                    }
                  />
                </View>
                <View style={{ flex: 1 }}><Button title="Chiudi" variant="text" loading={busy === a.id} onPress={() => run(a.id, () => api('POST', `/me/trainer-links/${a.id}/close`))} /></View>
              </Row>
            </View>
          ))}
          {invites.map((l) => (
            <View key={l.id} style={{ gap: 8 }}>
              <Body>{l.firstName} {l.lastName} ({PROFESSION_LABELS[l.profession].toLowerCase()}) vuole seguirti.</Body>
              <Row style={{ gap: 8 }}>
                <View style={{ flex: 1 }}><Button title="Accetta" loading={busy === l.id} onPress={() => run(l.id, () => api('POST', `/me/trainer-links/${l.id}/accept`))} /></View>
                <View style={{ flex: 1 }}><Button title="Rifiuta" variant="ghost" onPress={() => run(l.id, () => api('POST', `/me/trainer-links/${l.id}/decline`))} /></View>
              </Row>
            </View>
          ))}
          {requests.map((l) => (
            <Small key={l.id} style={{ color: colors.nebbia }}>Richiesta inviata a {l.firstName} {l.lastName}: in attesa di risposta.</Small>
          ))}
          {!actives.length && <Small style={{ color: colors.nebbia }}>Puoi avere un professionista per l’allenamento e un nutrizionista. Senza professionista il piano lo crea l’AI.</Small>}
          <Button title="Trova un professionista" variant="ghost" onPress={() => router.push('/professionisti')} />
          <Field label="Hai un codice di invito?" value={trainerCode} onChangeText={setTrainerCode} autoCapitalize="characters" autoCorrect={false} placeholder="PT…" />
          <Button
            title="Collegati con il codice"
            variant="text"
            inline
            loading={busy === 'pt'}
            disabled={trainerCode.trim().length < 4}
            onPress={() => run('pt', () => api('POST', '/me/trainer-links', { code: trainerCode.trim() }).then((r) => (setTrainerCode(''), r)))}
          />
        </Card>
      )}

      {isUser && (
        <Card>
          <H3>Strumenti</H3>
          {[
            ['/check-in', 'Check-in', 'Peso, misure, foto e come ti senti, per il tuo professionista'],
            ['/alimentazione', 'Alimentazione', 'Piano del nutrizionista e diario alimentare'],
            ['/carichi', 'I miei carichi', 'Record e progressi esercizio per esercizio'],
            ['/salute', 'App salute', 'Passi, sonno e battito da Apple Salute o Health Connect'],
          ].map(([href, title, hint]) => (
            <Pressable key={href} onPress={() => router.push(href as '/check-in')} accessibilityRole="button" accessibilityLabel={title} style={{ paddingVertical: 6 }}>
              <Text style={{ fontFamily: font.textSemi, fontSize: 15, color: colors.ghiaccio }}>{title} ›</Text>
              <Small style={{ color: colors.nebbia }}>{hint}</Small>
            </Pressable>
          ))}
        </Card>
      )}

      {isUser && (
        <Card>
          <H3>Privacy e consensi</H3>
          <Small style={{ color: colors.nebbia }}>Struttura e personal trainer vedono i tuoi dati solo se lo consenti qui. Puoi cambiare idea quando vuoi.</Small>
          {OPTIONAL_CONSENTS.map((type) => (
            <Checkbox key={type} checked={user.consents[type]} onChange={(v) => run(type, () => api('PATCH', '/me/consents', { [type]: v }))}>
              {CONSENT_LABELS[type]}
            </Checkbox>
          ))}
          <Checkbox
            checked={user.profileVisibility === 'public'}
            onChange={(v) => run('visibility', () => api('PATCH', '/me', { profileVisibility: v ? 'public' : 'private' }))}
          >
            Profilo visibile nella community
          </Checkbox>
        </Card>
      )}

      {isUser && user.referralCode && (
        <Card>
          <H3>Invita un amico</H3>
          <Small style={{ color: colors.nebbia }}>Un mese gratis per ogni amico che si abbona con il tuo codice.</Small>
          <Text selectable style={{ fontFamily: font.display, fontSize: 24, letterSpacing: 2, color: colors.energia }}>{user.referralCode}</Text>
        </Card>
      )}

      <Button title="Esci" variant="ghost" onPress={() => void signOut()} />
      {!deleting ? (
        <Button title="Cancella il mio account" variant="text" onPress={() => setDeleting(true)} />
      ) : (
        <Card style={{ borderColor: colors.corallo }}>
          <Body style={{ fontSize: 14 }}>Cancelliamo l’account e tutti i tuoi dati: allenamenti, misure, idratazione e collegamenti. Non si può annullare.</Body>
          <Button title="Sì, cancella tutto" variant="ghost" loading={busy === 'delete'} onPress={() => run('delete', async () => { await api('DELETE', '/me'); await signOut(); })} />
          <Button title="Annulla" variant="text" onPress={() => setDeleting(false)} />
        </Card>
      )}
    </Screen>
  );
}
