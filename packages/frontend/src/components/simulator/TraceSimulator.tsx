import { FlowTranspiler } from '@flode/transpiler';
import type { Edge } from '@xyflow/react';
import { Play, RotateCcw, Square } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HaSelect } from '@/ha';
import { useNodeLabel } from '@/hooks/useNodeLabel';
import { cn } from '@/lib/utils';
import { useFlowStore } from '@/store/flow-store';

interface ConditionOverrideSelectProps {
  value: boolean | undefined;
  onChange: (value: boolean | undefined) => void;
}

/** "random" / "true" / "false" override picker for a single condition node in the simulator panel. */
function ConditionOverrideSelect({ value, onChange }: ConditionOverrideSelectProps) {
  const { t } = useTranslation(['simulator']);
  const currentValue = value === true ? 'true' : value === false ? 'false' : 'random';
  const handleChange = (val: string) => {
    onChange(val === 'random' ? undefined : val === 'true');
  };

  return (
    <HaSelect
      value={currentValue}
      onChange={(v) => handleChange(String(v))}
      options={[
        { value: 'random', label: t('simulator:trace.random') },
        { value: 'true', label: t('simulator:trace.true') },
        { value: 'false', label: t('simulator:trace.false') },
      ]}
      fallback={
        <Select value={currentValue} onValueChange={handleChange}>
          <SelectTrigger className="h-7 w-24 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="random">{t('simulator:trace.random')}</SelectItem>
            <SelectItem value="true">{t('simulator:trace.true')}</SelectItem>
            <SelectItem value="false">{t('simulator:trace.false')}</SelectItem>
          </SelectContent>
        </Select>
      }
    />
  );
}

export function TraceSimulator() {
  const { t } = useTranslation(['simulator']);
  const {
    nodes,
    edges,
    toFlowGraph,
    isSimulating,
    startSimulation,
    stopSimulation,
    setActiveNode,
    addToExecutionPath,
    clearExecutionPath,
    executionPath,
    simulationSpeed,
  } = useFlowStore();

  const [conditionResults, setConditionResults] = useState<Record<string, boolean>>({});
  const nodeLabel = useNodeLabel();

  const simulate = useCallback(async () => {
    if (nodes.length === 0) return;

    startSimulation();

    try {
      const flowGraph = toFlowGraph();
      const transpiler = new FlowTranspiler();
      const analysis = transpiler.analyzeTopology(flowGraph);

      // Start from entry node
      let currentNodeId: string | null = analysis.entryNodes[0];

      // Follow the first edge from trigger to find the first action node
      const firstEdge = edges.find((e) => e.source === currentNodeId);
      if (firstEdge) {
        currentNodeId = firstEdge.target;
      }

      const maxIterations = 100;
      let iterations = 0;

      while (currentNodeId && currentNodeId !== 'END' && iterations < maxIterations) {
        // Highlight current node
        setActiveNode(currentNodeId);
        addToExecutionPath(currentNodeId);

        // Wait for visualization
        await new Promise((r) => setTimeout(r, simulationSpeed));

        // Find outgoing edges
        const outEdges = edges.filter((e) => e.source === currentNodeId);
        const currentNode = nodes.find((n) => n.id === currentNodeId);

        if (currentNode?.type === 'condition') {
          // For conditions, randomly determine true/false
          const result: boolean = conditionResults[currentNodeId] ?? Math.random() > 0.5;
          const nextEdge: Edge | null =
            outEdges.find((e) => e.sourceHandle === (result ? 'true' : 'false')) || null;
          currentNodeId = nextEdge?.target ?? null;
        } else if (outEdges.length > 0) {
          // For other nodes, follow the first edge
          currentNodeId = outEdges[0].target;
        } else {
          // No outgoing edges - end simulation
          currentNodeId = null;
        }

        iterations++;
      }

      // Clear active node when done
      setActiveNode(null);
    } catch (error) {
      console.error('Simulation error:', error);
    }

    stopSimulation();
  }, [
    nodes,
    edges,
    toFlowGraph,
    startSimulation,
    stopSimulation,
    setActiveNode,
    addToExecutionPath,
    simulationSpeed,
    conditionResults,
  ]);

  const handleStop = useCallback(() => {
    stopSimulation();
    setActiveNode(null);
  }, [stopSimulation, setActiveNode]);

  const handleReset = useCallback(() => {
    clearExecutionPath();
    setConditionResults({});
  }, [clearExecutionPath]);

  // Get condition nodes for manual override
  const conditionNodes = nodes.filter((n) => n.type === 'condition');

  return (
    <div className="h-full space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm">{t('simulator:trace.heading')}</h3>
        <div className="flex gap-1">
          {!isSimulating ? (
            <Button
              variant="outline"
              size="sm"
              onClick={simulate}
              disabled={nodes.length === 0}
              title={t('simulator:trace.start')}
              aria-label={t('simulator:trace.start')}
              className={cn(
                'h-8 w-8 p-0',
                nodes.length === 0
                  ? 'text-muted-foreground'
                  : 'border-success/40 text-success hover:bg-success/10'
              )}
            >
              <Play className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleStop}
              title={t('simulator:trace.stop')}
              aria-label={t('simulator:trace.stop')}
              className="h-8 w-8 border-destructive/40 p-0 text-destructive hover:bg-destructive/10"
            >
              <Square className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            title={t('simulator:trace.reset')}
            aria-label={t('simulator:trace.reset')}
            className="h-8 w-8 p-0"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Condition overrides */}
      {conditionNodes.length > 0 && (
        <div className="space-y-2">
          <Label className="font-medium text-muted-foreground text-xs">
            {t('simulator:trace.conditionOverrides')}
          </Label>
          <div className="space-y-2">
            {conditionNodes.map((node) => (
              <div key={node.id} className="flex items-center justify-between text-xs">
                <span className="mr-2 flex-1 truncate text-muted-foreground">
                  {nodeLabel(node, node.id)}
                </span>
                <ConditionOverrideSelect
                  value={conditionResults[node.id]}
                  onChange={(val) => {
                    if (val === undefined) {
                      setConditionResults((prev) => {
                        const { [node.id]: _, ...rest } = prev;
                        return rest;
                      });
                    } else {
                      setConditionResults((prev) => ({ ...prev, [node.id]: val }));
                    }
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Execution path */}
      {executionPath.length > 0 && (
        <div className="space-y-2">
          <Label className="font-medium text-muted-foreground text-xs">
            {t('simulator:trace.executionPath')}
          </Label>
          <ol className="list-inside list-decimal space-y-1 text-xs">
            {executionPath.map((nodeId, i) => {
              const node = nodes.find((n) => n.id === nodeId);
              return (
                <li
                  key={nodeId}
                  className={cn(
                    'py-0.5',
                    i === executionPath.length - 1 && isSimulating
                      ? 'font-medium text-success'
                      : 'text-muted-foreground'
                  )}
                >
                  {nodeLabel(node, nodeId)}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
