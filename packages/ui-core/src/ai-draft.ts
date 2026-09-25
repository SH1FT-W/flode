import type { FlowGraph } from '@flode/shared';
import {
  type AiEntityCandidate,
  type AiFlowKind,
  buildFlowInstructions,
  buildRepairInstructions,
  findUnknownEntityIds,
  selectPromptEntities,
  suggestReplacements,
} from './ai-assist';

/**
 * "Build with AI": describe → HA's AI Task writes YAML → FLODE parses and
 * checks it, and asks once more with the problems if anything is off.
 * Framework-free; the transpiler comes in through `AiDraftDeps` so a UI can
 * load it lazily.
 */

export interface AiDraftParseResult {
  success: boolean;
  graph?: FlowGraph;
  errors?: string[];
}

export interface AiDraftDeps {
  /** One AI Task call (task name, instructions) → the model's text. */
  generate: (taskName: string, instructions: string) => Promise<string>;
  /** The model's reply (YAML, maybe in a code fence) → flow. */
  parse: (reply: string, kind: AiFlowKind) => Promise<AiDraftParseResult>;
  /** Structural problems of a parsed flow, phrased for the model. */
  validate: (graph: FlowGraph) => string[];
}

export interface AiDraftInput {
  description: string;
  kind: AiFlowKind;
  language: string;
  /** Every entity the model may use (ids it invents are reported). */
  entities: AiEntityCandidate[];
}

export interface AiDraftResult {
  graph: FlowGraph;
  /** Entity ids the model used that don't exist in this HA — shown as a warning. */
  unknownEntityIds: string[];
}

interface Evaluation {
  graph?: FlowGraph;
  unknownEntityIds: string[];
  problems: string[];
}

async function evaluate(
  reply: string,
  kind: AiFlowKind,
  knownIds: ReadonlySet<string>,
  deps: AiDraftDeps
): Promise<Evaluation> {
  const result = await deps.parse(reply, kind);
  if (!result.success || !result.graph) {
    return { unknownEntityIds: [], problems: result.errors ?? ['The YAML could not be parsed'] };
  }
  const graph = result.graph;
  const unknownEntityIds = findUnknownEntityIds(
    graph.nodes.map((node) => node.data),
    knownIds
  );
  return {
    graph,
    unknownEntityIds,
    problems: [
      ...deps.validate(graph),
      ...unknownEntityIds.map((id) => `Entity ${id} does not exist in this Home Assistant`),
    ],
  };
}

export async function draftFlowWithAi(
  input: AiDraftInput,
  deps: AiDraftDeps
): Promise<AiDraftResult> {
  const knownIds = new Set(input.entities.map((entity) => entity.entity_id));
  const instructions = buildFlowInstructions({
    description: input.description,
    entities: selectPromptEntities(input.description, input.entities),
    language: input.language,
    kind: input.kind,
  });
  const reply = await deps.generate(`FLODE: build ${input.kind}`, instructions);
  let evaluation = await evaluate(reply, input.kind, knownIds, deps);
  if (evaluation.problems.length > 0) {
    const repaired = await evaluate(
      await deps.generate(
        `FLODE: fix ${input.kind}`,
        buildRepairInstructions({
          instructions,
          reply,
          problems: evaluation.problems,
          suggestions: suggestReplacements(evaluation.unknownEntityIds, input.entities),
        })
      ),
      input.kind,
      knownIds,
      deps
    );
    if (
      repaired.graph &&
      (!evaluation.graph || repaired.problems.length <= evaluation.problems.length)
    ) {
      evaluation = repaired;
    }
  }
  if (!evaluation.graph) throw new Error(evaluation.problems.join('\n'));
  return { graph: evaluation.graph, unknownEntityIds: evaluation.unknownEntityIds };
}
