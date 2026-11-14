import { Text } from 'react-native';
import { router } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import type { TrainerVideoView } from '@motix/shared';
import { Card, ErrorBox, H3, Loading, Notice, Screen, Small, TopBar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors, font, radii } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

function Clip({ v }: { v: TrainerVideoView }) {
  const player = useVideoPlayer(v.url);
  return (
    <Card>
      <Text style={{ fontFamily: font.displaySemi, fontSize: 16, color: colors.ghiaccio }}>{v.title}</Text>
      <Small style={{ color: colors.acqua }}>{[v.trainerName, v.exercise].filter(Boolean).join(' · ')}</Small>
      <VideoView player={player} nativeControls contentFit="contain" style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radii.md, backgroundColor: '#000' }} />
    </Card>
  );
}

/** Video degli esercizi: quelli del proprio personal trainer e quelli pubblicati per tutta la community. */
export default function Videos() {
  const { user } = useAuth();
  const mine = useApi<{ videos: TrainerVideoView[] }>(user?.role === 'user' ? '/me/trainer-videos' : null);
  const all = useApi<{ videos: TrainerVideoView[] }>('/community/trainer-videos');
  const mineIds = new Set(mine.data?.videos.map((v) => v.id));
  const others = all.data?.videos.filter((v) => !mineIds.has(v.id)) ?? [];
  return (
    <Screen>
      <TopBar title="Video dei personal trainer" onBack={() => router.back()} />
      <ErrorBox error={mine.error ?? all.error} />
      {!all.data && !all.error && <Loading />}
      {Boolean(mine.data?.videos.length) && <H3>Dal tuo personal trainer</H3>}
      {mine.data?.videos.map((v) => <Clip key={v.id} v={v} />)}
      {others.length > 0 && <H3>Dalla community</H3>}
      {others.map((v) => <Clip key={v.id} v={v} />)}
      {all.data && others.length === 0 && !mine.data?.videos.length && <Notice>Ancora nessun video. I personal trainer li caricano dalla loro area.</Notice>}
    </Screen>
  );
}
