import { describe, expect, it } from 'vitest';
import { LANGUAGES, STRING_TABLES, uiLanguage } from '../strings';

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
