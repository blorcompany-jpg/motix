import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import type { PostView } from '@motix/shared';
import { PostCard } from '@/components/post';
import { Body, Button, Card, Chip, ChipRow, ErrorBox, Eyebrow, H2, Loading, Notice, Row, Screen, Small } from '@/components/ui';
import { ApiFailure, api, uploadMedia } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, font, radii } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

type Scope = 'structure' | 'global';

export default function Community() {
  const { user } = useAuth();
  const hasStructure = Boolean(user?.structure);
  const [scope, setScope] = useState<Scope>(hasStructure ? 'structure' : 'global');
  const feed = useApi<{ posts: PostView[] }>(`/community/feed?scope=${scope}`);
  const [text, setText] = useState('');
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    setError(null);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.8, videoMaxDuration: 60 });
    if (!res.canceled && res.assets[0]) setAsset(res.assets[0]);
  };

  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      const media = asset ? await uploadMedia(asset) : null;
      const post = await api<PostView>('POST', '/community/posts', { text: text.trim() || undefined, mediaId: media?.id, visibility: scope });
      feed.setData({ posts: [post, ...(feed.data?.posts ?? [])] });
      setText('');
      setAsset(null);
    } catch (e) {
      if (e instanceof ApiFailure && e.code === 'premium_required') router.push('/abbonamento');
      else setError(e);
    } finally {
      setBusy(false);
    }
  };

  const update = (p: PostView) => feed.setData({ posts: (feed.data?.posts ?? []).map((x) => (x.id === p.id ? p : x)) });
  const remove = (id: string) => feed.setData({ posts: (feed.data?.posts ?? []).filter((x) => x.id !== id) });

  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <Eyebrow>{scope === 'structure' ? user?.structure?.displayName : 'Tutti gli iscritti MOTIX'}</Eyebrow>
        <H2>Community</H2>
      </View>
      <ChipRow>
        {hasStructure && <Chip label="La mia struttura" selected={scope === 'structure'} onPress={() => setScope('structure')} />}
        <Chip label="Tutti" selected={scope === 'global'} onPress={() => setScope('global')} />
      </ChipRow>
      <Row style={{ gap: 8 }}>
        {user?.role === 'user' && hasStructure && <View style={{ flex: 1 }}><Button title="Classifica" variant="ghost" onPress={() => router.push('/community/classifica')} /></View>}
        <View style={{ flex: 1 }}><Button title="Trainer" variant="ghost" onPress={() => router.push('/community/trainer')} /></View>
        <View style={{ flex: 1 }}><Button title="Video" variant="ghost" onPress={() => router.push('/community/video')} /></View>
      </Row>

      <Card>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={scope === 'structure' ? 'Racconta il tuo allenamento alla tua palestra' : 'Racconta il tuo allenamento'}
          placeholderTextColor={colors.pietra}
          accessibilityLabel="Testo del post"
          multiline
          maxLength={1000}
          style={{ minHeight: 64, fontFamily: font.text, fontSize: 16, color: colors.ghiaccio, backgroundColor: colors.notte, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.blu, padding: 12, textAlignVertical: 'top' }}
        />
        {asset && (
          <Row style={{ justifyContent: 'space-between' }}>
            <Small style={{ color: colors.energia, flex: 1 }} numberOfLines={1}>{asset.type === 'video' ? 'Video' : 'Foto'} allegato{asset.fileName ? `: ${asset.fileName}` : ''}</Small>
            <Text onPress={() => setAsset(null)} accessibilityRole="button" style={{ fontFamily: font.textSemi, fontSize: 13, color: colors.corallo }}>Togli</Text>
          </Row>
        )}
        <Row style={{ gap: 8 }}>
          <View style={{ flex: 1 }}><Button title="Foto o video" variant="ghost" onPress={pick} /></View>
          <View style={{ flex: 1 }}><Button title="Pubblica" onPress={publish} loading={busy} disabled={!text.trim() && !asset} /></View>
        </Row>
        <Small>{scope === 'structure' ? 'Lo vedono solo gli iscritti della tua struttura.' : 'Lo vedono tutti gli iscritti MOTIX. Serve il profilo visibile.'}</Small>
      </Card>
      <ErrorBox error={error ?? feed.error} />

      {!feed.data && feed.loading && <Loading />}
      {feed.data?.posts.length === 0 && <Notice>Ancora nessun post qui: pubblica il primo.</Notice>}
      {feed.data?.posts.map((p) => <PostCard key={p.id} post={p} onChange={update} onRemove={remove} />)}
      {feed.data && feed.data.posts.length > 0 && <Body style={{ fontSize: 13, textAlign: 'center' }}>Hai visto gli ultimi post.</Body>}
    </Screen>
  );
}
