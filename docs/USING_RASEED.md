# Using RASEED

Live dashboard: **https://raseed-eosin.vercel.app**

---

## The dashboard, on any browser

### Add an expense
The **Add** button in the top bar (or the `+` on narrow screens).

Pick INR or AED, type the amount, name who you paid, choose a category, Save. Every figure
on the page recomputes immediately — the row is written to your browser's localStorage,
layered on top of the seeded demo, and re-ingested into DuckDB.

Two things worth knowing:

- **It stays in your browser.** Your additions never reach a server and never touch anyone
  else's view of the demo. That is what makes a public dashboard with write access safe.
- **The FX rate is frozen onto the row.** An AED expense records the INR/AED rate at the
  moment you save it. Switching the currency lens later reads a different column — it never
  goes back and rewrites what you already recorded.

### Change currency
The **INR · AED · Native** control in the top bar.

- **INR** — everything converted to rupees at each row's frozen rate
- **AED** — everything converted to dirhams at each row's frozen rate
- **Native** — each amount in the currency it was actually spent in

The lens lives in the URL (`?lens=AED`), so a view you paste into Slack reproduces exactly,
including which currency it was read in.

### Ask a question
**⌘K** (or Ctrl+K). Type something like:

- `how much on food last 90 days`
- `spend by category this month`
- `biggest merchants this year`
- `daily spend over time`
- `how much in AED last 30 days`

It parses periods, categories, currencies and shapes with rules — not a language model. It
cannot answer everything, but it never invents a number, and **the SQL it ran is always one
click away** under the result. Anything that is not a single `SELECT` is rejected.

### Categories
Currently the ten seeded categories (Rent, Groceries, Transport, Utilities, Eating out,
Subscriptions, Shopping, Health, Savings, Salary). Custom categories are a small addition to
`lib/store/local-ledger.ts` and are not built yet — see Known gaps.

### The tabs

| Tab | What it answers |
|---|---|
| **Overview** | The CFO briefing — what changed, why, who drove it, and whether you make it to payday |
| **Flows** | Where the money physically went: income → needs/wants/savings → categories |
| **Categories** | Treemap, ranking, and the rate × volume split — did you buy more, or did it get dearer |
| **Forecast** | Holt-Winters with a block-bootstrap fan, and the holdout error printed on screen |
| **Currency** | What each remittance actually cost you versus mid-market |
| **Ledger** | Every confirmed spend row, searchable and filterable |
| **Lab** | The 100k-row performance benchmark, run in your own browser |

---

## The iPhone app

There is no App Store build, and there will not be one until you decide the store question
(Session 19). Two ways to run it today:

### On the simulator, on this Mac
```bash
cd apps/mobile && pnpm exec expo run:ios
```
First native compile is 10–20 minutes; after that it is instant. Requires Xcode, which is
already installed here.

### On your actual iPhone
Follow `docs/RUNBOOK_EAS.md`. Short version:

```bash
npm install -g eas-cli
eas login
cd apps/mobile && eas build --profile development --platform ios
```

You need a free Apple ID — **not** the $99 developer program, because a development build
uses ad-hoc distribution to devices you register. EAS prints a QR code; scan it on the phone
to install. Then run `pnpm start` on the Mac and scan the dev-server QR from inside the app.

That burns one of your 15 free iOS builds per month, and you only need to repeat it when a
**native** dependency changes — JavaScript changes reload instantly.

---

## Known gaps, stated plainly

- **Custom categories** are not editable yet; the ten seeded ones are fixed.
- **Editing and deleting** an added expense works on the phone but not yet on the web.
- **No sync.** The phone and the dashboard each hold their own data. See
  `docs/RUNBOOK_BACKEND.md`.
- **The demo ledger is fixed at a seed date** so every visitor sees identical figures and
  screenshots reproduce. Your own additions are stamped with the real current time.
- **Capture** — typing "chai 20, auto 80" and getting three transactions — is Session 11.
  The confirmation sheet it commits through already exists on the phone.
