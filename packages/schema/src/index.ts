/**
 * @raseed/schema — contract.ts is the truth; sqlite.ts, pg.ts and zod.ts are emitted from
 * it by scripts/generate.mts and verified against it by parity.test.ts.
 *
 * Import the dialect you need directly (`@raseed/schema/sqlite`, `/pg`, `/zod`) so a mobile
 * bundle never pulls in drizzle-orm/pg-core.
 */
export * from './contract'
