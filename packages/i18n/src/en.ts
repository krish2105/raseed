/**
 * The English dictionary, and the source of truth for what strings exist.
 *
 * Keys are `area.thing`, and the English text is the canonical wording — `missingKeys()` scores
 * every other locale against this object, so adding a key here immediately makes every
 * translation visibly incomplete rather than silently so.
 *
 * Only *chrome* lives here. The narrated sentences the app generates about your money are built
 * from templates in `@raseed/engines` and pass the tone gate on the way out; putting them in a
 * dictionary would let someone edit a safety-checked sentence without the gate noticing.
 */
export const en = {
  // ── tabs and navigation ───────────────────────────────────────────────────
  'tab.today': 'Today',
  'tab.ledger': 'Ledger',
  'tab.you': 'You',
  'nav.back': 'Back',
  'nav.cancel': 'Cancel',
  'nav.save': 'Save',
  'nav.done': 'Done',

  // ── today ─────────────────────────────────────────────────────────────────
  'today.greetingMorning': 'Good morning',
  'today.greetingAfternoon': 'Good afternoon',
  'today.greetingEvening': 'Good evening',
  'today.showNumbers': 'Show me the numbers',
  'today.hideNumbers': 'Hide the numbers',
  'today.todaysLedger': 'Today’s ledger',
  'today.empty': 'Nothing logged yet. Tap the bar and type what you spent.',
  'today.addSpend': 'Add what you spent',
  'today.daysToPayday': '{days} days to payday',
  'today.spent': '{amount} spent',
  'today.toLookBackOn': '{count} to look back on — was it worth it?',

  // ── capture ───────────────────────────────────────────────────────────────
  'capture.title': 'Capture',
  'capture.placeholder': 'chai 20, auto 80, bigbasket 640',
  'capture.read': 'Read it',
  'capture.sayInstead': 'Say it instead',
  'capture.listening': 'Listening — tap to stop',
  'capture.privacy':
    'Read on this phone by a parser with no network access. Nothing is sent anywhere, and nothing is written until you save.',
  'capture.transactions': '{count} transactions',
  'capture.notWritten': '{type} — not written',
  'capture.worthChecking': 'worth checking',
  'capture.skipped': 'skipped',
  'capture.unreadable': 'Could not read an amount in:',
  'capture.discard': 'Discard',
  'capture.saveCount': 'Save {count}',
  'capture.notNamed': 'Not named',

  // ── the reckoning ─────────────────────────────────────────────────────────
  'reckoning.title': 'The Reckoning',
  'reckoning.worthIt': 'Worth it?',
  'reckoning.yes': 'Worth it',
  'reckoning.no': 'Not worth it',
  'reckoning.neither': 'Neither',
  'reckoning.later': 'Later',
  'reckoning.undo': 'Undo last',
  'reckoning.whereRegretIs': 'Where the regret is',
  'reckoning.thisWeek': 'This week',
  'reckoning.batchDone': 'That’s the batch — five is deliberately all it asks for in one sitting.',

  // ── privacy ───────────────────────────────────────────────────────────────
  'privacy.title': 'Privacy',
  'privacy.encrypted': 'Database encrypted on this device',
  'privacy.notEncrypted': 'This build does not encrypt the database',
  'privacy.whatIsStored': 'What is stored',
  'privacy.whatYouAgreed': 'What you have agreed to',
  'privacy.takeItWithYou': 'Take it with you',
  'privacy.exportCsv': 'Export CSV',
  'privacy.exportJson': 'Export JSON',
  'privacy.delete': 'Delete',
  'privacy.deleteEverything': 'Delete everything',
  'privacy.purgeNow': 'Purge anything past its window now',

  // ── you ───────────────────────────────────────────────────────────────────
  'you.title': 'You',
  'you.appearance': 'Appearance',
  'you.system': 'System',
  'you.light': 'Light',
  'you.dark': 'Dark',
  'you.language': 'Language',
  'you.accounts': 'Accounts',
  'you.committed': 'Committed, before payday',
  'you.about': 'About',
  'you.homeCurrency': 'Home currency',

  // ── numbers ───────────────────────────────────────────────────────────────
  'numbers.title': 'Numbers',
  'numbers.whatRepeats': 'What repeats',
  'numbers.whatChanged': 'What changed',
  'numbers.corridor': 'The corridor',
  'numbers.reachPayday': 'Does it reach payday?',
  'numbers.yes': 'Yes',
  'numbers.alreadyThere': 'Already there',
  'numbers.askYourLedger': 'Ask your ledger',

  // ── splits ────────────────────────────────────────────────────────────────
  'split.title': 'Split',
  'split.outstanding': 'Outstanding',
  'split.owesYou': 'owes you',
  'split.youOwe': 'you owe',
  'split.settled': 'Settled',
  'split.shareLink': 'Share a link',

  // ── shared ────────────────────────────────────────────────────────────────
  'common.notEnoughHistory': 'Needs about three weeks of history.',
  'common.nothingYet': 'Nothing yet.',
} as const
