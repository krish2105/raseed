import { useCallback, useState } from 'react'
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition'

/**
 * Dictation, on this device.
 *
 * The last piece of P8, and the reason it is worth having is not convenience — it is that
 * `"chai 20, auto 80, bigbasket 640"` is a sentence you say in three seconds and type in
 * fifteen, and the capture parser already understands exactly that shape. Voice does not need
 * its own parser; it needs to produce the same string the keyboard does.
 *
 * **`requiresOnDeviceRecognition: true` is the whole point.** iOS will happily send audio to
 * Apple's servers for a better transcript, and for a ledger that is the wrong trade at any
 * accuracy. On-device keeps `MOBILE_ARCHITECTURE.md`'s claim true — voice costs nothing and
 * works in airplane mode — and keeps this app's one real promise intact: nothing leaves the
 * phone. If a device cannot do it on-device, this refuses rather than quietly falling back to
 * the network, because a silent fallback is how a privacy claim becomes a lie.
 *
 * Interim results are surfaced so the field fills as you speak. Watching words appear is what
 * tells you it is listening; a spinner that resolves into a paragraph is indistinguishable from
 * a spinner that resolves into nothing.
 */

export type DictationState = 'idle' | 'listening' | 'denied' | 'unsupported'

export interface Dictation {
  readonly state: DictationState
  /** What has been heard so far, including the in-progress phrase. */
  readonly transcript: string
  readonly error: string | null
  readonly start: () => Promise<void>
  readonly stop: () => void
}

export function useDictation(onFinal: (text: string) => void): Dictation {
  const [state, setState] = useState<DictationState>('idle')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  useSpeechRecognitionEvent('start', () => setState('listening'))

  useSpeechRecognitionEvent('result', (event) => {
    const said = event.results[0]?.transcript ?? ''
    setTranscript(said)
    // `isFinal` marks the point the recogniser stops revising. Handing an interim string to the
    // parser would produce drafts that change under you as you keep talking.
    if (event.isFinal && said.trim().length > 0) onFinal(said)
  })

  useSpeechRecognitionEvent('end', () => setState('idle'))

  useSpeechRecognitionEvent('error', (event) => {
    setState('idle')
    // `no-speech` is someone pressing the button and thinking. It is not a failure and saying
    // so would train people to distrust the control.
    setError(event.error === 'no-speech' ? null : describe(event.error))
  })

  const start = useCallback(async () => {
    setError(null)
    setTranscript('')

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync()
    if (!permission.granted) {
      setState('denied')
      return
    }

    try {
      ExpoSpeechRecognitionModule.start({
        lang: 'en-IN',
        interimResults: true,
        continuous: false,
        // Never the network. See above.
        requiresOnDeviceRecognition: true,
      })
    } catch {
      setState('unsupported')
    }
  }, [])

  const stop = useCallback(() => {
    ExpoSpeechRecognitionModule.stop()
  }, [])

  return { state, transcript, error, start, stop }
}

/** Recogniser errors, in words rather than codes. */
function describe(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone or speech access is off. Settings → RASEED to turn it on.'
    case 'language-not-supported':
      return 'This device has no on-device model for that language. Type it instead.'
    case 'audio-capture':
      return 'The microphone is not available — something else may be using it.'
    case 'network':
      // Reaching this means on-device recognition was not honoured, which is worth saying
      // plainly rather than retrying over the network.
      return 'That would have needed the network, so it was stopped. Type it instead.'
    default:
      return 'Speech recognition stopped unexpectedly. Type it instead.'
  }
}
