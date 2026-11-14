import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { SHOP_CATEGORY_LABELS, type ShopProduct } from '@motix/shared';
import { Body, Card, ErrorBox, Eyebrow, H2, Loading, Row, Screen, Small } from '@/components/ui';
import { api } from '@/lib/api';
import { colors, font } from '@/lib/theme';
import { useApi } from '@/lib/useApi';

const HINTS: Record<ShopProduct['category'], string> = {
  sensor: 'Il sensore che misura ogni ripetizione su macchine e attrezzi',
  equipment: 'Pesi, bilancieri e tutto per allenarti',
  apparel: 'Abbigliamento tecnico per la palestra',
  accessories: 'Borracce, guanti, fasce e accessori',
};

/** Shop by BLOR: l'app mostra il catalogo, l'acquisto avviene sul sito del partner BLOR Company. */
export default function Shop() {
  const { data, error: loadError, loading } = useApi<{ products: ShopProduct[] }>('/shop/products');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const open = async (p: ShopProduct) => {
    setBusy(p.id);
    setError(null);
    try {
      const { url } = await api<{ url: string }>('POST', `/shop/products/${p.id}/open`);
      await Linking.openURL(url);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <Eyebrow>by BLOR</Eyebrow>
        <H2>Shop</H2>
      </View>
      <Body style={{ fontSize: 14 }}>Sensore, attrezzatura, abbigliamento e accessori. Scegli qui, acquista sul sito del nostro partner BLOR Company.</Body>
      <ErrorBox error={error ?? loadError} />
      {!data && loading && <Loading />}
      {data?.products.map((p) => (
        <Pressable key={p.id} onPress={() => open(p)} disabled={busy !== null} accessibilityRole="link" accessibilityLabel={`${p.name}: apri su BLOR`}>
          <Card style={{ opacity: busy === p.id ? 0.6 : 1 }}>
            <Small style={{ color: colors.acqua, fontFamily: font.textSemi }}>{SHOP_CATEGORY_LABELS[p.category]}</Small>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: font.display, fontSize: 20, color: colors.ghiaccio, flex: 1 }}>{p.name}</Text>
              <Text style={{ fontFamily: font.textSemi, fontSize: 14, color: colors.energia }}>Apri su BLOR ↗</Text>
            </Row>
            <Small style={{ color: colors.nebbia }}>{HINTS[p.category]}</Small>
          </Card>
        </Pressable>
      ))}
      <Small>Pagamento, spedizione e resi sono gestiti da BLOR Company sul suo sito.</Small>
    </Screen>
  );
}
