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
