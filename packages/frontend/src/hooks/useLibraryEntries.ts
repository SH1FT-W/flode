import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { InsertItem } from '@/hooks/useInsertNode';
import {
  type CompoundTypeConfig,
  compoundTypes,
  type NodeTypeConfig,
  nodeTypes,
} from '@/lib/node-catalog';

export type LibraryGroup = 'blocks' | CompoundTypeConfig['group'];

export interface LibraryEntry {
  id: string;
  group: LibraryGroup;
  label: string;
  description: string;
  config: NodeTypeConfig | CompoundTypeConfig;
  item: InsertItem;
}

/**
 * Every catalog entry with translated label/description — shared by the
 * block library and the command palette's "Insert" group.
 */
export function useLibraryEntries(): LibraryEntry[] {
  const { t } = useTranslation(['nodes']);
  return useMemo(
    () => [
      ...nodeTypes.map((config) => ({
        id: `node:${config.type}`,
        group: 'blocks' as const,
        label: t(config.labelKey),
        description: t(config.descriptionKey),
        config,
        item: { kind: 'simple' as const, config },
      })),
      ...compoundTypes.map((config) => ({
        id: `block:${config.key}`,
        group: config.group,
        label: t(config.labelKey),
        description: t(config.descriptionKey),
        config,
        item: { kind: 'compound' as const, key: config.key },
      })),
    ],
    [t]
  );
}
