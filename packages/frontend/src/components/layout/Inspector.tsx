import { Loader2, X } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { PropertyPanel } from '@/components/panels/PropertyPanel';
import { SpeedControl } from '@/components/simulator/SpeedControl';
import { ResizablePanel } from '@/components/ui/resizable-panel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useFlowStore } from '@/store/flow-store';
import { type InspectorTab, useUiStore } from '@/store/ui-store';

// Code-split: YAML and debug tabs load when first opened.
const YamlPreview = lazy(() =>
  import('@/components/panels/YamlPreview').then((m) => ({ default: m.YamlPreview }))
);
const TraceSimulator = lazy(() =>
  import('@/components/simulator/TraceSimulator').then((m) => ({ default: m.TraceSimulator }))
);
const AutomationTraceViewer = lazy(() =>
  import('@/components/simulator/AutomationTraceViewer').then((m) => ({
    default: m.AutomationTraceViewer,
  }))
);

function PanelLoading() {
  return (
    <div className="flex h-full items-center justify-center p-6 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}

function isInspectorTab(value: string): value is InspectorTab {
  return value === 'properties' || value === 'yaml' || value === 'simulator';
}

function DebugTab() {
  const { t } = useTranslation(['common']);
  const simulationSpeed = useFlowStore((s) => s.simulationSpeed);
  const setSimulationSpeed = useFlowStore((s) => s.setSimulationSpeed);
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-border border-b p-4">
        <h4 className="mb-2 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
          {t('labels.debugControls')}
        </h4>
        <SpeedControl speed={simulationSpeed} onSpeedChange={setSimulationSpeed} />
      </div>
      <Suspense fallback={<PanelLoading />}>
        <div className="flex-1 border-border border-b">
          <TraceSimulator />
        </div>
        <div className="flex-1">
          <AutomationTraceViewer />
        </div>
      </Suspense>
    </div>
  );
}

/** Floating, resizable right-hand panel: properties, YAML, debug. */
export function Inspector() {
  const { t } = useTranslation(['common']);
  const tab = useUiStore((s) => s.inspectorTab);
  const setTab = useUiStore((s) => s.setInspectorTab);
  // Small screens: no room for a side panel — it becomes a bottom sheet while a node is selected.
  const hasSelection = useFlowStore((s) => s.selectedNodeId !== null);
  // Closing the sheet = deselecting, through React Flow's own change path so
  // the canvas selection and the store stay in sync.
  const deselectAll = () => {
    const { nodes, onNodesChange } = useFlowStore.getState();
    onNodesChange(nodes.map((n) => ({ type: 'select' as const, id: n.id, selected: false })));
  };

  return (
    <ResizablePanel
      defaultWidth={340}
      minWidth={290}
      maxWidth={640}
      side="right"
      className={cn(
        'overflow-hidden rounded-2xl border border-border bg-card shadow-raised md:my-3 md:mr-3 md:flex',
        hasSelection
          ? 'max-md:fixed max-md:inset-x-2 max-md:bottom-2 max-md:z-30 max-md:h-[55%] max-md:w-auto! max-md:shadow-float'
          : 'hidden'
      )}
    >
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (isInspectorTab(value)) setTab(value);
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex items-center gap-1 border-border border-b p-2">
          <TabsList className="grid flex-1 grid-cols-3">
            <TabsTrigger value="properties">{t('labels.properties')}</TabsTrigger>
            <TabsTrigger value="yaml">{t('labels.yaml')}</TabsTrigger>
            <TabsTrigger value="simulator">{t('labels.debug')}</TabsTrigger>
          </TabsList>
          <button
            type="button"
            onClick={deselectAll}
            aria-label={t('buttons.close')}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted md:hidden"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <TabsContent value="properties" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <PropertyPanel />
          </TabsContent>
          <TabsContent value="yaml" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <Suspense fallback={<PanelLoading />}>
              <YamlPreview />
            </Suspense>
          </TabsContent>
          <TabsContent value="simulator" className="mt-0 min-h-0 flex-1 overflow-hidden">
            <DebugTab />
          </TabsContent>
        </div>
      </Tabs>
    </ResizablePanel>
  );
}
