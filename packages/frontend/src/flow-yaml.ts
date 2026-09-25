import { type FlowGraph, isPlainObject } from '@flode/shared';
import { dump as yamlDump } from 'js-yaml';
import type { FlowKind } from './ha';

function loadTranspiler() {
  return import('@flode/transpiler');
}

/** HA's YAML style (what HA's own editor shows). */
export const YAML_STYLE = {
  indent: 2,
  lineWidth: -1,
  quotingType: '"',
  forceQuotes: false,
} as const;

/** The open flow as HA YAML — what saving would write, without FLODE's layout metadata. */
export async function flowYaml(graph: FlowGraph, kind: FlowKind): Promise<string> {
  const { FlowTranspiler, buildAutomationSaveConfig, transpileScript } = await loadTranspiler();
  const transpiler = new FlowTranspiler();
  const result =
    kind === 'script'
      ? transpileScript(transpiler, graph)
      : buildAutomationSaveConfig(transpiler, graph, {
          alias: graph.name,
          description: graph.description ?? '',
        });
  if (!result.success || !result.config) throw new Error(result.errors?.join(', ') ?? 'transpile');
  const config: Record<string, unknown> = { ...result.config };
  if (isPlainObject(config.variables)) {
    const { _flode_metadata: _meta, ...variables } = config.variables;
    if (Object.keys(variables).length > 0) config.variables = variables;
    else delete config.variables;
  }
  return yamlDump(config, YAML_STYLE);
}
