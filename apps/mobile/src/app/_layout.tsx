import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts } from 'expo-font'
import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
} from '@expo-google-fonts/bricolage-grotesque'
import { Geist_400Regular, Geist_500Medium } from '@expo-google-fonts/geist'
import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono'

import { useTheme } from '@/theme'
import { initDatabase } from '@/db'

void SplashScreen.preventAutoHideAsync()

// Migrations and the first-run seed happen before the first render. op-sqlite is
// synchronous over JSI, so this costs single-digit milliseconds and removes a whole class
// of "screen rendered before the table existed" bugs.
initDatabase()

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
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors['surface-0'] },
        }}
      >
        <Stack.Screen name="(tabs)" />
        {/* Capture is a sheet over the ledger, not a destination you navigate away to. */}
        <Stack.Screen name="add" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  )
}
