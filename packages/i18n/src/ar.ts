import type { en } from './en'

/**
 * The Arabic dictionary.
 *
 * **Machine-translated, and not reviewed by a native speaker.** That is recorded here and
 * asserted by a test rather than left for someone to discover, because the honest description of
 * this file is "a scaffold with plausible content in it".
 *
 * What that means in practice, and why it is still worth shipping:
 *
 *   - The **mechanism** is real and testable: keys resolve, missing keys fall back to English
 *     rather than to a raw key, RTL follows the locale, and `gateFor('ar')` routes generated
 *     copy through the Arabic tone rules. None of that needs my Arabic to be good.
 *   - The **wording** does not. A Gulf Arabic speaker should read every line, and the ones that
 *     matter most are not the nouns — they are anything that could land as a judgement about a
 *     person rather than an observation about a ledger.
 *
 * Deliberately partial. Only chrome that is safe to get slightly wrong is translated; the
 * narrated sentences about money stay in `@raseed/engines` where the tone gate can see them,
 * and the Reckoning's question copy is left untranslated on purpose — "was it worth it" is a
 * question about regret, and I am not confident enough in its register to put it in front of
 * someone. `coverage('ar')` reports the gap rather than hiding it.
 */
export const ar: Partial<Record<keyof typeof en, string>> = {
  'tab.today': 'اليوم',
  'tab.ledger': 'السجل',
  'tab.you': 'حسابك',
  'nav.back': 'رجوع',
  'nav.cancel': 'إلغاء',
  'nav.save': 'حفظ',
  'nav.done': 'تم',

  'today.greetingMorning': 'صباح الخير',
  'today.greetingAfternoon': 'مساء الخير',
  'today.greetingEvening': 'مساء الخير',
  'today.showNumbers': 'اعرض الأرقام',
  'today.hideNumbers': 'أخفِ الأرقام',
  'today.todaysLedger': 'سجل اليوم',
  'today.empty': 'لا شيء مسجل بعد. اضغط الشريط واكتب ما أنفقته.',
  'today.addSpend': 'أضف ما أنفقته',
  'today.daysToPayday': '{days} يوم حتى الراتب',
  'today.spent': 'أُنفق {amount}',

  'capture.title': 'التقاط',
  'capture.read': 'اقرأها',
  'capture.sayInstead': 'قلها بدلاً من ذلك',
  'capture.listening': 'يستمع — اضغط للإيقاف',
  'capture.privacy':
    'تُقرأ على هذا الهاتف بمحلل بلا اتصال بالشبكة. لا يُرسل شيء إلى أي مكان، ولا يُكتب شيء حتى تحفظ.',
  'capture.discard': 'تجاهل',
  'capture.notNamed': 'بلا اسم',

  'privacy.title': 'الخصوصية',
  'privacy.encrypted': 'قاعدة البيانات مشفّرة على هذا الجهاز',
  'privacy.notEncrypted': 'هذه النسخة لا تشفّر قاعدة البيانات',
  'privacy.whatIsStored': 'ما هو مخزَّن',
  'privacy.whatYouAgreed': 'ما وافقت عليه',
  'privacy.takeItWithYou': 'خذها معك',
  'privacy.exportCsv': 'تصدير CSV',
  'privacy.exportJson': 'تصدير JSON',
  'privacy.delete': 'حذف',
  'privacy.deleteEverything': 'حذف كل شيء',

  'you.title': 'حسابك',
  'you.appearance': 'المظهر',
  'you.system': 'النظام',
  'you.light': 'فاتح',
  'you.dark': 'داكن',
  'you.language': 'اللغة',
  'you.accounts': 'الحسابات',
  'you.committed': 'التزامات قبل الراتب',
  'you.about': 'حول',
  'you.homeCurrency': 'العملة الأساسية',

  'numbers.title': 'الأرقام',
  'numbers.whatRepeats': 'ما يتكرر',
  'numbers.whatChanged': 'ما تغيّر',
  'numbers.corridor': 'الممر',
  'numbers.askYourLedger': 'اسأل سجلك',

  'split.title': 'التقسيم',
  'split.outstanding': 'المستحق',
  'split.settled': 'تمت التسوية',
  'split.shareLink': 'شارك رابطًا',
}

/** Flipped by whoever reviews it, in the same commit as their corrections. */
export const AR_STRINGS_REVIEW: 'unreviewed-by-native-speaker' | 'reviewed' =
  'unreviewed-by-native-speaker'
