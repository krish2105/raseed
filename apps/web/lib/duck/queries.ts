import { spendPredicate } from '@raseed/schema/contract'

/**
 * Every SQL string in the application. No SQL in components — ever.
 *
 * When two places disagree about what counts as spend, one dashboard says ₹88,781 and
 * another says ₹92,400 and nothing errors. Keeping the strings together is what makes that
 * disagreement impossible to introduce by accident.
 */

export const RAW_TABLE = 'raw_transactions'

/**
 * The spend predicate, rendered from `@raseed/schema`'s contract — the same string the
 * Supabase migration and the mobile SQLite view are built from. Three engines, one
 * definition.
 *
 * DuckDB has no `security_invoker`; there is nothing to scope, because the browser only
 * ever holds one user's rows.
 */
export const V_SPEND = `
CREATE OR REPLACE VIEW v_spend AS
SELECT * FROM ${RAW_TABLE}
WHERE ${spendPredicate(RAW_TABLE)};`

export const V_INCOME = `
CREATE OR REPLACE VIEW v_income AS
SELECT * FROM ${RAW_TABLE}
WHERE txn_type = 'income' AND status = 'confirmed' AND deleted = false;`

/** date × currency × category rollup. Everything time-bucketed reads from here. */
export const V_DAILY = `
CREATE OR REPLACE VIEW v_daily AS
SELECT
  CAST(TO_TIMESTAMP(occurred_at / 1000) AS DATE) AS day,
  currency,
  category_id,
  SUM(home_amount_minor)::BIGINT AS home_minor,
  SUM(amount_minor)::BIGINT      AS native_minor,
  COUNT(*)::BIGINT               AS txn_count
FROM v_spend
GROUP BY 1, 2, 3;`

export const V_MONTHLY = `
CREATE OR REPLACE VIEW v_monthly AS
SELECT
  DATE_TRUNC('month', day) AS month,
  currency,
  category_id,
  SUM(home_minor)::BIGINT  AS home_minor,
  SUM(txn_count)::BIGINT   AS txn_count
FROM v_daily
GROUP BY 1, 2, 3;`

/** Sankey edge list: category → kind → leftover. Built in S12; the shape exists now. */
export const V_FLOWS = `
CREATE OR REPLACE VIEW v_flows AS
SELECT
  COALESCE(c.kind, 'want')  AS source,
  COALESCE(c.name, 'Other') AS target,
  SUM(s.home_amount_minor)::BIGINT AS value_minor
FROM v_spend s
LEFT JOIN categories c ON c.id = s.category_id
GROUP BY 1, 2
HAVING SUM(s.home_amount_minor) > 0;`

/**
 * Recurrence candidates by interval coefficient of variation.
 *
 * The full detector lives in `@raseed/engines` and is unit-tested; this view is the cheap
 * pre-filter so the engine only sees merchants worth scoring.
 */
export const V_RECURRING = `
CREATE OR REPLACE VIEW v_recurring AS
WITH gaps AS (
  SELECT
    merchant_id,
    occurred_at,
    occurred_at - LAG(occurred_at) OVER (PARTITION BY merchant_id ORDER BY occurred_at) AS gap
  FROM v_spend
  WHERE merchant_id IS NOT NULL
)
SELECT
  merchant_id,
  COUNT(gap)::BIGINT              AS observations,
  AVG(gap) / 86400000.0           AS mean_period_days,
  COALESCE(STDDEV_POP(gap) / NULLIF(AVG(gap), 0), 0) AS interval_cv
FROM gaps
WHERE gap IS NOT NULL
GROUP BY merchant_id
HAVING COUNT(gap) >= 2;`

/** Applied in order — v_monthly depends on v_daily, which depends on v_spend. */
export const ALL_VIEWS = [V_SPEND, V_INCOME, V_DAILY, V_MONTHLY, V_FLOWS, V_RECURRING] as const

// ── read queries ────────────────────────────────────────────────────────────

export const Q = {
  rowCount: `SELECT COUNT(*)::BIGINT AS n FROM ${RAW_TABLE};`,
  spendCount: 'SELECT COUNT(*)::BIGINT AS n FROM v_spend;',

  /** Home-currency spend in a trailing window, in whole minor units. */
  spendSince: (sinceMs: number) =>
    `SELECT COALESCE(SUM(home_amount_minor), 0)::BIGINT AS total
     FROM v_spend WHERE occurred_at >= ${sinceMs};`,

  spendBetween: (fromMs: number, toMs: number) =>
    `SELECT COALESCE(SUM(home_amount_minor), 0)::BIGINT AS total
     FROM v_spend WHERE occurred_at >= ${fromMs} AND occurred_at < ${toMs};`,

  incomeSince: (sinceMs: number) =>
    `SELECT COALESCE(SUM(home_amount_minor), 0)::BIGINT AS total
     FROM v_income WHERE occurred_at >= ${sinceMs};`,

  byCategorySince: (sinceMs: number) =>
    `SELECT
       s.category_id,
       COALESCE(c.name, 'Uncategorised') AS name,
       COALESCE(c.kind, 'want')          AS kind,
       SUM(s.home_amount_minor)::BIGINT  AS home_minor
     FROM v_spend s
     LEFT JOIN categories c ON c.id = s.category_id
     WHERE s.occurred_at >= ${sinceMs}
     GROUP BY 1, 2, 3
     ORDER BY home_minor DESC;`,

  byMerchantSince: (sinceMs: number) =>
    `SELECT
       s.merchant_id,
       COALESCE(m.canonical_name, 'Unknown') AS name,
       COALESCE(m.country, 'IN')             AS country,
       SUM(s.home_amount_minor)::BIGINT      AS home_minor,
       COUNT(*)::BIGINT                      AS txn_count
     FROM v_spend s
     LEFT JOIN merchants m ON m.id = s.merchant_id
     WHERE s.occurred_at >= ${sinceMs} AND s.merchant_id IS NOT NULL
     GROUP BY 1, 2, 3
     ORDER BY home_minor DESC;`,

  /** Daily totals for the trailing window — feeds the MAD anomaly detector. */
  dailyTotalsSince: (sinceMs: number) =>
    `SELECT day, SUM(home_minor)::BIGINT AS home_minor
     FROM v_daily
     WHERE day >= CAST(TO_TIMESTAMP(${sinceMs} / 1000) AS DATE)
     GROUP BY day ORDER BY day;`,

  /** Share of the window's spend denominated in AED — drives the panel edge colour. */
  currencyMixSince: (sinceMs: number) =>
    `SELECT currency, SUM(home_amount_minor)::BIGINT AS home_minor
     FROM v_spend WHERE occurred_at >= ${sinceMs}
     GROUP BY currency;`,

  recurringCandidates: `
    SELECT r.merchant_id, COALESCE(m.canonical_name, r.merchant_id) AS name,
           r.observations, r.mean_period_days, r.interval_cv
    FROM v_recurring r
    LEFT JOIN merchants m ON m.id = r.merchant_id
    WHERE r.interval_cv < 0.15
    ORDER BY r.interval_cv;`,

  flows: 'SELECT source, target, value_minor FROM v_flows ORDER BY value_minor DESC;',
} as const
