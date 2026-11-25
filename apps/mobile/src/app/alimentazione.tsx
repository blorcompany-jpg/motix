import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { MEALS, MEAL_LABELS, type Food, type FoodDiaryDay, type Macros, type Meal, type MealPlanView } from '@motix/shared';
import { Body, Button, Card, Chip, ChipRow, ErrorBox, Field, H3, HBar, Loading, Row, Screen, Small, TopBar } from '@/components/ui';
import { api } from '@/lib/api';
import { today } from '@/lib/dates';
import { PremiumCard, isPremiumError } from '@/lib/premium';
import { colors, font } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

const macroLine = (m: Macros) => `${Math.round(m.kcal)} kcal · P ${Math.round(m.protein)} · C ${Math.round(m.carbs)} · G ${Math.round(m.fat)}`;

export default function Alimentazione() {
  const day = today();
  const plan = useApi<{ plan: MealPlanView | null }>('/me/meal-plan');
  const diary = useApi<FoodDiaryDay>(`/me/food-diary?day=${day}`);
  const [tab, setTab] = useState<'plan' | 'diary'>('plan');
  const [dayIndex, setDayIndex] = useState(0);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [picked, setPicked] = useState<Food | null>(null);
  const [grams, setGrams] = useState('100');
  const [meal, setMeal] = useState<Meal>('lunch');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => {
      api<{ foods: Food[] }>('GET', `/foods?q=${encodeURIComponent(q.trim())}`).then((r) => setResults(r.foods.slice(0, 8)), setError);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const locked = isPremiumError(plan.error) || isPremiumError(diary.error);
  const add = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      diary.setData(await api<FoodDiaryDay>('POST', '/me/food-diary', { day, meal, foodId: picked.id, grams: Number(grams.replace(',', '.')) || 0 }));
      setPicked(null);
      setQ('');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const p = plan.data?.plan;
  const d = diary.data;
  return (
    <Screen>
      <TopBar title="Alimentazione" onBack={() => router.back()} />
      {locked ? (
        <PremiumCard what="Il piano alimentare del nutrizionista, con il diario," />
      ) : (
        <>
          <ErrorBox error={error ?? plan.error ?? diary.error} />
          <ChipRow>
            <Chip label="Il mio piano" selected={tab === 'plan'} onPress={() => setTab('plan')} />
            <Chip label="Diario di oggi" selected={tab === 'diary'} onPress={() => setTab('diary')} />
          </ChipRow>

          {tab === 'plan' && !plan.data && <Loading />}
          {tab === 'plan' && plan.data && !p && (
            <Card>
              <H3>Nessun piano alimentare</H3>
              <Small style={{ color: colors.nebbia }}>Il piano alimentare lo prepara un nutrizionista iscritto all’albo. Puoi trovarne uno nella vetrina dei professionisti.</Small>
              <Button title="Trova un nutrizionista" variant="ghost" onPress={() => router.push('/professionisti')} />
            </Card>
          )}
          {tab === 'plan' && p && (
            <>
              <Card>
                <H3>{p.title}</H3>
                <Small style={{ color: colors.nebbia }}>Di {p.nutritionist}</Small>
                {p.notes && <Body style={{ fontSize: 14 }}>{p.notes}</Body>}
              </Card>
              {p.days.length > 1 && (
                <ChipRow>
                  {p.days.map((x, i) => <Chip key={x.name} label={x.name} selected={i === dayIndex} onPress={() => setDayIndex(i)} />)}
                </ChipRow>
              )}
              {p.days[dayIndex] && (
                <>
                  <Small style={{ color: colors.acqua }}>{macroLine(p.days[dayIndex]!.totals)}</Small>
                  {p.days[dayIndex]!.meals.map((m) => (
                    <Card key={m.meal}>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <H3>{MEAL_LABELS[m.meal]}</H3>
                        {m.time && <Small>{m.time}</Small>}
                      </Row>
                      {m.items.map((i) => <Body key={i.foodId} style={{ fontSize: 15 }}>{i.name} · {i.grams} g</Body>)}
                      <Small style={{ color: colors.nebbia }}>{macroLine(m.totals)}</Small>
                      {m.alternatives.map((a, k) => (
                        <View key={k} style={{ borderLeftWidth: 3, borderLeftColor: colors.acqua, paddingLeft: 10, marginTop: 4 }}>
                          <Small style={{ color: colors.acqua }}>Oppure</Small>
                          <Small>{a.items.map((i) => `${i.name} ${i.grams} g`).join(', ')}</Small>
                        </View>
                      ))}
                    </Card>
                  ))}
                </>
              )}
            </>
          )}

          {tab === 'diary' && !d && <Loading />}
          {tab === 'diary' && d && (
            <>
              <Card>
                <H3>Oggi</H3>
                <Text style={{ fontFamily: font.displayHeavy, fontSize: 32, color: colors.ghiaccio }}>
                  {d.totals.kcal} <Text style={{ fontSize: 15, color: colors.nebbia }}>kcal{d.target ? ` su ${d.target.kcal}` : ''}</Text>
                </Text>
                {d.target ? (
                  <>
                    <HBar label="Proteine" value={Math.round(d.totals.protein)} max={d.target.protein} suffix={`g su ${Math.round(d.target.protein)} g`} />
                    <HBar label="Carboidrati" value={Math.round(d.totals.carbs)} max={d.target.carbs} suffix={`g su ${Math.round(d.target.carbs)} g`} />
                    <HBar label="Grassi" value={Math.round(d.totals.fat)} max={d.target.fat} suffix={`g su ${Math.round(d.target.fat)} g`} />
                  </>
                ) : (
                  <Small style={{ color: colors.nebbia }}>{macroLine(d.totals)}</Small>
                )}
              </Card>
              {MEALS.filter((m) => d.entries.some((e) => e.meal === m)).map((m) => (
                <Card key={m}>
                  <H3>{MEAL_LABELS[m]}</H3>
                  {d.entries.filter((e) => e.meal === m).map((e) => (
                    <Row key={e.id} style={{ justifyContent: 'space-between' }}>
                      <Body style={{ fontSize: 15, flex: 1 }}>{e.name} · {e.grams} g · {e.macros.kcal} kcal</Body>
                      <Pressable onPress={() => api<FoodDiaryDay>('DELETE', `/me/food-diary/${e.id}`).then(diary.setData, setError)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Elimina ${e.name}`}>
                        <Text style={{ fontFamily: font.textSemi, fontSize: 13, color: colors.corallo }}>Elimina</Text>
                      </Pressable>
                    </Row>
                  ))}
                </Card>
              ))}
              <Card>
                <H3>Aggiungi</H3>
                <ChipRow>
                  {MEALS.map((m) => <Chip key={m} label={MEAL_LABELS[m]} selected={meal === m} onPress={() => setMeal(m)} />)}
                </ChipRow>
                {picked ? (
                  <>
                    <Body style={{ color: colors.ghiaccio }}>{picked.name}</Body>
                    <Field label="Grammi" value={grams} onChangeText={setGrams} keyboardType="decimal-pad" />
                    <Row style={{ gap: 8 }}>
                      <View style={{ flex: 1 }}><Button title="Aggiungi" onPress={add} loading={busy} /></View>
                      <View style={{ flex: 1 }}><Button title="Cambia" variant="ghost" onPress={() => setPicked(null)} /></View>
                    </Row>
                  </>
                ) : (
                  <>
                    <Field label="Cerca un alimento" value={q} onChangeText={setQ} placeholder="Es. pollo, riso, yogurt" autoCorrect={false} />
                    {results.map((f) => (
                      <Pressable key={f.id} onPress={() => setPicked(f)} accessibilityRole="button" accessibilityLabel={f.name} style={{ paddingVertical: 8 }}>
                        <Text style={{ fontFamily: font.textSemi, fontSize: 15, color: colors.ghiaccio }}>{f.name}</Text>
                        <Small style={{ color: colors.nebbia }}>{f.kcal} kcal ogni 100 g</Small>
                      </Pressable>
                    ))}
                  </>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
