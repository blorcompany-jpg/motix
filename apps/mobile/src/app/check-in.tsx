import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { CHECK_IN_SCALE_LABELS, type CheckInScale, type CheckInsResponse } from '@motix/shared';
import { Body, Button, Card, Chip, ChipRow, ErrorBox, Field, H3, Loading, Notice, Row, Screen, Small, TopBar } from '@/components/ui';
import { api, uploadMedia } from '@/lib/api';
import { kg, longDate, shortDate, today } from '@/lib/dates';
import { PremiumCard, isPremiumError } from '@/lib/premium';
import { colors } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

const SCALES = Object.keys(CHECK_IN_SCALE_LABELS) as CheckInScale[];
const decimal = (v: string) => (v.trim() ? Number(v.replace(',', '.')) : undefined);

export default function CheckIn() {
  const { data, error: loadError, setData } = useApi<CheckInsResponse>('/me/check-ins');
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [scores, setScores] = useState<Partial<Record<CheckInScale, number>>>({});
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [sent, setSent] = useState(false);

  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsMultipleSelection: true, selectionLimit: 4 });
    if (!res.canceled) setPhotos(res.assets.slice(0, 4));
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const uploaded = [];
      for (const p of photos) uploaded.push((await uploadMedia(p)).id);
      setData(
        await api<CheckInsResponse>('POST', '/me/check-ins', {
          day: today(),
          weightKg: decimal(weight),
          waistCm: decimal(waist),
          ...scores,
          notes: notes.trim() || undefined,
          photoIds: uploaded,
        }),
      );
      setSent(true);
      setPhotos([]);
      setNotes('');
    } catch (e) {
      if (isPremiumError(e)) setLocked(true);
      else setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <TopBar title="Check-in" onBack={() => router.back()} />
      <ErrorBox error={error ?? loadError} />
      {!data && !loadError && <Loading />}
      {data && (
        <>
          {data.everyDays ? (
            <Notice>
              Il tuo professionista ti chiede un check-in ogni {data.everyDays} giorni.{data.nextDue ? ` Il prossimo: ${data.nextDue <= today() ? 'oggi' : shortDate(data.nextDue)}.` : ''}
            </Notice>
          ) : (
            <Small style={{ color: colors.nebbia }}>Il check-in serve al tuo professionista per seguirti. Puoi inviarlo quando vuoi.</Small>
          )}
          {locked ? (
            <PremiumCard what="Il check-in con il professionista" />
          ) : sent ? (
            <Notice tone="ok">Check-in inviato. Lo trovi qui sotto, con la risposta del professionista quando arriva.</Notice>
          ) : (
            <Card>
              <H3>Check-in di oggi</H3>
              <Row style={{ gap: 8 }}>
                <View style={{ flex: 1 }}><Field label="Peso (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" /></View>
                <View style={{ flex: 1 }}><Field label="Vita (cm)" value={waist} onChangeText={setWaist} keyboardType="decimal-pad" /></View>
              </Row>
              {SCALES.map((k) => (
                <View key={k} style={{ gap: 6 }}>
                  <Small style={{ color: colors.nebbia }}>{CHECK_IN_SCALE_LABELS[k]} (1 = poco, 5 = molto)</Small>
                  <ChipRow>
                    {[1, 2, 3, 4, 5].map((n) => <Chip key={n} label={String(n)} selected={scores[k] === n} onPress={() => setScores({ ...scores, [k]: scores[k] === n ? undefined : n })} />)}
                  </ChipRow>
                </View>
              ))}
              <Field label="Come è andata?" value={notes} onChangeText={setNotes} multiline maxLength={1000} style={{ minHeight: 80, textAlignVertical: 'top' }} />
              <Row style={{ gap: 8, flexWrap: 'wrap' }}>
                {photos.map((p) => <Image key={p.uri} source={{ uri: p.uri }} style={{ width: 64, height: 80, borderRadius: 10 }} />)}
              </Row>
              <Button title={photos.length ? 'Cambia le foto' : 'Aggiungi foto di progresso'} variant="text" inline onPress={pick} />
              <Button title="Invia il check-in" onPress={send} loading={busy} />
            </Card>
          )}

          {data.checkIns.length > 0 && <H3>Check-in inviati</H3>}
          {data.checkIns.map((c) => (
            <Card key={c.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Body style={{ color: colors.ghiaccio }}>{longDate(`${c.day}T12:00:00`)}</Body>
                {c.weightKg !== null && <Small>{kg(c.weightKg)}</Small>}
              </Row>
              {c.notes && <Small style={{ color: colors.nebbia }}>«{c.notes}»</Small>}
              {c.photos.length > 0 && (
                <Row style={{ gap: 8 }}>
                  {c.photos.map((p) => (
                    <Pressable key={p} accessibilityRole="image" accessibilityLabel="Foto di progresso">
                      <Image source={{ uri: p }} style={{ width: 56, height: 70, borderRadius: 8 }} />
                    </Pressable>
                  ))}
                </Row>
              )}
              {c.comment ? (
                <View style={{ borderLeftWidth: 3, borderLeftColor: colors.energia, paddingLeft: 10, gap: 2 }}>
                  <Small style={{ color: colors.energia }}>{c.commentBy}</Small>
                  <Body style={{ fontSize: 14 }}>{c.comment}</Body>
                </View>
              ) : (
                <Small style={{ color: colors.pietra }}>In attesa della risposta del professionista.</Small>
              )}
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
