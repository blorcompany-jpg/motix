import { Redirect, Tabs } from 'expo-router';
import { TabIcon } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors, font } from '@/lib/theme';

export default function TabsLayout() {
  const { user } = useAuth();
  if (!user) return <Redirect href="/" />;
  // Chi si allena compila prima il questionario: senza, non c'è un piano da mostrare.
  if (user.role === 'user' && !user.hasProfile) return <Redirect href="/questionario" />;
  const isUser = user.role === 'user';
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.notte },
        tabBarStyle: { backgroundColor: colors.ardesia, borderTopColor: colors.blu, height: 72 },
        tabBarItemStyle: { paddingTop: 8, paddingBottom: 10 },
        tabBarActiveTintColor: colors.acqua,
        tabBarInactiveTintColor: colors.pietra,
        tabBarLabelStyle: { fontFamily: font.textMedium, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color }) => <TabIcon name="home" color={color} /> }} />
      <Tabs.Screen name="piano" options={{ title: 'Piano', href: isUser ? undefined : null, tabBarIcon: ({ color }) => <TabIcon name="piano" color={color} /> }} />
      <Tabs.Screen name="progressi" options={{ title: 'Progressi', href: isUser ? undefined : null, tabBarIcon: ({ color }) => <TabIcon name="progressi" color={color} /> }} />
      <Tabs.Screen name="profilo" options={{ title: 'Profilo', tabBarIcon: ({ color }) => <TabIcon name="profilo" color={color} /> }} />
    </Tabs>
  );
}
