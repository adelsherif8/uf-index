// Featherweight EN/Hindi strings — the v1 localization stub, mirroring the web prototype.
export type Lang = 'en' | 'hi';

/**
 * Languages currently offered in the UI.
 *
 * Hindi is written and working, but held back until the copy has been reviewed
 * by a native speaker — a half-translated wellness app reads worse than an
 * English one. Add 'hi' back here to switch it on; nothing else needs changing,
 * and every string already has its Hindi counterpart below.
 */
export const OFFERED_LANGS: Lang[] = ['en'];

const EN = {
  tagline: 'CHARGE YOUR ENERGY',
  tap: 'Tap anywhere to begin',
  cont: 'Continue',
  start: 'Get started',
  skip: 'Skip',
  slides: [
    { title: 'Your energy has a number', body: "UF Index is the world's first index built to measure your energy — how your mind and body actually work together." },
    { title: 'Three minutes to charge it', body: 'Answer a short guided assessment. Every step charges your ring — at 100%, your Index is revealed.' },
    { title: 'Then make it climb', body: "Personal insights, your trend over time, and a UFAS coach when you're ready to push the number up." },
  ],
  bands: { Depleted: 'Depleted', Strained: 'Strained', Balanced: 'Balanced', Energized: 'Energized', Peak: 'Peak' } as Record<string, string>,
};

const HI: typeof EN = {
  tagline: 'अपनी ऊर्जा चार्ज करें',
  tap: 'शुरू करने के लिए टैप करें',
  cont: 'आगे बढ़ें',
  start: 'शुरू करें',
  skip: 'छोड़ें',
  slides: [
    { title: 'आपकी ऊर्जा का एक नंबर है', body: 'UF Index दुनिया का पहला इंडेक्स है जो आपकी ऊर्जा मापता है — आपका मन और शरीर कैसे साथ काम करते हैं।' },
    { title: 'तीन मिनट, एक स्कोर', body: 'छोटा गाइडेड असेसमेंट पूरा करें। हर स्टेप आपकी रिंग को चार्ज करता है — 100% पर आपका Index सामने आता है।' },
    { title: 'फिर इसे ऊपर ले जाएँ', body: 'पर्सनल इनसाइट्स, समय के साथ आपका ट्रेंड, और तैयार होने पर एक UFAS कोच।' },
  ],
  bands: { Depleted: 'ऊर्जाहीन', Strained: 'तनावग्रस्त', Balanced: 'संतुलित', Energized: 'ऊर्जावान', Peak: 'शिखर' },
};

export const STRINGS: Record<Lang, typeof EN> = { en: EN, hi: HI };
export const bandLabel = (lang: Lang, band: string) => STRINGS[lang].bands[band] ?? band;
