import { spawn } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Lighthouse against a production build, on the landing route.
 *
 * Web P9's done-when has always been "Lighthouse ≥95" and for four sessions it was the one
 * criterion nobody had run — the route was built, the score was assumed. This exists so the
 * number is a measurement rather than a memory.
 *
 * Both form factors, because they disagree and the disagreement is the interesting part:
 * desktop is a real profile of a real visitor, mobile is a simulated slow-4G connection with a
 * 4× CPU throttle and is deliberately harsher than anything this app will meet.
 *
 *   pnpm --filter web build && pnpm --filter web start -p 3801
 *   pnpm --filter web lighthouse
 *
 * Exits non-zero if any category is below the floor, so it can be a gate rather than a report.
 */

const URL_UNDER_TEST = process.env.LH_URL ?? 'http://127.0.0.1:3801/'
const FLOOR = Number(process.env.LH_FLOOR ?? 95)

/**
 * Nothing is exempt, and that is new.
 *
 * Mobile performance sat at 94 with 85% of its LCP unexplained render delay, and was exempted
 * here rather than hidden behind a lower floor. The redesign found the cause by making it
 * worse: the hero rebuild dropped it to 88, and the trace named the LCP element outright — the
 * lede paragraph, wrapped in a reveal that starts at `opacity: 0`. An element that does not
 * exist until an animation frame cannot be painted, and the largest text block above the fold
 * is exactly what LCP measures.
 *
 * Removing the entrance animation from the headline and the lede took it to **95**. The rule
 * that came out of it, and the one worth keeping: above the fold, nothing large and textual
 * animates in.
 */
const EXEMPT = new Set()

const RUNS = [
  { label: 'desktop', args: ['--preset=desktop'] },
  { label: 'mobile', args: [] },
]

let failed = false

for (const run of RUNS) {
  const out = join(tmpdir(), `raseed-lh-${run.label}.json`)
  await new Promise((resolve, reject) => {
    const child = spawn(
      'npx',
      [
        '--yes',
        'lighthouse@12',
        URL_UNDER_TEST,
        '--only-categories=performance,accessibility,best-practices,seo',
        ...run.args,
        '--quiet',
        '--chrome-flags=--headless=new --no-sandbox',
        '--output=json',
        `--output-path=${out}`,
      ],
      { stdio: ['ignore', 'ignore', 'inherit'] },
    )
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`lighthouse ${code}`))))
  })

  const report = JSON.parse(await readFile(out, 'utf8'))
  for (const [key, category] of Object.entries(report.categories)) {
    const score = Math.round(category.score * 100)
    const id = `${run.label}:${key}`
    const exempt = EXEMPT.has(id)
    const ok = score >= FLOOR || exempt
    if (!ok) failed = true
    console.log(
      `${ok ? '  ok  ' : ' FAIL '} ${id.padEnd(28)} ${String(score).padStart(3)}${exempt && score < FLOOR ? '  (exempt, see scripts/lighthouse.mjs)' : ''}`,
    )
  }
  await rm(out, { force: true })
}

process.exit(failed ? 1 : 0)
