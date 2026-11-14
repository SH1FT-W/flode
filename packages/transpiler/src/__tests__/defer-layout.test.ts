import type { FlowGraph } from '@flode/shared';
import { describe, expect, it } from 'vitest';
import { FlowTranspiler } from '../FlowTranspiler';
import { applyHeuristicLayoutSync } from '../parser/layout';

const transpiler = new FlowTranspiler();

const YAML = `
alias: Motion light
triggers:
  - trigger: state
    entity_id: binary_sensor.motion
    to: "on"
actions:
  - if:
      - condition: state
        entity_id: sun.sun
        state: below_horizon
    then:
      - action: light.turn_on
        target:
          entity_id: light.hall
  - action: notify.notify
    data:
      message: done
`;

async function parse(yaml: string, deferLayout: boolean): Promise<FlowGraph> {
  const result = await transpiler.fromYaml(yaml, { keepBlocks: true, deferLayout });
  if (!result.graph) throw new Error(result.errors?.join('\n'));
  return result.graph;
}

/** The graph without what differs from parse to parse (generated ids). */
function shape(graph: FlowGraph) {
  return {
    direction: graph.direction,
    nodes: graph.nodes.map((node) => ({
      type: node.type,
      position: node.position,
      data: node.data,
    })),
    edges: graph.edges.length,
  };
}

describe('deferLayout: the caller lays out flows without a saved direction', () => {
  it('gives a flow without metadata placeholder positions instead of the ELK layout', async () => {
    const deferred = await parse(YAML, true);
    const laidOut = await parse(YAML, false);
    expect(deferred.nodes.map((node) => node.position)).toEqual(
      applyHeuristicLayoutSync(deferred.nodes, deferred.edges).map((node) => node.position)
    );
    // Only the positions differ.
    const withoutPositions = (graph: FlowGraph) =>
      shape(graph).nodes.map(({ type, data }) => ({ type, data }));
    expect(withoutPositions(deferred)).toEqual(withoutPositions(laidOut));
    expect(deferred.nodes.map((node) => node.position)).not.toEqual(
      laidOut.nodes.map((node) => node.position)
    );
  });

  it('keeps the layout of a flow saved with a direction', async () => {
    const graph = await parse(YAML, false);
    const saved = transpiler.toYaml({ ...graph, direction: 'down' });
    expect(shape(await parse(saved, true))).toEqual(shape(await parse(saved, false)));
  });
});
