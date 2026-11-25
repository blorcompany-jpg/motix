import { router } from 'expo-router';
import { Button, Card, Small } from '@/components/ui';
import { ApiFailure } from '@/lib/api';
import { colors } from '@/lib/theme';

export const isPremiumError = (e: unknown) => e instanceof ApiFailure && e.code === 'premium_required';

/** Al posto della funzione, per chi non ha Premium. */
export function PremiumCard({ what }: { what: string }) {
  return (
    <Card>
      <Small style={{ color: colors.nebbia }}>{what} è incluso in Premium.</Small>
      <Button title="Scopri Premium" variant="ghost" onPress={() => router.push('/abbonamento')} />
    </Card>
  );
}
