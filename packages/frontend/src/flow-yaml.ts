import { type FlowGraph, isPlainObject } from '@flode/shared';
import type { FlowKind } from './ha';

function loadTranspiler() {
  return import('@flode/transpiler');
}

/** The open flow as HA's config — what saving would write, without FLODE's layout metadata. */
export async function flowConfig(
  graph: FlowGraph,
  kind: FlowKind
): Promise<Record<string, unknown>> {
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
  return config;
}

/** The open flow as HA YAML (`flowConfig`) — what HA's own YAML editor shows. */
export async function flowYaml(graph: FlowGraph, kind: FlowKind): Promise<string> {
  const [{ dumpHaYaml }, config] = await Promise.all([loadTranspiler(), flowConfig(graph, kind)]);
  return dumpHaYaml(config);
}
