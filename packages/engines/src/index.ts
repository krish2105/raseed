/**
 * @raseed/engines — pure domain logic.
 *
 * No I/O, no React, no DB, no platform APIs, no Date.now(). Time is passed in. Both apps
 * import the same code, so a number on the phone and the same number on the dashboard come
 * from one implementation.
 */

export * from './domain/safeToSpend'
export * from './domain/normaliseMerchant'
export * from './domain/pairReversals'
export * from './domain/detectRecurrence'
export * from './domain/detectRemittance'
export * from './domain/regretRate'
export * from './domain/rankNudges'
export * from './domain/splitBill'
export * from './domain/reconcileCash'
export * from './domain/detectTrips'
export * from './domain/realValue'
export * from './domain/breakEven'
export * from './domain/tone'
export * from './domain/narrate'
export * from './domain/settle'
export * from './domain/planTrip'
export * from './domain/parseStatement'
export * from './domain/parseReceipt'

export * from './finance'
export * from './stats'
export * from './stats/changePoints'
export * from './stats/risk'
export * from './stats/entropy'
