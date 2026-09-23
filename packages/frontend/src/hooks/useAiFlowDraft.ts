import type { FlowGraph } from '@flode/shared';
import { transpiler, validateFlowGraph } from '@flode/transpiler';
import { useReactFlow } from '@xyflow/react';
import { useCallback } from 'react';
import { useHass } from '@/contexts/HassContext';
import { useAiTask } from '@/hooks/useAiTask';
import {
  type AiEntityCandidate,
  buildFlowInstructions,
  buildRepairInstructions,
  extractYaml,
  findUnknownEntityIds,
  selectPromptEntities,
  suggestReplacements,
} from '@/lib/ai-assist';
import { fitViewOptions } from '@/lib/viewport';
import { useFlowStore } from '@/store/flow-store';
import { getLatestHass } from '@/store/hass-store';
import { useUiStore } from '@/store/ui-store';

export interface AiFlowDraftResult {
  /** Entity ids the model used that don't exist in this HA — shown as a warning. */
  unknownEntityIds: string[];
}

interface Evaluation {
  graph?: FlowGraph;
  unknownEntityIds: string[];
  /** Everything wrong with the reply, phrased for the model. */
  problems: string[];
}

/** Parses a reply and checks it the way FLODE would before saving. */
async function evaluateReply(reply: string, knownIds: ReadonlySet<string>): Promise<Evaluation> {
  const result = await transpiler.fromYaml(extractYaml(reply));
  if (!result.success || !result.graph) {
    return { unknownEntityIds: [], problems: result.errors ?? ['The YAML could not be parsed'] };
  }
  const graph = result.graph;
  const unknownEntityIds = findUnknownEntityIds(
    graph.nodes.map((node) => node.data),
    knownIds
  );
  const problems = [
    ...validateFlowGraph(graph).errors.map((error) => error.message),
    ...unknownEntityIds.map((id) => `Entity ${id} does not exist in this Home Assistant`),
  ];
  return { graph, unknownEntityIds, problems };
}

/**
 * "Describe it, get a flow": asks HA's AI Task for automation YAML, checks it
 * like FLODE's save path would (parser, validation, entity ids), runs one
 * correction round with concrete problems and replacement candidates if
 * needed, and puts the result on the canvas as a new, unsaved draft.
 */
export function useAiFlowDraft() {
  const { generate } = useAiTask();
  const { getAreaNameForEntity } = useHass();
  const { fitView } = useReactFlow();

  return useCallback(
    async (description: string): Promise<AiFlowDraftResult> => {
      const hass = getLatestHass();
      const states = hass?.states ?? {};
      const knownIds = new Set(Object.keys(states));
      const candidates: AiEntityCandidate[] = Object.values(states).map((entity) => {
        const name = entity.attributes?.friendly_name;
        return {
          entity_id: entity.entity_id,
          name: typeof name === 'string' ? name : entity.entity_id,
          area: getAreaNameForEntity(entity.entity_id) ?? undefined,
        };
      });
      const instructions = buildFlowInstructions({
        description,
        entities: selectPromptEntities(description, candidates),
        language: hass?.language ?? 'en',
      });

      const reply = await generate('FLODE: build automation', instructions);
      let evaluation = await evaluateReply(reply, knownIds);
      if (evaluation.problems.length > 0) {
        const repaired = await evaluateReply(
          await generate(
            'FLODE: fix automation',
            buildRepairInstructions({
              instructions,
              reply,
              problems: evaluation.problems,
              suggestions: suggestReplacements(evaluation.unknownEntityIds, candidates),
            })
          ),
          knownIds
        );
        // Keep the correction only if it parses and isn't worse.
        if (
          repaired.graph &&
          (!evaluation.graph || repaired.problems.length <= evaluation.problems.length)
        ) {
          evaluation = repaired;
        }
      }
      const { graph } = evaluation;
      if (!graph) throw new Error(evaluation.problems.join('\n'));

      const flow = useFlowStore.getState();
      flow.reset();
      flow.fromFlowGraph(graph);
      // A draft is unsaved work — without a snapshot `hasRealChanges()` counts its nodes.
      useFlowStore.setState({ originalSnapshot: null });
      useUiStore.getState().setView('editor');
      setTimeout(() => void fitView(fitViewOptions()), 150);

      return { unknownEntityIds: evaluation.unknownEntityIds };
    },
    [generate, getAreaNameForEntity, fitView]
  );
}
