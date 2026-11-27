import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatLocalizedNumber,
  getDisplayName,
  getInitialLanguage,
  LANGUAGE_OPTIONS,
  LANGUAGE_STORAGE_KEY,
  resolveBrowserLanguage,
  TRANSLATIONS,
  translateCategory,
  translateCountry,
} from './i18n';

test('LANGUAGE_OPTIONS includes all top 10 world languages plus Persian (11 total)', () => {
  assert.equal(LANGUAGE_OPTIONS.length, 11);
  const codes = LANGUAGE_OPTIONS.map((o) => o.code);
  for (const expected of ['en', 'fa', 'zh', 'hi', 'es', 'fr', 'ar', 'bn', 'pt', 'ru', 'ja']) {
    assert.ok(codes.includes(expected as (typeof codes)[number]), `missing ${expected}`);
  }
});

test('TRANSLATIONS has full key parity across all 11 languages without empty strings', () => {
  const enKeys = Object.keys(TRANSLATIONS.en) as Array<keyof typeof TRANSLATIONS.en>;
  for (const opt of LANGUAGE_OPTIONS) {
    const dict = TRANSLATIONS[opt.code];
    for (const key of enKeys) {
      const val = dict[key];
      assert.ok(val !== undefined && val !== null, `${opt.code}.${String(key)} missing`);
      if (typeof val === 'string') {
        assert.ok(val.trim().length > 0, `${opt.code}.${String(key)} empty`);
      }
    }
  }
});

test('resolveBrowserLanguage detects Windows/browser locale and falls back to English', () => {
  assert.equal(resolveBrowserLanguage(['fa-IR', 'en-US']), 'fa');
  assert.equal(resolveBrowserLanguage(['es-MX', 'en']), 'es');
  assert.equal(resolveBrowserLanguage(['zh-Hans-CN']), 'zh');
  assert.equal(resolveBrowserLanguage(['ar-SA']), 'ar');
  assert.equal(resolveBrowserLanguage(['ja']), 'ja');
  assert.equal(resolveBrowserLanguage(['de-DE']), 'en');
  assert.equal(resolveBrowserLanguage([]), 'en');
  assert.equal(resolveBrowserLanguage(null), 'en');
});

test('getInitialLanguage prefers explicit saved choice over browser locale', () => {
  const fakeStorage = {
    getItem: (k: string) => (k === LANGUAGE_STORAGE_KEY ? 'fr' : null),
  };
  assert.equal(getInitialLanguage(fakeStorage, ['fa-IR']), 'fr');

  const emptyStorage = { getItem: () => null };
  assert.equal(getInitialLanguage(emptyStorage, ['fa-IR']), 'fa');
  assert.equal(getInitialLanguage(emptyStorage, ['en-US']), 'en');
});

test('translateCategory, translateCountry, getDisplayName, and formatLocalizedNumber localize cleanly', () => {
  assert.equal(translateCategory('سیاسی', 'en'), 'Political');
  assert.equal(translateCategory('نظامی و جنگ‌افروز', 'es'), 'Militar y belicismo');
  assert.equal(translateCategory('همه', 'ja'), 'すべて');

  assert.equal(translateCountry('ایالات متحده / آفریقای جنوبی', 'en'), 'United States / South Africa');
  assert.equal(translateCountry('ایران', 'fa'), 'ایران');

  const fig = { name: 'دونالد ترامپ', englishName: 'Donald Trump' };
  assert.equal(getDisplayName(fig, 'fa'), 'دونالد ترامپ');
  assert.equal(getDisplayName(fig, 'en'), 'Donald Trump');
  assert.equal(getDisplayName(fig, 'es'), 'Donald Trump');

  assert.equal(formatLocalizedNumber(1840, 'en'), '1,840');
  assert.equal(formatLocalizedNumber(1840, 'fa'), '۱٬۸۴۰');
});
