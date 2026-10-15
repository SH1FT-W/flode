import {
  dropSupersededManualStart,
  type FlodeMetadata,
  FlodeMetadataSchema,
  type FlowGraph,
  withoutManualStart,
} from '@flode/shared';
import { dump as yamlDump } from 'js-yaml';
import { analyzeTopology, type TopologyAnalysis } from './analyzer/topology';
import { type ValidationResult, validateFlowGraph } from './analyzer/validator';
import { type ParseResult, YamlParser, type YamlParserOptions } from './parser/YamlParser';
import { flodeMetadata } from './save-config';
import type { HAYamlOutput, TranspilerStrategy } from './strategies/base';
import { NativeStrategy } from './strategies/native';
import { StateMachineStrategy } from './strategies/state-machine';

/**
 * Options for YAML generation
 */
export interface YamlOptions {
  /**
   * Indentation level (default: 2)
   */
  indent?: number;
  /**
   * Line width for wrapping (-1 for no wrapping)
   */
  lineWidth?: number;
  /**
   * Force a specific strategy instead of auto-selecting
   */
  forceStrategy?: 'native' | 'state-machine';
}

/**
 * Result of transpilation
 */
export interface TranspileResult {
  /**
   * Whether transpilation succeeded
   */
  success: boolean;
  /**
   * Generated YAML string
   */
  yaml?: string;
  /**
   * Parsed YAML object (automation or script)
   */
  output?: HAYamlOutput;
  /**
   * Topology analysis results
   */
  analysis?: TopologyAnalysis;
  /**
   * Validation errors (if any)
   */
  errors?: string[];
  /**
   * Warnings from transpilation
   */
  warnings: string[];
  /** The strategy that wrote the YAML, as recorded in `_flode_metadata`. */
  strategy?: FlodeMetadata['strategy'];
}

/**
 * Main transpiler class for converting flow graphs to Home Assistant YAML
 */
export class FlowTranspiler {
  private strategies: TranspilerStrategy[] = [new NativeStrategy(), new StateMachineStrategy()];

  /**
   * Validate a flow graph input
   */
  validate(input: unknown): ValidationResult {
    return validateFlowGraph(input);
  }

  /**
   * Analyze the topology of a validated flow graph
   */
  analyzeTopology(flow: FlowGraph): TopologyAnalysis {
    return analyzeTopology(flow);
  }

  /**
   * Transpile a flow graph to Home Assistant YAML
   */
  transpile(input: unknown, options: YamlOptions = {}): TranspileResult {
    const warnings: string[] = [];

    // Step 1: Validate the input
    const validation = this.validate(input);
    if (!validation.success || !validation.graph) {
      return {
        success: false,
        errors: validation.errors.map((e) => e.message),
        warnings,
      };
    }

    const flow = dropSupersededManualStart(validation.graph);
    warnings.push(...validation.warnings.map((w) => w.message));

    // Step 2: Analyze topology
    const analysis = this.analyzeTopology(flow);

    // Step 3: Select strategy
    let strategy: TranspilerStrategy;

    if (options.forceStrategy) {
      const forced = this.strategies.find((s) => s.name === options.forceStrategy);
      if (!forced) {
        return {
          success: false,
          errors: [`Unknown strategy: ${options.forceStrategy}`],
          warnings,
        };
      }
      strategy = forced;

      if (!strategy.canHandle(analysis)) {
        warnings.push(
          `Strategy "${strategy.name}" may not be optimal for this flow topology. ` +
            `Recommended: ${analysis.recommendedStrategy}`
        );
      }
    } else {
      // Auto-select based on topology
      const suitable = this.strategies.find((s) => s.canHandle(analysis));
      if (!suitable) {
        // Fall back to state-machine which handles everything
        strategy = new StateMachineStrategy();
      } else {
        strategy = suitable;
      }
    }

    // Step 4: Generate YAML output (an automation without triggers loses its hidden start again)
    const generated = strategy.generate(flow, analysis);
    const output = generated.automation
      ? { ...generated, automation: withoutManualStart(generated.automation) }
      : generated;
    warnings.push(...output.warnings);

    // Step 5: Inject _flode_metadata metadata with node positions
    const yamlContent = output.automation ?? output.script;
    let yaml: string;

    if (yamlContent && typeof yamlContent === 'object') {
      const metadata = this.generateCafeMetadata(flow, strategy);
      const contentWithMetadata = {
        ...yamlContent,
        variables: {
          // First, include user-defined variables from the flow graph
          ...(flow.userVariables || {}),
          // Then include any variables from the generated YAML (e.g., state machine vars)
          ...(yamlContent.variables || {}),
          // Finally, add _flode_metadata
          _flode_metadata: metadata,
        },
      };

      // Step 6: Serialize to YAML string with metadata
      yaml = yamlDump(contentWithMetadata, {
        indent: options.indent ?? 2,
        lineWidth: options.lineWidth ?? -1,
        quotingType: '"',
        forceQuotes: false,
      });
    } else {
      // Serialize without metadata
      yaml = yamlDump(yamlContent, {
        indent: options.indent ?? 2,
        lineWidth: options.lineWidth ?? -1,
        quotingType: '"',
        forceQuotes: false,
      });
    }

    return {
      success: true,
      yaml,
      output,
      analysis,
      warnings,
      strategy: metadataStrategy(strategy),
    };
  }

  /**
   * Transpile to YAML string directly
   */
  toYaml(input: unknown, options: YamlOptions = {}): string {
    const result = this.transpile(input, options);

    if (!result.success) {
      throw new Error(`Transpilation failed: ${result.errors?.join(', ')}`);
    }

    return result.yaml!;
  }

  /**
   * Force native strategy (for tree-shaped flows)
   */
  toNativeYaml(input: unknown, options: YamlOptions = {}): string {
    return this.toYaml(input, { ...options, forceStrategy: 'native' });
  }

  /**
   * Force state machine strategy (for complex flows)
   */
  toStateMachineYaml(input: unknown, options: YamlOptions = {}): string {
    return this.toYaml(input, { ...options, forceStrategy: 'state-machine' });
  }

  /**
   * Parse Home Assistant YAML back into FlowGraph
   */
  fromYaml(yamlString: string, options: YamlParserOptions = {}): Promise<ParseResult> {
    const parser = new YamlParser(options);
    return parser.parse(yamlString);
  }

  /**
   * Get available strategies
   */
  getStrategies(): Array<{ name: string; description: string }> {
    return this.strategies.map((s) => ({
      name: s.name,
      description: s.description,
    }));
  }

  /**
   * Add a custom strategy
   */
  addStrategy(strategy: TranspilerStrategy): void {
    this.strategies.unshift(strategy); // Add at beginning for priority
  }

  /** FLODE's layout metadata for `flow`, written by `strategy`. */
  private generateCafeMetadata(flow: FlowGraph, strategy: TranspilerStrategy): FlodeMetadata {
    return flodeMetadata(flow, metadataStrategy(strategy));
  }
}

/** `strategy.name` as `_flode_metadata` records it. */
function metadataStrategy(strategy: TranspilerStrategy): FlodeMetadata['strategy'] {
  return FlodeMetadataSchema.shape.strategy.safeParse(strategy.name).data ?? 'native';
}

// Export singleton instance
export const transpiler = new FlowTranspiler();
