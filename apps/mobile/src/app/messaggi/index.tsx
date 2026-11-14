import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { ConversationSummary } from '@motix/shared';
import { Body, Card, ErrorBox, Loading, Row, Screen, Small, TopBar } from '@/components/ui';
import { colors, font } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

/** Conversazioni con il personal trainer e con la struttura. */
export default function Messaggi() {
  const { data, error } = useApi<{ conversations: ConversationSummary[] }>('/conversations');
  return (
    <Screen>
      <TopBar title="Messaggi" onBack={() => router.back()} />
      <ErrorBox error={error} />
      {!data && !error && <Loading />}
      {data?.conversations.length === 0 && (
        <Card>
          <Body style={{ fontSize: 14 }}>Qui trovi i messaggi del tuo personal trainer e della tua struttura. Per scrivere al personal trainer vai nel profilo.</Body>
        </Card>
      )}
      {data?.conversations.map((c) => (
        <Pressable key={c.id} onPress={() => router.push(`/messaggi/${c.id}`)} accessibilityRole="button" accessibilityLabel={`${c.with.name}${c.unread ? `, ${c.unread} da leggere` : ''}`}>
          <Card style={c.unread ? { borderColor: colors.acqua } : undefined}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: font.displaySemi, fontSize: 16, color: colors.ghiaccio, flex: 1 }} numberOfLines={1}>{c.with.name}</Text>
              {c.unread > 0 && (
                <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.acqua, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
                  <Text style={{ fontFamily: font.textSemi, fontSize: 12, color: colors.notte }}>{c.unread}</Text>
                </View>
              )}
            </Row>
            <Small style={{ color: colors.nebbia }} numberOfLines={2}>
              {c.lastMessage ? `${c.lastMessage.mine ? 'Tu: ' : ''}${c.lastMessage.text}` : 'Nessun messaggio'}
            </Small>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
