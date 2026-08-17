import { Tabs } from 'expo-router'
import { Home, Receipt, User } from 'lucide-react-native'

import { font, useTheme } from '@/theme'

/**
 * Three tabs, maximum: Today / Ledger / You. Navigation is not the product; the capture bar
 * and the dial are. Anything that would want a fourth tab belongs inside one of these.
 */
export default function TabsLayout() {
  const { colors } = useTheme()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Chrome, not currency — the same law the dashboard follows.
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors['text-lo'],
        tabBarStyle: { backgroundColor: colors['surface-1'], borderTopColor: colors.line },
        tabBarLabelStyle: { fontFamily: font.body, fontSize: 11 },
        sceneStyle: { backgroundColor: colors['surface-0'] },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size - 2} />,
        }}
      />
      <Tabs.Screen
        name="ledger"
        options={{
          title: 'Ledger',
          tabBarIcon: ({ color, size }) => <Receipt color={color} size={size - 2} />,
        }}
      />
      <Tabs.Screen
        name="you"
        options={{
          title: 'You',
          tabBarIcon: ({ color, size }) => <User color={color} size={size - 2} />,
        }}
      />
    </Tabs>
  )
}
