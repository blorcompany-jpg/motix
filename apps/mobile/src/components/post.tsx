import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { REPORT_REASONS, type PostView } from '@motix/shared';
import { api } from '@/lib/api';
import { colors, font, radii } from '@/lib/theme';
import { Card, Chip, ChipRow, Row, Small } from './ui';

export function ago(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 1) return 'adesso';
  if (min < 60) return `${min} min fa`;
  if (min < 60 * 24) return `${Math.round(min / 60)} h fa`;
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

function Video({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  return <VideoView player={player} nativeControls contentFit="contain" style={{ width: '100%', aspectRatio: 4 / 5, borderRadius: radii.md, backgroundColor: '#000' }} />;
}

const Action = ({ label, onPress, color = colors.nebbia, a11y }: { label: string; onPress: () => void; color?: string; a11y?: string }) => (
  <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y ?? label} hitSlop={8} style={{ minHeight: 40, justifyContent: 'center' }}>
    <Text style={{ fontFamily: font.textSemi, fontSize: 14, color }}>{label}</Text>
  </Pressable>
);

/** Un post del feed: autore, testo, foto o video, like, commenti e menu per segnalare, bloccare o eliminare. */
export function PostCard({ post, onChange, onRemove, linkToComments = true }: { post: PostView; onChange: (p: PostView) => void; onRemove: (id: string) => void; linkToComments?: boolean }) {
  const [menu, setMenu] = useState<null | 'menu' | 'report' | 'done'>(null);

  const like = async () => {
    // Aggiornamento immediato, confermato poi dal server.
    onChange({ ...post, liked: !post.liked, likes: post.likes + (post.liked ? -1 : 1) });
    try {
      onChange(await api<PostView>(post.liked ? 'DELETE' : 'PUT', `/community/posts/${post.id}/like`));
    } catch {
      onChange(post);
    }
  };

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Pressable onPress={() => router.push(`/community/profilo/${post.author.id}`)} accessibilityRole="button" accessibilityLabel={`Profilo di ${post.author.name}`} style={{ flex: 1 }}>
          <Text style={{ fontFamily: font.displaySemi, fontSize: 15, color: colors.ghiaccio }}>
            {post.author.name}
            {post.author.role === 'personal_trainer' && <Text style={{ color: colors.energia, fontSize: 12 }}>  PT</Text>}
          </Text>
          <Small>{[post.author.structure, ago(post.createdAt), post.visibility === 'structure' ? 'solo struttura' : null].filter(Boolean).join(' · ')}</Small>
        </Pressable>
        <Action label="•••" a11y="Altre azioni" onPress={() => setMenu(menu ? null : 'menu')} />
      </Row>
      {post.text && <Text style={{ fontFamily: font.text, fontSize: 15, lineHeight: 22, color: colors.ghiaccio }}>{post.text}</Text>}
      {post.media?.type === 'image' && <Image source={{ uri: post.media.url }} accessibilityLabel="Foto del post" style={{ width: '100%', aspectRatio: 1, borderRadius: radii.md, backgroundColor: colors.notte }} resizeMode="cover" />}
      {post.media?.type === 'video' && <Video url={post.media.url} />}
      <Row style={{ gap: 20 }}>
        <Action label={`${post.liked ? '♥' : '♡'} ${post.likes}`} color={post.liked ? colors.corallo : colors.nebbia} a11y={post.liked ? 'Togli il like' : 'Metti like'} onPress={like} />
        {linkToComments ? (
          <Action label={`Commenti ${post.comments}`} onPress={() => router.push(`/community/post/${post.id}`)} />
        ) : (
          <Small style={{ color: colors.nebbia }}>{post.comments} commenti</Small>
        )}
      </Row>

      {menu === 'menu' && (
        <Row style={{ gap: 20, flexWrap: 'wrap' }}>
          {post.mine ? (
            <Action label="Elimina il post" color={colors.corallo} onPress={async () => { await api('DELETE', `/community/posts/${post.id}`); onRemove(post.id); }} />
          ) : (
            <>
              <Action label="Segnala" onPress={() => setMenu('report')} />
              <Action label="Blocca l’autore" color={colors.corallo} onPress={async () => { await api('PUT', `/community/blocks/${post.author.id}`); onRemove(post.id); }} />
            </>
          )}
        </Row>
      )}
      {menu === 'report' && (
        <View style={{ gap: 8 }}>
          <Small style={{ color: colors.nebbia }}>Perché segnali questo post?</Small>
          <ChipRow>
            {REPORT_REASONS.map((reason) => (
              <Chip key={reason} label={reason} selected={false} onPress={async () => { await api('POST', '/community/reports', { targetType: 'post', targetId: post.id, reason }).catch(() => undefined); setMenu('done'); }} />
            ))}
          </ChipRow>
        </View>
      )}
      {menu === 'done' && <Small style={{ color: colors.energia }}>Segnalazione inviata: il team BTECH la esaminerà.</Small>}
    </Card>
  );
}
