import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { MUSCLE_LABELS, ROLE_LABELS, type HomeResponse } from '@motix/shared';
import { Body, Button, Card, ErrorBox, Eyebrow, H2, H3, Loading, Logo, Notice, Pill, Ring, Row, Screen, Small } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dayLabel, liters, today } from '@/lib/dates';
import { colors, font, radii } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

export default function Home() {
  const { user } = useAuth();
  const isUser = user?.role === 'user';
  const day = today();
  const home = useApi<HomeResponse>(isUser ? `/me/home?day=${day}` : null);
  const unread = useApi<{ unread: number }>(isUser ? '/conversations/unread' : null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  if (!isUser)
    return (
      <Screen>
        <Logo size={32} />
        <Eyebrow style={{ marginTop: 8 }}>{ROLE_LABELS[user.role]}</Eyebrow>
        <H2>Ciao {user.firstName}</H2>
        <Notice>L’area per {ROLE_LABELS[user.role].toLowerCase()} è disponibile sul sito MOTIX. Nell’app arriverà con le prossime tappe.</Notice>
      </Screen>
    );

  const h = home.data;
  const addGlass = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/me/hydration', { day, container: 'glass' });
      await home.reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const s = h?.session;
  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Logo size={30} />
        {h?.trialDaysLeft != null && (
          <Pressable onPress={() => router.push('/abbonamento')} accessibilityRole="button" accessibilityLabel="Prova gratuita: gestisci">
            <Pill tone="energia">Prova · {h.trialDaysLeft} {h.trialDaysLeft === 1 ? 'giorno' : 'giorni'}</Pill>
          </Pressable>
        )}
        {h && !h.premium && (
          <Pressable onPress={() => router.push('/abbonamento')} accessibilityRole="button">
            <Pill tone="neutral">Versione gratuita</Pill>
          </Pressable>
        )}
      </Row>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View style={{ gap: 2, flex: 1 }}>
          <Small>{new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</Small>
          <H2>Ciao {user.firstName}</H2>
        </View>
        <Pressable
          onPress={() => router.push('/messaggi')}
          accessibilityRole="button"
          accessibilityLabel={unread.data?.unread ? `Messaggi: ${unread.data.unread} da leggere` : 'Messaggi'}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: radii.pill, borderWidth: 1, borderColor: unread.data?.unread ? colors.acqua : colors.blu }}
        >
          <Text style={{ fontFamily: font.textSemi, fontSize: 14, color: colors.ghiaccio }}>Messaggi</Text>
          {Boolean(unread.data?.unread) && (
            <View style={{ minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.acqua, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
              <Text style={{ fontFamily: font.textSemi, fontSize: 12, color: colors.notte }}>{unread.data!.unread}</Text>
            </View>
          )}
        </Pressable>
      </Row>
      <ErrorBox error={error ?? home.error} />
      {!h && home.loading && <Loading />}

      {h && s && (
        <Pressable onPress={() => router.push(`/seduta/${s.id}`)} accessibilityRole="button" accessibilityLabel={`Apri la seduta ${s.title}`}>
          <LinearGradient colors={[colors.acqua, colors.energia]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radii.lg, padding: 18, gap: 6 }}>
            <Text style={{ fontFamily: font.textSemi, fontSize: 11, letterSpacing: 1.6, color: colors.notte }}>
              {h.sessionIsToday ? 'ALLENAMENTO DI OGGI' : `PROSSIMO ALLENAMENTO · ${dayLabel(s.scheduledDate).toUpperCase()}`}
            </Text>
            <Text style={{ fontFamily: font.display, fontSize: 24, color: colors.notte }}>{s.title}</Text>
            <Text style={{ fontFamily: font.textMedium, fontSize: 14, color: colors.notte }}>
              {s.exerciseCount} esercizi · {s.estimatedMinutes} min · {s.muscles.slice(0, 3).map((m) => MUSCLE_LABELS[m].toLowerCase()).join(', ')}
            </Text>
            <View style={{ backgroundColor: colors.notte, borderRadius: radii.pill, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
              <Text style={{ fontFamily: font.textSemi, fontSize: 15, color: colors.ghiaccio }}>{s.startedAt ? 'Continua' : h.sessionIsToday ? 'Inizia' : 'Apri'}</Text>
            </View>
          </LinearGradient>
        </Pressable>
      )}

      {h && !s && (
        <Card>
          <H3>{h.hasPlan ? 'Per questa settimana hai finito' : 'Nessun piano attivo'}</H3>
          <Body style={{ fontSize: 14 }}>
            {h.hasPlan
              ? 'Hai completato tutte le sedute in programma. Puoi generare il piano della prossima settimana o fare un allenamento libero.'
              : 'Genera il tuo piano personalizzato oppure scegli tu gli esercizi.'}
          </Body>
          <Button title="Vai al piano" variant="ghost" onPress={() => router.push('/piano')} />
        </Card>
      )}

      {h && (
        <Card>
          <Row style={{ gap: 16 }}>
            <Ring value={h.hydration.totalMl} goal={h.hydration.goalMl} size={84} stroke={9}>
              <Text style={{ fontFamily: font.display, fontSize: 16, color: colors.ghiaccio }}>
                {Math.min(999, Math.round((h.hydration.totalMl / h.hydration.goalMl) * 100))}%
              </Text>
            </Ring>
            <View style={{ flex: 1, gap: 2 }}>
              <H3>Idratazione</H3>
              <Body style={{ fontSize: 14 }}>{liters(h.hydration.totalMl)} su {liters(h.hydration.goalMl)}</Body>
            </View>
          </Row>
          <Row>
            <View style={{ flex: 1 }}><Button title="+ Bicchiere" variant="ghost" onPress={addGlass} loading={busy} /></View>
            <View style={{ flex: 1 }}><Button title="Dettagli" variant="text" onPress={() => router.push('/idratazione')} /></View>
          </Row>
        </Card>
      )}

      {h && (
        <Row style={{ alignItems: 'stretch' }}>
          <Card style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.displayHeavy, fontSize: 34, color: colors.energia }}>{h.streakDays}</Text>
            <Small style={{ color: colors.nebbia }}>{h.streakDays === 1 ? 'giorno attivo di fila' : 'giorni attivi di fila'}</Small>
          </Card>
          <Card style={{ flex: 1.6 }}>
            <Eyebrow>Consiglio del giorno</Eyebrow>
            <Small style={{ color: colors.ghiaccio, fontSize: 14, lineHeight: 20 }}>{h.tip}</Small>
          </Card>
        </Row>
      )}
    </Screen>
  );
}
