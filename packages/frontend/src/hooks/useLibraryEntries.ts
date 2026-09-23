import { isScriptStart } from '@flode/shared';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { InsertItem } from '@/hooks/useInsertNode';
import {
  type CompoundTypeConfig,
  compoundTypes,
  type NodeTypeConfig,
  nodeTypes,
  scriptStartType,
} from '@/lib/node-catalog';
import { useFlowStore } from '@/store/flow-store';

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
 * block library and the command palette's "Insert" group. Scripts have no
 * triggers (their start node takes that place), so they don't offer one.
 */
export function useLibraryEntries(): LibraryEntry[] {
  const { t } = useTranslation(['nodes']);
  const isScript = useFlowStore((s) => s.flowMetadata.kind === 'script');
  const hasScriptStart = useFlowStore((s) => s.nodes.some((n) => isScriptStart(n.data)));
  const offerScriptStart = isScript && !hasScriptStart;
  return useMemo(
    () => [
      // A script whose start node was deleted can get it back here.
      ...(offerScriptStart
        ? [
            {
              id: 'node:script_start',
              group: 'blocks' as const,
              label: t(scriptStartType.labelKey),
              description: t(scriptStartType.descriptionKey),
              config: scriptStartType,
              item: { kind: 'simple' as const, config: scriptStartType },
            },
          ]
        : []),
      ...nodeTypes
        .filter((config) => !(isScript && config.type === 'trigger'))
        .map((config) => ({
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
    [t, isScript, offerScriptStart]
  );
}
