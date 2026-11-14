import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { ChatMessage, ConversationSummary } from '@motix/shared';
import { Button, ErrorBox, Notice, Screen, Small, TopBar } from '@/components/ui';
import { ApiFailure, api } from '@/lib/api';
import { colors, font, radii } from '@/lib/theme';

const when = (iso: string) => new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [name, setName] = useState('Messaggi');
  const [text, setText] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [needsPremium, setNeedsPremium] = useState(false);
  const [busy, setBusy] = useState(false);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);

  const load = useCallback(async () => {
    try {
      setMessages((await api<{ messages: ChatMessage[] }>('GET', `/conversations/${id}/messages`)).messages);
    } catch (e) {
      setError(e);
    }
  }, [id]);

  useEffect(() => {
    void load();
    api<{ conversations: ConversationSummary[] }>('GET', '/conversations')
      .then((r) => setName(r.conversations.find((c) => c.id === id)?.with.name ?? 'Messaggi'))
      .catch(() => undefined);
    // Aggiornamento periodico finché la chat è aperta.
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [id, load]);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const m = await api<ChatMessage>('POST', `/conversations/${id}/messages`, { text });
      setMessages((list) => [...(list ?? []), m]);
      setText('');
    } catch (e) {
      if (e instanceof ApiFailure && e.code === 'premium_required') setNeedsPremium(true);
      else setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      scroll={false}
      footer={
        needsPremium ? (
          <>
            <Notice>Rispondere in chat è incluso in Premium. I messaggi che ricevi restano sempre leggibili.</Notice>
            <Button title="Scopri Premium" onPress={() => router.push('/abbonamento')} />
          </>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Scrivi un messaggio"
              placeholderTextColor={colors.pietra}
              accessibilityLabel="Messaggio"
              multiline
              maxLength={2000}
              style={{ flex: 1, minHeight: 48, maxHeight: 120, fontFamily: font.text, fontSize: 16, color: colors.ghiaccio, backgroundColor: colors.ardesia, borderWidth: 1, borderColor: colors.blu, borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 12 }}
            />
            <Pressable
              onPress={send}
              disabled={busy || !text.trim()}
              accessibilityRole="button"
              accessibilityLabel="Invia"
              style={{ minHeight: 48, paddingHorizontal: 18, borderRadius: radii.pill, backgroundColor: colors.acqua, alignItems: 'center', justifyContent: 'center', opacity: busy || !text.trim() ? 0.5 : 1 }}
            >
              <Text style={{ fontFamily: font.textSemi, fontSize: 15, color: colors.notte }}>Invia</Text>
            </Pressable>
          </View>
        )
      }
    >
      <TopBar title={name} onBack={() => router.back()} />
      <ErrorBox error={error} />
      <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingBottom: 8 }} onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}>
        {messages?.length === 0 && <Small style={{ textAlign: 'center', marginTop: 24 }}>Ancora nessun messaggio.</Small>}
        {messages?.map((m) => (
          <View
            key={m.id}
            style={{
              alignSelf: m.mine ? 'flex-end' : 'flex-start',
              maxWidth: '82%',
              backgroundColor: m.mine ? 'rgba(56,211,238,0.16)' : colors.ardesia,
              borderWidth: 1,
              borderColor: m.mine ? 'rgba(56,211,238,0.45)' : colors.blu,
              borderRadius: 16,
              borderBottomRightRadius: m.mine ? 4 : 16,
              borderBottomLeftRadius: m.mine ? 16 : 4,
              paddingHorizontal: 14,
              paddingVertical: 10,
              gap: 4,
            }}
          >
            <Text style={{ fontFamily: font.text, fontSize: 15, lineHeight: 21, color: colors.ghiaccio }}>{m.text}</Text>
            <Text style={{ fontFamily: font.text, fontSize: 11, color: colors.pietra }}>{when(m.at)}</Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
