import type { FlowGraph } from '@flode/shared';
import { automationToScriptConfig, isPlainObject, scriptToAutomationConfig } from '@flode/shared';
import { dump as yamlDump, load as yamlLoad } from 'js-yaml';
import type { FlowTranspiler, YamlOptions } from './FlowTranspiler';
import type { ParseResult, YamlParserOptions } from './parser/YamlParser';

export interface ScriptTranspileResult {
  success: boolean;
  /** Script config as HA stores it (`config/script/config/<id>`). */
  config?: Record<string, unknown>;
  yaml?: string;
  errors?: string[];
  warnings: string[];
  /** Strategy the underlying automation was transpiled with. */
  strategy?: string;
}

const YAML_DUMP_OPTIONS = {
  indent: 2,
  lineWidth: -1,
  quotingType: '"',
  forceQuotes: false,
} as const;

/**
 * Transpiles a script flow (one script start node, see `@flode/shared`'s
 * script.ts): as an automation first — so every strategy, the `_flode_metadata`
 * positions and user variables work exactly as for automations — then
 * reshaped into the script config.
 */
export function transpileScript(
  transpiler: FlowTranspiler,
  flow: FlowGraph,
  options: YamlOptions = {}
): ScriptTranspileResult {
  const result = transpiler.transpile(flow, options);
  if (!result.success || !result.yaml) {
    return { success: false, errors: result.errors, warnings: result.warnings };
  }
  const automation = yamlLoad(result.yaml);
  if (!isPlainObject(automation)) {
    return {
      success: false,
      errors: ['Transpilation produced no config'],
      warnings: result.warnings,
    };
  }
  const config = automationToScriptConfig(automation, { icon: flow.metadata?.icon });
  return {
    success: true,
    config,
    yaml: yamlDump(config, {
      ...YAML_DUMP_OPTIONS,
      indent: options.indent ?? 2,
      lineWidth: options.lineWidth ?? -1,
    }),
    warnings: result.warnings,
    strategy: result.output?.strategy,
  };
}

/** Parses a script config into a flow marked as a script (`metadata.kind`). */
export async function parseScript(
  transpiler: FlowTranspiler,
  script: Record<string, unknown>,
  options: YamlParserOptions = {}
): Promise<ParseResult> {
  const result = await transpiler.fromYaml(
    yamlDump(scriptToAutomationConfig(script), YAML_DUMP_OPTIONS),
    options
  );
  if (!result.success || !result.graph) return result;
  const icon = typeof script.icon === 'string' ? script.icon : undefined;
  return {
    ...result,
    graph: {
      ...result.graph,
      metadata: {
        mode: 'single',
        ...result.graph.metadata,
        kind: 'script',
        ...(icon ? { icon } : {}),
      },
    },
  };
}

/**
 * YAML of an automation or a script (e.g. an AI reply) → flow. A script is
 * parsed like a stored script config (`parseScript`).
 */
export async function parseFlowYaml(
  transpiler: FlowTranspiler,
  yaml: string,
  kind: 'automation' | 'script',
  options: YamlParserOptions = {}
): Promise<ParseResult> {
  if (kind === 'automation') return transpiler.fromYaml(yaml, options);
  let config: unknown;
  try {
    config = yamlLoad(yaml);
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
      hadMetadata: false,
    };
  }
  if (!isPlainObject(config)) {
    return {
      success: false,
      errors: ['The reply is not a script config (a YAML mapping)'],
      warnings: [],
      hadMetadata: false,
    };
  }
  return parseScript(transpiler, config, options);
}
