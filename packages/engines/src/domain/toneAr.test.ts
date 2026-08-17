import { describe, expect, it } from 'vitest'
import { AR_REVIEW_STATUS, checkToneAr } from './toneAr'
import { checkTone } from './tone'

const daytime = { hour: 10 }

/**
 * The Arabic gate.
 *
 * These tests prove the *mechanism* — that Arabic copy is checked at all, that it blocks the
 * four categories, and that it is at least as strict as the English gate. They cannot prove the
 * patterns are right, which is a native speaker's judgement and is why the review status is
 * itself asserted below.
 */
describe('the Arabic tone gate', () => {
  it('is honest about not having been reviewed', () => {
    expect(AR_REVIEW_STATUS).toBe('unreviewed-by-native-speaker')
  })

  it('blocks a verdict about the person', () => {
    // "You squandered 5,000 dirhams this month" — a moral charge, not an observation.
    const v = checkToneAr('بذرت 5000 درهم هذا الشهر. هل تريد التفاصيل؟', daytime)
    expect(v.broke).toContain('shame')
  })

  it('blocks anything that names a condition', () => {
    const v = checkToneAr('يبدو أن لديك إدمان على التسوق. هل تريد التفاصيل؟ 500 درهم', daytime)
    expect(v.broke).toContain('diagnosis')
  })

  it('blocks a comment on the body', () => {
    const v = checkToneAr('إنفاقك على الطعام يؤثر على وزنك. هل تريد التفاصيل؟ 500 درهم', daytime)
    expect(v.broke).toContain('body')
  })

  /** The compliance boundary. Regulated by the SCA in the UAE and SEBI in India. */
  it('blocks regulated investment advice', () => {
    const v = checkToneAr('لديك 2000 درهم فائض — استثمر في صندوق مؤشر. هل تريد التفاصيل؟', daytime)
    expect(v.broke).toContain('advice')
  })

  it('requires a way out and a real figure', () => {
    const bare = checkToneAr('أنفقت أكثر من المعتاد', daytime)
    expect(bare.broke).toEqual(expect.arrayContaining(['agency', 'specificity']))
  })

  it('lets a well-formed sentence through', () => {
    const ok = checkToneAr('أنفقت 1,250 درهم على المطاعم هذا الشهر. هل تريد التفاصيل؟', daytime)
    expect(ok.broke).toEqual([])
    expect(ok.allowed).toBe(true)
  })

  it('keeps quiet hours, and lets a screen you opened speak anyway', () => {
    const text = 'أنفقت 1,250 درهم هذا الشهر. هل تريد التفاصيل؟'
    expect(checkToneAr(text, { hour: 2 }).broke).toContain('quiet-hours')
    expect(checkToneAr(text, { hour: 2 }, { solicited: true }).broke).toEqual([])
  })

  it('goes quiet about optimising in supportive mode', () => {
    const v = checkToneAr('قلل إنفاقك على المطاعم. هل تريد التفاصيل؟ 500 درهم', {
      hour: 10,
      supportiveMode: true,
    })
    expect(v.broke).toContain('supportive-mode')
  })

  /**
   * The rule I set for myself when writing patterns in a language I cannot read back: where
   * unsure, block. This asserts the direction rather than any specific pattern — an Arabic gate
   * that were *looser* than the English one would be the guarantee quietly weakening for one
   * language, which is exactly what translating without this would have done.
   */
  it('is never more permissive than the English gate on an equivalent bare sentence', () => {
    const en = checkTone('You spent more than usual', daytime)
    const ar = checkToneAr('أنفقت أكثر من المعتاد', daytime)
    expect(ar.broke.length).toBeGreaterThanOrEqual(en.broke.length)
  })

  it('reports every rule broken, not just the first', () => {
    const v = checkToneAr('بذرت أموالك ولديك إدمان', daytime)
    expect(v.broke.length).toBeGreaterThan(2)
  })
})

/**
 * The clitic case, which is why the patterns carry no word boundaries.
 *
 * Arabic glues conjunctions, prepositions and the article straight onto the word. A gate that
 * only caught the bare form would pass the same accusation with one letter in front of it.
 */
describe('Arabic morphology', () => {
  it.each(['بذرت أموالك', 'وبذرت أموالك', 'فبذرت أموالك'])(
    'catches the same verdict in "%s" however it is glued together',
    (text) => {
      expect(checkToneAr(text, { hour: 10 }).broke).toContain('shame')
    },
  )
})
