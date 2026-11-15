import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { MUSCLE_LABELS, type PlanResponse } from '@motix/shared';
import { Body, Button, Card, ErrorBox, Eyebrow, H2, H3, Loading, Notice, Row, Screen, Small } from '@/components/ui';
import { ApiFailure, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dayLabel, shortDate, today } from '@/lib/dates';
import { colors, font } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

export default function Piano() {
  const { user } = useAuth();
  const plan = useApi<PlanResponse>('/me/plan');
  const [why, setWhy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const p = plan.data?.plan;
  const premium = user?.premium ?? false;

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      plan.setData(await api<PlanResponse>('POST', '/me/plan/generate', { day: today() }));
      setConfirm(false);
    } catch (e) {
      if (e instanceof ApiFailure && e.code === 'premium_required') router.push('/abbonamento');
      else setError(e);
    } finally {
      setBusy(false);
    }
  };

  const open = p?.sessions.filter((s) => !s.completedAt).length ?? 0;
  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <Eyebrow>{p ? `Settimana dal ${shortDate(p.weekStart)}` : 'Piano di allenamento'}</Eyebrow>
        <H2>Il tuo piano</H2>
        {p?.author === 'trainer' && <Small style={{ color: colors.energia }}>Creato da {p.trainerName ?? 'il tuo personal trainer'}</Small>}
      </View>
      <ErrorBox error={error ?? plan.error} />
      {!plan.data && plan.loading && <Loading />}

      {plan.data && !p && (
        <Card>
          <H3>Non hai ancora un piano</H3>
          <Body style={{ fontSize: 14 }}>
            {premium ? 'Lo costruiamo sul tuo questionario: obiettivo, livello, giorni e attrezzi.' : 'Il piano personalizzato è incluso in Premium. Nella versione gratuita puoi fare allenamenti liberi.'}
          </Body>
          <Button title={premium ? 'Genera il piano' : 'Scopri Premium'} onPress={premium ? generate : () => router.push('/abbonamento')} loading={busy} />
        </Card>
      )}

      {p && p.changes.length > 0 && (
        <Card style={{ borderColor: colors.energia }}>
          <H3>Cosa cambia questa settimana</H3>
          {p.changes.map((line, i) => <Body key={i} style={{ fontSize: 14, lineHeight: 21 }}>• {line}</Body>)}
        </Card>
      )}

      {p?.sessions.map((s) => {
        const done = Boolean(s.completedAt);
        return (
          <Pressable
            key={s.id}
            onPress={() => router.push(done ? `/seduta/riepilogo/${s.id}` : `/seduta/${s.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${dayLabel(s.scheduledDate)}, ${s.title}${done ? ', completata' : ''}`}
          >
            <Card style={done ? { opacity: 0.75 } : undefined}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Small style={{ color: done ? colors.energia : colors.acqua, fontFamily: font.textSemi }}>
                  {dayLabel(s.scheduledDate)}{done ? ' · Fatta' : s.startedAt ? ' · In corso' : ''}
                </Small>
                <Small>{s.estimatedMinutes} min</Small>
              </Row>
              <H3>{s.title}</H3>
              <Small style={{ color: colors.nebbia }}>
                {s.exerciseCount} esercizi · {s.muscles.map((m) => MUSCLE_LABELS[m].toLowerCase()).join(', ')}
              </Small>
            </Card>
          </Pressable>
        );
      })}

      {p && p.rationale.length > 0 && (
        <Card>
          <Pressable onPress={() => setWhy(!why)} accessibilityRole="button" accessibilityState={{ expanded: why }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <H3>{p.author === 'trainer' ? 'Nota del tuo personal trainer' : 'Perché questo piano'}</H3>
              <Text style={{ fontFamily: font.display, fontSize: 20, color: colors.acqua }}>{why ? '−' : '+'}</Text>
            </Row>
          </Pressable>
          {why && p.rationale.map((line, i) => <Body key={i} style={{ fontSize: 14, lineHeight: 21 }}>• {line}</Body>)}
        </Card>
      )}

      {p && premium && !confirm && <Button title={p.author === 'trainer' ? 'Sostituisci con un piano automatico' : 'Genera un nuovo piano'} variant="ghost" onPress={() => (open > 0 ? setConfirm(true) : generate())} loading={busy} />}
      {confirm && (
        <Card style={{ borderColor: colors.corallo }}>
          <Body style={{ fontSize: 14 }}>
            Hai ancora {open} {open === 1 ? 'seduta' : 'sedute'} da fare: con il nuovo piano quelle non iniziate vengono sostituite. Le sedute già fatte restano nel diario.
          </Body>
          <Row>
            <View style={{ flex: 1 }}><Button title="Sostituisci" onPress={generate} loading={busy} /></View>
            <View style={{ flex: 1 }}><Button title="Annulla" variant="ghost" onPress={() => setConfirm(false)} /></View>
          </Row>
        </Card>
      )}
      {p && !premium && <Notice>La prova è finita: puoi completare queste sedute, ma per un nuovo piano personalizzato serve Premium.</Notice>}
      <Button title="Allenamento libero" variant="ghost" onPress={() => router.push('/allenamento-libero')} />
      <Button title="Modifica il questionario" variant="text" onPress={() => router.push('/questionario')} />
    </Screen>
  );
}
