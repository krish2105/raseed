import { describe, expect, it } from 'vitest'
import { isSafe, parseQuestion } from '../nl'

/**
 * The S16 done-when criterion: the sandbox rejects twelve adversarial strings.
 *
 * These are the shapes an injected or model-authored query actually takes — not
 * hypotheticals. The parser is deterministic today, but this suite guards the boundary for
 * the day an LLM is allowed to write the SQL.
 */
const ADVERSARIAL: { name: string; sql: string }[] = [
  { name: 'stacked DROP', sql: "SELECT 1; DROP TABLE raw_transactions;" },
  { name: 'stacked DELETE', sql: 'SELECT * FROM v_spend; DELETE FROM raw_transactions' },
  { name: 'bare DROP', sql: 'DROP VIEW v_spend' },
  { name: 'UPDATE', sql: "UPDATE raw_transactions SET amount_minor = 0" },
  { name: 'INSERT', sql: "INSERT INTO raw_transactions VALUES ('x')" },
  { name: 'DELETE', sql: 'DELETE FROM raw_transactions WHERE 1=1' },
  { name: 'ALTER', sql: 'ALTER TABLE raw_transactions ADD COLUMN pwned TEXT' },
  { name: 'CREATE a shadow view', sql: 'CREATE VIEW v_spend AS SELECT 1' },
  { name: 'ATTACH a remote database', sql: "ATTACH 'https://evil.example/x.db' AS evil" },
  { name: 'INSTALL an extension', sql: 'INSTALL httpfs' },
  { name: 'COPY data out to a file', sql: "COPY raw_transactions TO '/tmp/stolen.csv'" },
  { name: 'PRAGMA probe', sql: 'PRAGMA database_list' },
]

describe('SQL sandbox', () => {
  it.each(ADVERSARIAL)('rejects: $name', ({ sql }) => {
    const verdict = isSafe(sql)
    expect(verdict.ok, `"${sql}" was allowed through`).toBe(false)
  })

  it('rejects all twelve, none slipping through', () => {
    const allowed = ADVERSARIAL.filter((a) => isSafe(a.sql).ok)
    expect(allowed.map((a) => a.name)).toEqual([])
  })

  it('still allows an ordinary SELECT', () => {
    expect(isSafe('SELECT SUM(home_amount_minor) FROM v_spend').ok).toBe(true)
  })

  it('allows a CTE, which the parser emits for variance', () => {
    expect(isSafe('WITH a AS (SELECT 1) SELECT * FROM a').ok).toBe(true)
  })

  it('allows a single trailing semicolon but not an interior one', () => {
    expect(isSafe('SELECT 1;').ok).toBe(true)
    expect(isSafe('SELECT 1; SELECT 2;').ok).toBe(false)
  })
})

describe('the parser only ever emits safe SQL', () => {
  const QUESTIONS = [
    'how much on food last 90 days',
    'spend by category this month',
    'biggest merchants this year',
    'daily spend over time',
    'how many transactions this month',
    'average transaction in transport',
    'how much in AED last 30 days',
    'breakdown by merchant for rent all time',
    // Attempts to get the parser itself to emit something dangerous.
    "food'; DROP TABLE raw_transactions; --",
    'spend by category; DELETE FROM raw_transactions',
  ]

  it.each(QUESTIONS)('“%s” produces SQL the sandbox accepts', (q) => {
    const plan = parseQuestion(q, 'INR')
    if (!plan) return // refusing to parse is a valid, safe outcome
    expect(isSafe(plan.sql).ok, `emitted: ${plan.sql}`).toBe(true)
  })

  it('returns null rather than guessing at nonsense', () => {
    expect(parseQuestion('asdfghjkl', 'INR')).toBeNull()
    expect(parseQuestion('', 'INR')).toBeNull()
  })
})
