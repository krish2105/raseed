import { useEffect } from 'react'
import { Tabs } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts } from 'expo-font'
import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
} from '@expo-google-fonts/bricolage-grotesque'
import { Geist_400Regular, Geist_500Medium } from '@expo-google-fonts/geist'
import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono'
import { Home, Receipt, User } from 'lucide-react-native'

import { font, useTheme } from '@/theme'

void SplashScreen.preventAutoHideAsync()

/**
 * Three tabs, maximum: Today / Ledger / You. Navigation is not the product; the capture bar
 * and the dial are. Anything that needs a fourth tab belongs inside one of these.
 */
export default function RootLayout() {
  const { colors, scheme } = useTheme()

  const [fontsLoaded, fontError] = useFonts({
    Bricolage: BricolageGrotesque_600SemiBold,
    BricolageBold: BricolageGrotesque_700Bold,
    Geist: Geist_400Regular,
    GeistMedium: Geist_500Medium,
    GeistMono: GeistMono_400Regular,
    GeistMonoMedium: GeistMono_500Medium,
  })

  useEffect(() => {
    // Hide once fonts resolve either way — a font that fails to load must not leave the
    // user staring at a splash screen forever.
    if (fontsLoaded || fontError) void SplashScreen.hideAsync()
  }, [fontsLoaded, fontError])

  if (!fontsLoaded && !fontError) return null

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.inr,
          tabBarInactiveTintColor: colors['text-lo'],
          tabBarStyle: {
            backgroundColor: colors['surface-1'],
            borderTopColor: colors.line,
          },
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
    </>
  )
}
