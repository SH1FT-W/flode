import deCommon from './de/common.json';
import deMap from './de/map.json';
import deNodes from './de/nodes.json';
import enCommon from './en/common.json';
import enMap from './en/map.json';
import enNodes from './en/nodes.json';
import esCommon from './es/common.json';
import esMap from './es/map.json';
import esNodes from './es/nodes.json';
import frCommon from './fr/common.json';
import frMap from './fr/map.json';
import frNodes from './fr/nodes.json';
import itCommon from './it/common.json';
import itMap from './it/map.json';
import itNodes from './it/nodes.json';
import nlCommon from './nl/common.json';
import nlMap from './nl/map.json';
import nlNodes from './nl/nodes.json';
import ptCommon from './pt/common.json';
import ptMap from './pt/map.json';
import ptNodes from './pt/nodes.json';

/**
 * The `common`, `nodes` and `map` (Zusammenhänge) i18next namespaces — node summaries, block names
 * and shared labels. Every FLODE UI merges these into its own i18next setup.
 */
export const coreResources = {
  de: { common: deCommon, nodes: deNodes, map: deMap },
  en: { common: enCommon, nodes: enNodes, map: enMap },
  nl: { common: nlCommon, nodes: nlNodes, map: nlMap },
  fr: { common: frCommon, nodes: frNodes, map: frMap },
  es: { common: esCommon, nodes: esNodes, map: esMap },
  it: { common: itCommon, nodes: itNodes, map: itMap },
  pt: { common: ptCommon, nodes: ptNodes, map: ptMap },
} as const;

export type CoreLanguage = keyof typeof coreResources;
