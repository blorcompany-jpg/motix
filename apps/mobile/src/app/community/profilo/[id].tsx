import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import type { ProfileView } from '@motix/shared';
import { PostCard } from '@/components/post';
import { Body, Button, Card, ErrorBox, Eyebrow, H2, Loading, Notice, Row, Screen, Small, Stat, TopBar } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

export default function Profile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data: p, error: loadError, setData, reload } = useApi<ProfileView>(`/community/profiles/${id}`);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const self = user?.id === id;

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      if (ok) setNotice(ok);
    } catch (e) {
      setError(e);
    } finally {
      setBusy('');
    }
  };

  return (
    <Screen>
      <TopBar title="Profilo" onBack={() => router.back()} />
      <ErrorBox error={error ?? loadError} />
      {!p && !loadError && <Loading />}
      {p && (
        <>
          <Eyebrow>{p.role === 'personal_trainer' ? 'Personal trainer' : (p.structure ?? 'Iscritto MOTIX')}</Eyebrow>
          <H2>{p.name}</H2>
          {notice ? <Notice tone="ok">{notice}</Notice> : null}
          {p.private && <Notice>Questo profilo è privato.</Notice>}
          {p.trainer && (
            <Card>
              {p.trainer.specializations.length > 0 && <Small style={{ color: colors.acqua }}>{p.trainer.specializations.join(' · ')}</Small>}
              {p.trainer.bio && <Body style={{ fontSize: 14 }}>{p.trainer.bio}</Body>}
              {user?.role === 'user' && (
                <Button
                  title="Chiedi di seguirmi"
                  loading={busy === 'request'}
                  onPress={() => run('request', () => api('POST', '/me/trainer-links/request', { trainerId: p.trainer!.id }), 'Richiesta inviata: ti avvisiamo quando accetta.')}
                />
              )}
            </Card>
          )}
          {p.stats && (
            <Row style={{ alignItems: 'stretch', gap: 8 }}>
              <Stat value={p.stats.sessions} label="Sedute completate" />
              <Stat value={p.stats.posts} label="Post" />
            </Row>
          )}
          {!self && !p.private && !p.blocked && user?.role === 'user' && p.role === 'user' && (
            <Button
              title="Scrivi un messaggio"
              variant="ghost"
              loading={busy === 'chat'}
              onPress={() => run('chat', async () => { const c = await api<{ id: string }>('POST', '/conversations', { userId: p.id }); router.push(`/messaggi/${c.id}`); })}
            />
          )}
          {p.posts.map((post) => (
            <PostCard key={post.id} post={post} onChange={(x) => setData({ ...p, posts: p.posts.map((y) => (y.id === x.id ? x : y)) })} onRemove={(pid) => setData({ ...p, posts: p.posts.filter((y) => y.id !== pid) })} />
          ))}
          {!self && (
            <Button
              title={p.blocked ? 'Sblocca' : 'Blocca questa persona'}
              variant="text"
              loading={busy === 'block'}
              onPress={() => run('block', async () => { await api(p.blocked ? 'DELETE' : 'PUT', `/community/blocks/${p.id}`); await reload(); })}
            />
          )}
        </>
      )}
    </Screen>
  );
}
