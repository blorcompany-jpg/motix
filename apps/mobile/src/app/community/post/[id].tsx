import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { CommentView, PostView } from '@motix/shared';
import { PostCard, ago } from '@/components/post';
import { Button, Card, ErrorBox, Field, Loading, Row, Screen, Small, TopBar } from '@/components/ui';
import { api } from '@/lib/api';
import { colors, font } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error: loadError, setData, reload } = useApi<{ post: PostView; comments: CommentView[] }>(`/community/posts/${id}/comments`);
  const [text, setText] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('POST', `/community/posts/${id}/comments`, { text });
      setText('');
      await reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <TopBar title="Post" onBack={() => router.back()} />
      <ErrorBox error={error ?? loadError} />
      {!data && !loadError && <Loading />}
      {data && (
        <>
          <PostCard post={data.post} linkToComments={false} onChange={(p) => setData({ ...data, post: p })} onRemove={() => router.back()} />
          <Card>
            <Field label="Scrivi un commento" value={text} onChangeText={setText} maxLength={500} />
            <Button title="Commenta" variant="ghost" onPress={send} loading={busy} disabled={!text.trim()} />
          </Card>
          {data.comments.map((c) => (
            <Card key={c.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Pressable onPress={() => router.push(`/community/profilo/${c.author.id}`)} accessibilityRole="button">
                  <Text style={{ fontFamily: font.displaySemi, fontSize: 14, color: colors.ghiaccio }}>{c.author.name}</Text>
                </Pressable>
                <Small>{ago(c.createdAt)}</Small>
              </Row>
              <Text style={{ fontFamily: font.text, fontSize: 15, lineHeight: 21, color: colors.ghiaccio }}>{c.text}</Text>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                {c.mine ? (
                  <Text accessibilityRole="button" onPress={async () => { await api('DELETE', `/community/comments/${c.id}`); await reload(); }} style={{ fontFamily: font.textSemi, fontSize: 13, color: colors.corallo }}>Elimina</Text>
                ) : (
                  <Text accessibilityRole="button" onPress={async () => { await api('POST', '/community/reports', { targetType: 'comment', targetId: c.id, reason: 'Contenuto offensivo' }); setData({ ...data, comments: data.comments.filter((x) => x.id !== c.id) }); }} style={{ fontFamily: font.textSemi, fontSize: 13, color: colors.nebbia }}>Segnala</Text>
                )}
              </View>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
