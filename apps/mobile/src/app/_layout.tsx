import { Stack } from 'expo-router'

// Session 0 keeps this to a bare stack. The three-tab shell (Today / Ledger / You)
// with tokens and fonts is Session 5's job.
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
