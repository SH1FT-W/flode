import deCommon from './de/common.json';
import deMap from './de/map.json';
import deNodes from './de/nodes.json';
import enCommon from './en/common.json';
import enMap from './en/map.json';
import enNodes from './en/nodes.json';

/**
 * The `common`, `nodes` and `map` (Zusammenhänge) i18next namespaces — node summaries, block names
 * and shared labels. Every FLODE UI merges these into its own i18next setup.
 */
export const coreResources = {
  de: { common: deCommon, nodes: deNodes, map: deMap },
  en: { common: enCommon, nodes: enNodes, map: enMap },
} as const;

export type CoreLanguage = keyof typeof coreResources;
