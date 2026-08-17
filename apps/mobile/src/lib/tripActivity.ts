import { format } from '@raseed/money'
import type { TripProgress } from '@raseed/engines'
import { palette, type Palette } from '@raseed/tokens'

import TripActivity, { type TripActivityProps } from '@/live-activity/TripActivity'

/**
 * The bridge between the trip and its Lock Screen.
 *
 * **One function turns `TripProgress` into activity props, and it is the only one.** The screen
 * and the Live Activity render the same computed object, formatted by the same `format()` — so
 * the Lock Screen cannot say ₹2,481 while the app says ₹2,480.50. Two formatters is how a phone
 * ends up showing a person two different totals for the same money.
 *
 * Everything here is defensive about one fact: **a Live Activity is not guaranteed.** The user
 * can turn Live Activities off per-app in Settings, the system throttles and can refuse, and
 * `expo-widgets` exposes no `areActivitiesEnabled` to ask in advance. So every call is wrapped
 * and every failure is swallowed. A trip whose lock-screen widget did not appear is a trip with
 * no widget; it is not a trip that failed to start, and it must never take the ledger down with
 * it. The database is the source of truth and the activity is a view of it.
 */

function toProps(
  trip: { name: string },
  p: TripProgress,
  colors: Palette,
): TripActivityProps {
  return {
    name: trip.name,
    spent: format(p.spent),
    // Empty rather than a placeholder. The widget renders the row without it, instead of
    // printing "—" where a number belongs.
    remaining: p.remaining
      ? p.remaining.minor >= 0
        ? `${format(p.remaining)} left`
        : `${format(p.remaining)} over`
      : '',
    burn: p.dayNumber > 1 ? `${format(p.burnPerDay)}/day` : '',
    dayLabel: `Day ${p.dayNumber}`,
    over: p.pace === 'over',
    accent: colors.accent,
    warn: colors.warn,
    // Always from the DARK palette regardless of the app's theme: the always-on display is a
    // dimmed dark surface whatever the app looks like when open.
    dimInk: palette.dark['text-hi'],
  }
}

/** Start the Lock Screen activity for a trip. Silent if the system declines. */
export function startTripActivity(
  trip: { name: string },
  p: TripProgress,
  colors: Palette,
): void {
  try {
    // The deep link the system opens when the activity is tapped. `/trip` is where Trip Mode
    // lives, so tapping the Lock Screen lands on the thing it is describing.
    TripActivity.start(toProps(trip, p, colors), 'raseed://trip')
  } catch {
    // See above: no activity is a supported outcome.
  }
}

/**
 * Push the current numbers to whatever activity is running.
 *
 * Reads `getInstances()` rather than holding a handle, because **a Live Activity outlives the
 * process that started it.** Keeping the instance in a module variable would work until the app
 * was killed and relaunched mid-trip, at which point the widget would sit on the Lock Screen
 * showing yesterday's total with nothing able to update it. Asking the system every time is the
 * only version that survives a cold start.
 */
export function updateTripActivity(
  trip: { name: string },
  p: TripProgress,
  colors: Palette,
): void {
  try {
    for (const instance of TripActivity.getInstances()) {
      void instance.update(toProps(trip, p, colors))
    }
  } catch {
    // Ditto.
  }
}

/**
 * End every running trip activity.
 *
 * `'immediate'` rather than the default policy. The default leaves the finished activity on the
 * Lock Screen for up to four hours, which is right for a delivery you might want to check the
 * receipt of and wrong for this: you ended the trip, and a lingering widget still counting a trip
 * you are no longer on is a wrong number on the Lock Screen of a phone you have put in a drawer.
 *
 * The final props are passed so the last frame is the real final total rather than whatever was
 * last pushed.
 */
export function endTripActivity(
  trip: { name: string },
  p: TripProgress,
  colors: Palette,
): void {
  try {
    for (const instance of TripActivity.getInstances()) {
      void instance.end('immediate', toProps(trip, p, colors), new Date())
    }
  } catch {
    // Ditto.
  }
}
