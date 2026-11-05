import { describe, expect, it } from 'vitest';
import { mapT } from '../i18n';
import { LANGUAGES, STRING_TABLES, t, uiLanguage } from '../strings';

/** `{n}`, `{type}` … in a string, sorted. */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

const english = Object.entries(STRING_TABLES.en);

describe('UI languages', () => {
  it('maps HA languages onto FLODE ones', () => {
    expect(uiLanguage('de')).toBe('de');
    expect(uiLanguage('pt-BR')).toBe('pt');
    expect(uiLanguage('nl')).toBe('nl');
    expect(uiLanguage('pl')).toBe('en');
    expect(uiLanguage(undefined)).toBe('en');
  });

  it('shows Chinese only for Simplified Chinese', () => {
    for (const simplified of ['zh', 'zh-Hans', 'zh-CN', 'zh-SG', 'zh-hans-CN']) {
      expect(uiLanguage(simplified), simplified).toBe('zh');
    }
    for (const traditional of ['zh-Hant', 'zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant-TW']) {
      expect(uiLanguage(traditional), traditional).toBe('en');
    }
    // UI strings and the i18next texts of @flode/ui-core follow the same choice.
    expect(t('zh-Hant', 'continue')).toBe(STRING_TABLES.en.continue);
    expect(mapT('zh-Hant', 'reload')).toBe('Reload');
    expect(mapT('zh-Hans', 'reload')).toBe(mapT('zh', 'reload'));
    expect(mapT('zh', 'reload')).not.toBe('Reload');
  });

  it.each(
    LANGUAGES.filter((language) => language !== 'en')
  )('%s keeps every placeholder and is translated', (language) => {
    const table = Object.entries(STRING_TABLES[language]);
    const ours = new Map(table);
    let same = 0;
    for (const [key, text] of english) {
      expect(placeholders(ours.get(key) ?? ''), `${language}: ${key}`).toEqual(placeholders(text));
      if (ours.get(key) === text && /[a-z]{4}/i.test(text)) same += 1;
    }
    expect(same / english.length).toBeLessThan(0.1);
  });
});
