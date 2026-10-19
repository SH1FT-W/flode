import { describe, expect, it } from 'vitest';
import { coreResources } from '../locales';

type Tree = { [key: string]: string | Tree };

const PLURAL = /_(zero|one|two|few|many|other)$/;

/** Every string of a namespace by its dotted path. */
function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

/** `{{count}}`, `{{name}}` … in a string, sorted (`{{ x }}` with spaces is a Jinja example, not a variable). */
function variables(text: string): string[] {
  return [...text.matchAll(/\{\{([\w.]+)[^}]*\}\}/g)].map((m) => m[1]).sort();
}

/** Keys without their plural suffix, mapped to the English text that stands for them. */
function bases(strings: Map<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, text] of strings) {
    const base = key.replace(PLURAL, '');
    if (!out.has(base) || key.endsWith('_other')) out.set(base, text);
  }
  return out;
}

/** Each namespace of a language, flattened. */
function namespaces(resources: Record<string, Tree>): Map<string, Map<string, string>> {
  return new Map(Object.entries(resources).map(([ns, tree]) => [ns, flatten(tree)]));
}

const english = namespaces(coreResources.en);
const others = Object.entries(coreResources).filter(([language]) => language !== 'en');

describe.each(others)('card texts in %s', (language, resources) => {
  const ours = namespaces(resources);
  const categories = new Intl.PluralRules(language).resolvedOptions().pluralCategories;

  it.each([...english.keys()])('namespace %s has every key, variable and plural form', (ns) => {
    const en = english.get(ns) ?? new Map<string, string>();
    const strings = ours.get(ns) ?? new Map<string, string>();
    const enBases = bases(en);
    expect([...bases(strings).keys()].sort()).toEqual([...enBases.keys()].sort());
    for (const [base, text] of enBases) {
      const plural = [...en.keys()].some((key) => key !== base && key.replace(PLURAL, '') === base);
      const keys = plural ? categories.map((c) => `${base}_${c}`) : [base];
      for (const key of keys) {
        expect(strings.has(key), `${language}/${ns}: ${key} missing`).toBe(true);
        // A plural form may leave out {{count}} ("one minute"), nothing else.
        const want = variables(text).filter((v) => !(plural && v === 'count'));
        const got = variables(strings.get(key) ?? '').filter((v) => !(plural && v === 'count'));
        expect(got, `${language}/${ns}: ${key}`).toEqual(want);
      }
    }
  });

  it('is translated (few strings left as in English)', () => {
    if (language === 'de') return;
    let same = 0;
    let all = 0;
    for (const [ns, en] of english) {
      for (const [key, text] of en) {
        all += 1;
        if (ours.get(ns)?.get(key) === text && /[a-z]{4}/i.test(text)) same += 1;
      }
    }
    expect(same / all).toBeLessThan(0.1);
  });
});
