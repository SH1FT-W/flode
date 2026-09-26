import {
  type FlowGraph,
  FlowMetadataSchema,
  type FlowNode,
  isPlainObject,
  isScriptStart,
  SCRIPT_START_TRIGGER,
} from '@flode/shared';
import { dump as yamlDump } from 'js-yaml';
import { css, html, LitElement, nothing, type PropertyValues } from 'lit';
import './flode-canvas';
import './flode-inspector';
import './flode-debug';
import './flode-ai';
import './flode-assist';
import './flode-palette';
import './flode-map';
import './flode-templates';
import './flode-runfrom';
import './flode-shortcuts';
import { chooseAiTask, mergeAutomationGraphs, randomId } from '@flode/ui-core';
import type { AddAt, CanvasMenuDetail, FlodeCanvas } from './flode-canvas';
import { downloadFlowJson, type ImportedFlow, pickFlowJson } from './flode-io';
import type { PaletteEntry } from './flode-palette';
import {
  addNode,
  connect,
  copyNode,
  disconnectNode,
  ensureScriptEntry,
  freePosition,
  NODE_HEIGHT,
  NODE_WIDTH,
  removeNode,
  scriptStartId,
  setNodeStep,
  toggleNodeEnabled,
  updateNodeData,
  visibleGraph,
} from './flow-model';
import { flowYaml } from './flow-yaml';
import {
  type AutomationListItem,
  type AutomationSettings,
  applyRegistryUpdate,
  confirmUnsavedChanges,
  ensureAutomationEditors,
  errorMessage,
  type FlowKind,
  getRegistryEntry,
  getRunLogbook,
  type HomeAssistant,
  listFlows,
  loadFlowConfig,
  loadSummaryTranslations,
  navigateInHa,
  newScriptId,
  promptAutomationDialog,
  type RegistryUpdate,
  runScript,
  saveFlowConfig,
  waitForAutomationEntity,
} from './ha';
import { type StepKind, stepToNode } from './ha-step';
import { mapT } from './i18n';
import { LOGBOOK_POLL_MS, type ManualRun } from './manual-runs';
import { NODE_META, summarize, typeLabel } from './node-meta';
import { labelWithHint, matchShortcut, type ShortcutId, shortcutHint } from './shortcuts';
import { t } from './strings';
import { type EditorTab, type OpenFlow, readTabs, type SaveState, writeTabs } from './tabs';
import type { RunMark } from './trace';
import { isNarrow } from './viewport';

const INSPECTOR_WIDTH_KEY = 'flode3.inspectorWidth';
const INSPECTOR_MIN = 300;

/** Width the user dragged the inspector to last time (per browser). */
function readInspectorWidth(): number | null {
  try {
    const value = Number(window.localStorage.getItem(INSPECTOR_WIDTH_KEY));
    return Number.isFinite(value) && value >= INSPECTOR_MIN ? value : null;
  } catch {
    return null;
  }
}

const AI_SETUP_HIDDEN_KEY = 'flode3.aiSetupHidden';
const MINIMAP_KEY = 'flode3.minimap';

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Storage blocked — the hint just shows again next time.
  }
}

function storeInspectorWidth(width: number | null): void {
  try {
    if (width === null) window.localStorage.removeItem(INSPECTOR_WIDTH_KEY);
    else window.localStorage.setItem(INSPECTOR_WIDTH_KEY, String(Math.round(width)));
  } catch {
    // Storage blocked (private mode …) — the width just isn't remembered.
  }
}

/** What the start screen lists: automations, scripts or the Zusammenhänge map. */
type HomeView = FlowKind | 'map';

/** Stable empty list for HA's hidden add lists (a new array per render would reset them). */
const NO_STEPS: readonly unknown[] = [];
const ADD_LIST_PROP: Record<StepKind, string> = {
  trigger: 'triggers',
  condition: 'conditions',
  action: 'actions',
};
const HISTORY_LIMIT = 100;

/** The transpiler (with elkjs) is only needed once a flow is opened. */
function loadTranspiler() {
  return import('@flode/transpiler');
}

interface MenuItem {
  id: string;
  icon: string;
  label: string;
  run: () => void;
  /** Keyboard shortcut shown on the right. */
  hint?: string;
}
type MenuEntry = MenuItem | 'divider';

/** A card type inside a sentence — English lowercases it ("Add action here"). */
function typeName(kind: StepKind, language: string): string {
  const label = typeLabel(kind, language);
  return language.startsWith('de') ? label : label.toLowerCase();
}

/** The key goes to a text field / HA's code editor (CodeMirror is contenteditable). */
function isTyping(event: KeyboardEvent): boolean {
  return event
    .composedPath()
    .some(
      (el) =>
        el instanceof HTMLElement &&
        (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
    );
}

/** The import layout (ELK, from the transpiler) over the visible cards — "Aufräumen". */
async function layoutGraph(graph: FlowGraph): Promise<FlowGraph> {
  const { applyHeuristicLayout } = await loadTranspiler();
  const size = { width: NODE_WIDTH, height: NODE_HEIGHT };
  const shown = visibleGraph(graph);
  const laidOut = await applyHeuristicLayout(
    shown.nodes,
    shown.edges,
    Object.fromEntries(shown.nodes.map((node) => [node.id, size]))
  );
  const positions = new Map(laidOut.map((node) => [node.id, node.position]));
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      position: positions.get(node.id) ?? node.position,
    })),
  };
}

/**
 * FLODE's panel (`/flode`): automation and script list → canvas editor.
 * Lit + Home Assistant's own components end to end; saving goes through the
 * transpiler, so what lands in HA is plain, native automation/script YAML.
 */
export class FlodePanel extends LitElement {
  static properties = {
    hass: { attribute: false },
    narrow: { attribute: false },
    query: { state: true },
    flow: { state: true },
    selectedId: { state: true },
    saveState: { state: true },
    message: { state: true },
    inspectorError: { state: true },
    addOpen: { state: true },
    inspectorWidth: { state: true },
    tabs: { state: true },
    activeTabId: { state: true },
    showHome: { state: true },
    homeKind: { state: true },
    debugOpen: { state: true },
    aiEntityId: { state: true },
    aiNeedsDefault: { state: true },
    aiOpen: { state: true },
    assistOpen: { state: true },
    paletteOpen: { state: true },
    shortcutsOpen: { state: true },
    minimapVisible: { state: true },
    yamlViewOpen: { state: true },
    canvasMenu: { state: true },
    templatesOpen: { state: true },
    runFromId: { state: true },
    manualRuns: { state: true },
    yamlImportOpen: { state: true },
    mergeMode: { state: true },
    mergeIds: { state: true },
    templateVars: { state: true },
    aiSetupHidden: { state: true },
    runMarks: { state: true },
    activeRunNode: { state: true },
  };

  declare hass: HomeAssistant | undefined;
  declare narrow: boolean;
  declare query: string;
  declare flow: OpenFlow | null;
  declare selectedId: string | null;
  declare saveState: SaveState;
  declare message: string | null;
  declare inspectorError: string | null;
  declare addOpen: boolean;
  /** User-dragged inspector width in px; `null` = responsive default. */
  declare inspectorWidth: number | null;
  /** Open automations. The active one's live state is in `flow`, `past` … (parked here on switch). */
  declare tabs: EditorTab[];
  declare activeTabId: string | null;
  /** The start screen is showing while tabs stay open behind it. */
  declare showHome: boolean;
  /** Start screen list: automations or scripts. */
  declare homeKind: HomeView;
  /** The right panel shows the runs (HA's trace timeline) instead of the inspector. */
  declare debugOpen: boolean;
  /** HA's default AI Task for data generation (null = no AI set up / chosen). */
  declare aiEntityId: string | null;
  declare aiNeedsDefault: boolean;
  declare aiOpen: boolean;
  /** The right panel shows the AI assistant for the open flow. */
  declare assistOpen: boolean;
  declare paletteOpen: boolean;
  declare shortcutsOpen: boolean;
  declare minimapVisible: boolean;
  declare yamlViewOpen: boolean;
  /** Right-click menu on the canvas (null = closed). */
  declare canvasMenu: CanvasMenuDetail | null;
  /** ⌘C/⌘V — FLODE's own card clipboard (works across tabs). */
  private copiedNode: FlowNode | null = null;
  declare templatesOpen: boolean;
  /** The block "run from here" was chosen for (its confirmation is open). */
  declare runFromId: string | null;
  /** "Run from here" executions of this page view (newest first). */
  declare manualRuns: ManualRun[];
  declare yamlImportOpen: boolean;
  /** Start screen: picking automations to merge. */
  declare mergeMode: boolean;
  declare mergeIds: string[];
  /** Variables handed over from a run step ("test a template with these"). */
  declare templateVars: Record<string, unknown> | null;
  declare aiSetupHidden: boolean;
  declare runMarks: Map<string, RunMark> | null;
  declare activeRunNode: string | null;

  private past: FlowGraph[] = [];
  private future: FlowGraph[] = [];

  constructor() {
    super();
    this.narrow = false;
    this.query = '';
    this.flow = null;
    this.selectedId = null;
    this.saveState = 'saved';
    this.message = null;
    this.inspectorError = null;
    this.addOpen = false;
    this.inspectorWidth = readInspectorWidth();
    this.tabs = [];
    this.activeTabId = null;
    this.showHome = true;
    this.homeKind = 'automation';
    this.debugOpen = false;
    this.aiEntityId = null;
    this.aiNeedsDefault = false;
    this.aiOpen = false;
    this.assistOpen = false;
    this.paletteOpen = false;
    this.shortcutsOpen = false;
    this.minimapVisible = readFlag(MINIMAP_KEY);
    this.yamlViewOpen = false;
    this.canvasMenu = null;
    this.templatesOpen = false;
    this.templateVars = null;
    this.runFromId = null;
    this.manualRuns = [];
    this.yamlImportOpen = false;
    this.mergeMode = false;
    this.mergeIds = [];
    this.aiSetupHidden = readFlag(AI_SETUP_HIDDEN_KEY);
    this.runMarks = null;
    this.activeRunNode = null;
    this.restoreTabs();
  }

  // ---- remembered tabs --------------------------------------------------------

  private persistTimer: number | undefined;

  /** Tabs from before a reload; unchanged ones are refreshed from HA when shown. */
  private restoreTabs(): void {
    const stored = readTabs();
    if (!stored || stored.tabs.length === 0) return;
    this.tabs = stored.tabs;
    const active = stored.tabs.find((tab) => tab.id === stored.activeTabId);
    if (active) this.activateTab(active);
    this.showHome = stored.showHome;
  }

  private persistTabs(): void {
    window.clearTimeout(this.persistTimer);
    this.persistTimer = undefined;
    const viewport = this.canvas?.viewport;
    writeTabs({
      activeTabId: this.activeTabId,
      showHome: this.showHome,
      tabs: this.tabs.map((tab) =>
        tab.id === this.activeTabId && this.flow
          ? {
              ...tab,
              flow: this.flow,
              saveState: this.saveState,
              viewport: this.showHome ? tab.viewport : (viewport ?? tab.viewport),
            }
          : tab
      ),
    });
  }

  private schedulePersist(): void {
    window.clearTimeout(this.persistTimer);
    this.persistTimer = window.setTimeout(() => this.persistTabs(), 400);
  }

  private onPageHide = (): void => this.persistTabs();

  /** HA has no event when the AI default changes — re-read it whenever the window regains focus. */
  private onWindowFocus = (): void => void this.loadAiChoice();

  private async loadAiChoice(): Promise<void> {
    const hass = this.hass;
    if (!hass) return;
    const choice = await chooseAiTask((message) => hass.callWS(message), hass.states);
    this.aiEntityId = choice.entityId;
    this.aiNeedsDefault = choice.needsDefault;
  }

  private updateManualRun(id: string, patch: Partial<ManualRun>): void {
    this.manualRuns = this.manualRuns.map((run) => (run.id === id ? { ...run, ...patch } : run));
  }

  private notify(message: string): void {
    this.dispatchEvent(
      new CustomEvent('hass-notification', { detail: { message }, bubbles: true, composed: true })
    );
  }

  /**
   * Runs the confirmed "run from here" with HA's `execute_script` and lists it
   * under "Runs" (HA keeps no trace for it), then reads what HA's logbook
   * recorded for its context.
   */
  private async onRunStart(
    event: CustomEvent<{ sequence: unknown[]; nodeIds: string[]; label: string }>
  ): Promise<void> {
    const hass = this.hass;
    const flow = this.flow;
    if (!hass || !flow) return;
    const { sequence, nodeIds, label } = event.detail;
    const language = this.language;
    const run: ManualRun = {
      id: randomId(),
      graphId: flow.graph.id,
      label,
      startedAt: new Date().toISOString(),
      nodeIds,
      status: 'running',
      logbook: [],
    };
    this.manualRuns = [run, ...this.manualRuns];
    this.debugOpen = true;
    this.assistOpen = false;
    this.notify(t(language, 'runFromStarted').replace('{name}', label));
    try {
      // Resolves once the sequence has finished (delays included).
      const result = await hass.callWS<{ context?: { id?: string } }>({
        type: 'execute_script',
        sequence,
      });
      const contextId = result?.context?.id;
      this.updateManualRun(run.id, { status: 'done', ...(contextId ? { contextId } : {}) });
      this.notify(t(language, 'runFromDone').replace('{name}', label));
      if (contextId) {
        for (const delay of LOGBOOK_POLL_MS) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          this.updateManualRun(run.id, {
            logbook: await getRunLogbook(hass, run.startedAt, contextId),
          });
        }
      }
    } catch (error) {
      this.updateManualRun(run.id, { status: 'error', error: errorMessage(error) });
      this.notify(`${t(language, 'runFromFailed')} ${errorMessage(error)}`);
    }
  }

  // ---- import / export / copy / merge ------------------------------------------

  /** An imported flow (pasted YAML, FLODE file) opens as a new, unsaved draft. */
  private openImported(flow: ImportedFlow): void {
    const name =
      flow.graph.name || t(this.language, flow.kind === 'script' ? 'newScript' : 'newAutomation');
    this.yamlImportOpen = false;
    this.openTab({
      item: {
        kind: flow.kind,
        entityId: '',
        configId: String(Date.now()),
        name,
        enabled: true,
        lastTriggered: null,
      },
      graph: { ...flow.graph, id: randomId(), name },
      isNew: true,
      registryEntry: null,
    });
    this.notify(t(this.language, 'ioImported'));
  }

  private async importJson(): Promise<void> {
    try {
      const flow = await pickFlowJson();
      if (flow) this.openImported(flow);
    } catch (error) {
      this.notify(`${t(this.language, 'ioImportFailed')} ${errorMessage(error)}`);
    }
  }

  private async copyYaml(): Promise<void> {
    const flow = this.flow;
    if (!flow) return;
    try {
      await navigator.clipboard.writeText(await flowYaml(flow.graph, flow.item.kind));
      this.notify(t(this.language, 'ioYamlCopied'));
    } catch (error) {
      this.notify(errorMessage(error));
    }
  }

  /** "Save as copy": the same flow as a new automation/script — HA's save dialog asks for the name. */
  private saveCopy(): void {
    const flow = this.flow;
    if (!flow) return;
    const name = t(this.language, 'ioCopyOf').replace('{name}', flow.graph.name);
    this.openTab({
      item: { ...flow.item, entityId: '', configId: String(Date.now()), name, lastTriggered: null },
      graph: { ...structuredClone(flow.graph), id: randomId(), name },
      isNew: true,
      registryEntry: null,
    });
    void this.updateComplete.then(() => this.save());
  }

  private async mergeSelected(): Promise<void> {
    const hass = this.hass;
    if (!hass || this.mergeIds.length < 2) return;
    const items = listFlows(hass, 'automation').filter((item) =>
      this.mergeIds.includes(item.configId)
    );
    this.message = t(this.language, 'loading');
    try {
      const sources = [];
      for (const item of items) {
        const flow = await this.loadFlow(hass, item);
        sources.push({
          graph: flow.graph,
          automationId: item.configId,
          entityId: item.entityId,
          alias: item.name,
        });
      }
      // Laid out as one flow right away — not the source automations side by side.
      const merged = await layoutGraph(mergeAutomationGraphs(sources));
      const name = t(this.language, 'mergeName').replace(
        '{names}',
        items.map((item) => item.name).join(' + ')
      );
      this.mergeMode = false;
      this.mergeIds = [];
      this.message = null;
      this.openTab({
        item: {
          kind: 'automation',
          entityId: '',
          configId: String(Date.now()),
          name,
          enabled: true,
          lastTriggered: null,
        },
        graph: { ...merged, name },
        isNew: true,
        registryEntry: null,
      });
      this.notify(t(this.language, 'mergeDone'));
    } catch (error) {
      this.message = `${t(this.language, 'mergeFailed')} ${errorMessage(error)}`;
    }
  }

  /** HA's dropdown menu: the ⋮ menus, and (with its own anchor) the right-click menu. */
  private renderMenu(
    entries: MenuEntry[],
    trigger: unknown = html`<ha-icon-button slot="trigger" .label=${t(this.language, 'ioMore')}>
      <ha-icon icon="mdi:dots-vertical"></ha-icon>
    </ha-icon-button>`,
    options: { open?: boolean; placement?: string; onHide?: () => void } = {}
  ) {
    const items = entries.filter((entry): entry is MenuItem => entry !== 'divider');
    return html`<ha-dropdown
      placement=${options.placement ?? 'bottom-end'}
      .open=${options.open ?? false}
      @wa-select=${(event: CustomEvent<{ item: { value: string } }>) =>
        items.find((item) => item.id === event.detail.item.value)?.run()}
      @wa-after-hide=${() => options.onHide?.()}
    >
      ${trigger}
      ${entries.map((entry) =>
        entry === 'divider'
          ? html`<wa-divider></wa-divider>`
          : html`<ha-dropdown-item .value=${entry.id}>
              <ha-icon slot="icon" .icon=${entry.icon}></ha-icon>${entry.label}
              ${entry.hint ? html`<span slot="details">${entry.hint}</span>` : nothing}
            </ha-dropdown-item>`
      )}
    </ha-dropdown>`;
  }

  /**
   * The canvas takes left clicks for panning, so HA's menu never hears the
   * "click outside" — close it here (captured before the canvas sees it).
   */
  private closeCanvasMenuOutside = {
    capture: true,
    handleEvent: (event: PointerEvent): void => {
      if (!this.canvasMenu || event.button === 2) return;
      const menu = this.renderRoot.querySelector('.work > ha-dropdown');
      if (menu && event.composedPath().includes(menu)) return;
      this.canvasMenu = null;
    },
  };

  /** Right-click on a card or the empty canvas — the same actions as the shortcuts. */
  private renderCanvasMenu(flow: OpenFlow) {
    const menu = this.canvasMenu;
    if (!menu) return nothing;
    const language = this.language;
    const node = flow.graph.nodes.find((n) => n.id === menu.nodeId);
    const hinted = (id: ShortcutId, icon: string, label: string, run: () => void): MenuItem => ({
      id,
      icon,
      label,
      run,
      hint: shortcutHint(id),
    });
    const entries: MenuEntry[] = [];
    if (node && !isScriptStart(node.data)) {
      const off = 'enabled' in node.data && node.data.enabled === false;
      entries.push(
        hinted('copy', 'mdi:content-copy', t(language, 'copyCard'), () => {
          this.copiedNode = structuredClone(node);
        }),
        hinted('duplicate', 'mdi:content-duplicate', t(language, 'duplicateCard'), () =>
          this.duplicateCard(node)
        ),
        hinted(
          'toggleEnabled',
          off ? 'mdi:toggle-switch-outline' : 'mdi:toggle-switch-off-outline',
          t(language, off ? 'enableCard' : 'disableCard'),
          () => this.toggleCard(node)
        ),
        'divider',
        {
          id: 'runFrom',
          icon: 'mdi:play-circle-outline',
          label: t(language, 'runFrom'),
          run: () => {
            this.runFromId = node.id;
          },
        }
      );
      if (flow.graph.edges.some((e) => e.source === node.id || e.target === node.id)) {
        entries.push({
          id: 'disconnect',
          icon: 'mdi:link-variant-off',
          label: t(language, 'disconnectCard'),
          run: () => this.commit(disconnectNode(flow.graph, node.id)),
        });
      }
      entries.push(
        'divider',
        hinted('delete', 'mdi:delete-outline', t(language, 'delete'), () => {
          this.commit(removeNode(flow.graph, node.id));
          this.selectedId = null;
        })
      );
    } else {
      const copied = this.copiedNode;
      if (copied) {
        entries.push(
          hinted('paste', 'mdi:content-paste', t(language, 'pasteCard'), () =>
            this.duplicateCard(copied, menu.position)
          ),
          'divider'
        );
      }
      const kinds =
        flow.item.kind === 'script'
          ? (['condition', 'action'] as const)
          : (['trigger', 'condition', 'action'] as const);
      for (const kind of kinds) {
        entries.push({
          id: `add-${kind}`,
          icon: NODE_META[kind].icon,
          label: t(language, 'addHere').replace('{type}', typeName(kind, language)),
          run: () => void this.openAddDialog(kind, { position: menu.position }),
        });
      }
      entries.push(
        'divider',
        hinted('fit', 'mdi:fit-to-screen-outline', t(language, 'fit'), () =>
          this.canvas?.fitView()
        ),
        hinted('tidy', 'mdi:auto-fix', t(language, 'tidy'), () => void this.tidy())
      );
    }
    return this.renderMenu(
      entries,
      html`<span
        slot="trigger"
        class="menu-anchor"
        style="left: ${menu.clientX}px; top: ${menu.clientY}px"
      ></span>`,
      {
        open: true,
        placement: 'bottom-start',
        onHide: () => {
          this.canvasMenu = null;
        },
      }
    );
  }

  private runFromLabel(): string {
    const node = this.flow?.graph.nodes.find((n) => n.id === this.runFromId);
    return node ? summarize(node, this.hass).title : '';
  }

  private openTemplates(variables: Record<string, unknown> | null): void {
    this.templateVars = variables;
    this.templatesOpen = true;
  }

  /** Everything ⌘K offers right now: commands, adding blocks (editor), opening flows. */
  private paletteEntries(): PaletteEntry[] {
    const language = this.language;
    const hass = this.hass;
    const flow = this.flow && !this.showHome ? this.flow : null;
    const entries: PaletteEntry[] = [];
    const command = (id: string, label: string, icon: string, run: () => void) => {
      const hint = shortcutHint(id);
      entries.push({ id, group: 'commands', label, icon, run, ...(hint ? { hint } : {}) });
    };
    if (flow) {
      if (this.saveState === 'unsaved')
        command('save', t(language, 'save'), 'mdi:content-save-outline', () => void this.save());
      if (this.aiEntityId)
        command('assist', t(language, 'assistButton'), 'mdi:creation', () => {
          this.assistOpen = true;
          this.debugOpen = false;
        });
      if (!flow.isNew)
        command('runs', t(language, 'showRuns'), 'mdi:timeline-clock-outline', () => {
          this.debugOpen = true;
          this.assistOpen = false;
        });
      if (flow.item.kind === 'script' && !flow.isNew)
        command('run', t(language, 'run'), 'mdi:play', () => void this.runSavedScript());
      if (this.past.length > 0) command('undo', t(language, 'undo'), 'mdi:undo', () => this.undo());
      if (this.future.length > 0)
        command('redo', t(language, 'redo'), 'mdi:redo', () => this.redo());
      command('tidy', t(language, 'tidy'), 'mdi:auto-fix', () => void this.tidy());
      command('fit', t(language, 'fit'), 'mdi:fit-to-screen-outline', () => this.canvas?.fitView());
      command('minimap', t(language, 'minimap'), 'mdi:map-outline', () => this.toggleMinimap());
      const selected = this.selectedCard();
      if (selected) {
        command('duplicate', t(language, 'duplicateCard'), 'mdi:content-duplicate', () =>
          this.duplicateCard(selected)
        );
        command(
          'toggleEnabled',
          t(language, 'toggleEnabledCard'),
          'mdi:toggle-switch-off-outline',
          () => this.toggleCard(selected)
        );
      }
      command(
        'rename',
        t(language, 'rename'),
        'mdi:rename-outline',
        () => void this.editSettings('alias')
      );
      command(
        'mode',
        t(language, 'mode'),
        'mdi:debug-step-over',
        () => void this.editSettings('mode')
      );
      command('home', t(language, 'paletteHome'), 'mdi:home-outline', () => {
        this.parkActiveTab();
        this.showHome = true;
      });
      const kinds: readonly StepKind[] =
        flow.item.kind === 'script' ? ['condition', 'action'] : ['trigger', 'condition', 'action'];
      for (const kind of kinds) {
        entries.push({
          id: `add-${kind}`,
          group: 'add',
          label: `${typeLabel(kind, language)} …`,
          icon: NODE_META[kind].icon,
          run: () => void this.openAddDialog(kind),
        });
      }
    }
    command('importYaml', t(language, 'ioImportYaml'), 'mdi:code-braces-box', () => {
      this.yamlImportOpen = true;
    });
    command(
      'importJson',
      t(language, 'ioImportJson'),
      'mdi:file-import-outline',
      () => void this.importJson()
    );
    if (flow) {
      command('saveCopy', t(language, 'ioSaveCopy'), 'mdi:content-duplicate', () =>
        this.saveCopy()
      );
      command('showYaml', t(language, 'ioShowYaml'), 'mdi:code-braces-box', () => {
        this.yamlViewOpen = true;
      });
      command(
        'copyYaml',
        t(language, 'ioCopyYaml'),
        'mdi:code-braces-box',
        () => void this.copyYaml()
      );
      command('exportJson', t(language, 'ioExportJson'), 'mdi:file-export-outline', () =>
        downloadFlowJson(flow.graph)
      );
    }
    command('merge', t(language, 'mergeStart'), 'mdi:call-merge', () => {
      this.parkActiveTab();
      this.showHome = true;
      this.homeKind = 'automation';
      this.mergeMode = true;
      this.mergeIds = [];
    });
    command('templates', t(language, 'tplTitle'), 'mdi:code-braces', () =>
      this.openTemplates(null)
    );
    command('shortcuts', t(language, 'shortcutsTitle'), 'mdi:keyboard-outline', () => {
      this.shortcutsOpen = true;
    });
    command('map', mapT(language, 'title'), 'mdi:graph-outline', () => {
      this.parkActiveTab();
      this.showHome = true;
      this.homeKind = 'map';
    });
    command('new', t(language, 'newAutomation'), 'mdi:plus', () => this.startNew('automation'));
    command('newScript', t(language, 'newScript'), 'mdi:script-text-outline', () =>
      this.startNew('script')
    );
    if (this.aiEntityId)
      command('ai', t(language, 'aiButton'), 'mdi:creation', () => {
        this.aiOpen = true;
      });
    if (hass) {
      for (const item of [...listFlows(hass, 'automation'), ...listFlows(hass, 'script')]) {
        entries.push({
          id: `open-${item.kind}-${item.configId}`,
          group: 'open',
          label: item.name,
          icon: item.kind === 'script' ? 'mdi:script-text-outline' : 'mdi:robot-outline',
          hint: t(language, item.kind === 'script' ? 'type_script' : 'type_automation'),
          keywords: `${item.entityId} ${item.kind}`,
          run: () => void this.open(item),
        });
      }
    }
    return entries;
  }

  /** The assistant's proposal replaces the flow — one undo step, not saved. */
  private onAssistApply(event: CustomEvent<{ graph: FlowGraph }>): void {
    const flow = this.flow;
    if (!flow) return;
    const proposal = event.detail.graph;
    const metadata = FlowMetadataSchema.safeParse({
      ...flow.graph.metadata,
      ...proposal.metadata,
      kind: flow.graph.metadata?.kind,
    });
    this.commit({
      ...flow.graph,
      nodes: proposal.nodes,
      edges: proposal.edges,
      name: proposal.name || flow.graph.name,
      description: proposal.description ?? flow.graph.description,
      ...(metadata.success ? { metadata: metadata.data } : {}),
    });
    this.selectedId = null;
    void this.updateComplete.then(() => this.canvas?.fitView());
    this.dispatchEvent(
      new CustomEvent('hass-notification', {
        detail: { message: t(this.language, 'assistAppliedToast') },
        bubbles: true,
        composed: true,
      })
    );
  }

  /** A draft from "Build with AI" opens as a new, unsaved tab. */
  private onAiDraft(
    event: CustomEvent<{ graph: FlowGraph; unknownEntityIds: string[]; kind: FlowKind }>
  ): void {
    const { graph, unknownEntityIds, kind } = event.detail;
    this.aiOpen = false;
    const name = graph.name || t(this.language, kind === 'script' ? 'newScript' : 'newAutomation');
    this.openTab({
      item: {
        kind,
        entityId: '',
        configId: String(Date.now()),
        name,
        enabled: true,
        lastTriggered: null,
      },
      graph: { ...graph, name },
      isNew: true,
      registryEntry: null,
    });
    this.message =
      unknownEntityIds.length > 0
        ? `${t(this.language, 'aiUnknown')}${unknownEntityIds.join(', ')}`
        : null;
    this.dispatchEvent(
      new CustomEvent('hass-notification', {
        detail: { message: t(this.language, 'aiDone') },
        bubbles: true,
        composed: true,
      })
    );
  }

  /** A restored tab without changes: show HA's current version, not the remembered one. */
  private async refreshStaleTab(id: string): Promise<void> {
    const hass = this.hass;
    const tab = this.tabs.find((candidate) => candidate.id === id);
    if (!hass || !tab?.stale) return;
    this.tabs = this.tabs.map((candidate) =>
      candidate.id === id ? { ...candidate, stale: false } : candidate
    );
    let fresh: OpenFlow;
    try {
      fresh = await this.loadFlow(hass, tab.flow.item);
    } catch {
      return; // Deleted or unreachable in HA — keep the remembered version.
    }
    if (this.activeTabId === id && this.saveState === 'saved' && this.past.length === 0) {
      this.flow = fresh;
    } else if (this.activeTabId !== id) {
      this.tabs = this.tabs.map((candidate) =>
        candidate.id === id && candidate.saveState === 'saved'
          ? { ...candidate, flow: fresh }
          : candidate
      );
    }
  }

  private get language(): string {
    return this.hass?.language ?? 'en';
  }

  private get canvas(): FlodeCanvas | null {
    return this.renderRoot.querySelector('flode-canvas');
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('keydown', this.onWindowKeyDown, true);
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('focus', this.onWindowFocus);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.onWindowKeyDown, true);
    window.removeEventListener('pagehide', this.onPageHide);
    window.removeEventListener('focus', this.onWindowFocus);
    this.persistTabs();
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('hass') && this.hass) {
      loadSummaryTranslations(this.hass);
      // First `hass` after a reload: refresh the restored active tab.
      if (!changed.get('hass') && this.activeTabId) void this.refreshStaleTab(this.activeTabId);
      if (!changed.get('hass')) void this.loadAiChoice();
    }
  }

  protected updated(changed: PropertyValues<this>): void {
    if (changed.has('selectedId') && this.selectedId && isNarrow()) {
      this.canvas?.revealNode(this.selectedId);
    }
    if (
      changed.has('tabs') ||
      changed.has('activeTabId') ||
      changed.has('flow') ||
      changed.has('saveState') ||
      changed.has('showHome')
    ) {
      this.schedulePersist();
    }
  }

  // ---- open / save -----------------------------------------------------------

  /** Loads an automation from HA as a flow (HA blocks kept as blocks). */
  private async loadFlow(hass: HomeAssistant, item: AutomationListItem): Promise<OpenFlow> {
    const config = await loadFlowConfig(hass, item.kind, item.configId);
    const { transpiler, parseScript } = await loadTranspiler();
    // Wenn-dann, Auswählen, Wiederholen, Parallel stay HA blocks (HA's own nested editor).
    const options = { keepBlocks: true };
    const result =
      item.kind === 'script'
        ? await parseScript(transpiler, config, options)
        : await transpiler.fromYaml(
            yamlDump(config, { indent: 2, lineWidth: -1, quotingType: '"', forceQuotes: false }),
            options
          );
    if (!result.success || !result.graph) throw new Error(result.errors?.join('\n') ?? 'parse');
    return {
      item,
      graph: {
        ...result.graph,
        name: item.name,
        description: typeof config.description === 'string' ? config.description : '',
      },
      isNew: false,
      registryEntry: await getRegistryEntry(hass, item.entityId),
      ...(result.warnings?.length ? { importWarnings: result.warnings } : {}),
    };
  }

  private async open(item: AutomationListItem): Promise<void> {
    const hass = this.hass;
    if (!hass) return;
    const openTab = this.tabs.find((tab) => {
      const open = this.tabFlow(tab).item;
      return open.kind === item.kind && open.configId === item.configId;
    });
    if (openTab) {
      this.switchTab(openTab.id);
      return;
    }
    this.message = t(this.language, 'loading');
    try {
      this.openTab(await this.loadFlow(hass, item));
      this.message = null;
    } catch (error) {
      this.message = `${t(this.language, 'loadFailed')}: ${errorMessage(error)}`;
    }
  }

  /** `named`: the name was just entered (HA's unsaved-changes dialog) — don't ask again. */
  private async save(named = false): Promise<void> {
    const hass = this.hass;
    const flow = this.flow;
    if (!hass || !flow || this.saveState === 'saving') return;
    // A new automation gets its name first, exactly like HA's own editor.
    if (flow.isNew && !named && !(await this.editSettings('alias'))) return;
    this.saveState = 'saving';
    try {
      const { FlowTranspiler, buildAutomationSaveConfig, transpileScript } = await loadTranspiler();
      const transpiler = new FlowTranspiler();
      const validation = transpiler.validate(flow.graph);
      if (validation.errors.length > 0) {
        throw new Error(validation.errors.map((e) => e.message).join(', '));
      }
      let current = this.flow ?? flow;
      const kind = current.item.kind;
      if (kind === 'script' && current.isNew) {
        // Like HA's script editor: a new script's id comes from its name.
        current = {
          ...current,
          item: { ...current.item, configId: newScriptId(hass, current.graph.name) },
        };
        this.flow = current;
      }
      const result =
        kind === 'script'
          ? transpileScript(transpiler, current.graph)
          : buildAutomationSaveConfig(transpiler, current.graph, {
              alias: current.graph.name,
              description: current.graph.description ?? '',
            });
      if (!result.success || !result.config) throw new Error(result.errors?.join(', '));
      await saveFlowConfig(hass, kind, current.item.configId, result.config);
      await this.afterSave(current);
      this.saveState = 'saved';
      this.message = null;
    } catch (error) {
      this.saveState = 'unsaved';
      this.message = `${t(this.language, 'saveFailed')}: ${errorMessage(error)}`;
    }
  }

  /** A new automation's entity only exists after the first save; then area/category/labels follow. */
  private async afterSave(saved: OpenFlow): Promise<void> {
    const hass = this.hass;
    if (!hass) return;
    const entityId =
      saved.item.entityId ||
      (await waitForAutomationEntity(() => this.hass, saved.item.kind, saved.item.configId)) ||
      '';
    if (entityId && saved.registryUpdate)
      await applyRegistryUpdate(hass, entityId, saved.registryUpdate);
    const registryEntry = entityId ? await getRegistryEntry(hass, entityId) : null;
    const flow = this.flow;
    if (!flow || flow.item.configId !== saved.item.configId) return;
    this.flow = {
      ...flow,
      isNew: false,
      item: { ...flow.item, entityId },
      registryEntry,
      registryUpdate: undefined,
    };
  }

  /** HA's own "run": the version saved in HA (fields → HA's dialog to fill them in). */
  private async runSavedScript(): Promise<void> {
    const hass = this.hass;
    const flow = this.flow;
    const host = this.renderRoot.querySelector('.dialog-host');
    if (!hass || !flow || flow.isNew || !(host instanceof HTMLElement)) return;
    await runScript(hass, host, {
      entityId: flow.item.entityId,
      configId: flow.item.configId,
      name: flow.graph.name,
    });
  }

  // ---- automation settings (HA's rename + mode dialogs) ------------------------

  private startNew(
    kind: FlowKind = this.flow?.item.kind ?? (this.homeKind === 'script' ? 'script' : 'automation')
  ): void {
    const name = t(this.language, kind === 'script' ? 'newScript' : 'newAutomation');
    this.message = null;
    this.openTab({
      item: {
        kind,
        entityId: '',
        // HA's own editor uses a timestamp as the config id of a new automation.
        configId: String(Date.now()),
        name,
        enabled: true,
        lastTriggered: null,
      },
      graph: {
        id: randomId(),
        name,
        // A script is a flow with one "script start" card carrying its fields.
        nodes:
          kind === 'script'
            ? [
                {
                  id: `trigger_${Date.now().toString(36)}`,
                  type: 'trigger',
                  position: { x: 0, y: 0 },
                  data: { trigger: SCRIPT_START_TRIGGER },
                },
              ]
            : [],
        edges: [],
        version: 1,
        metadata: kind === 'script' ? { mode: 'single', kind: 'script' } : { mode: 'single' },
        description: '',
      },
      isNew: true,
      registryEntry: null,
    });
  }

  // ---- tabs --------------------------------------------------------------------

  /** A tab's flow — live for the active tab, parked for the others. */
  private tabFlow(tab: EditorTab): OpenFlow {
    return tab.id === this.activeTabId && this.flow ? this.flow : tab.flow;
  }

  private tabSaveState(tab: EditorTab): SaveState {
    return tab.id === this.activeTabId ? this.saveState : tab.saveState;
  }

  /** Stores the active tab's live state (incl. history and view) back into `tabs`. */
  private parkActiveTab(): void {
    const flow = this.flow;
    if (!this.activeTabId || !flow) return;
    const parked: EditorTab = {
      id: this.activeTabId,
      flow,
      past: this.past,
      future: this.future,
      saveState: this.saveState,
      selectedId: this.selectedId,
      viewport: this.canvas?.viewport,
    };
    this.tabs = this.tabs.map((tab) => (tab.id === parked.id ? parked : tab));
  }

  private activateTab(tab: EditorTab): void {
    this.activeTabId = tab.id;
    this.flow = tab.flow;
    this.past = tab.past;
    this.future = tab.future;
    this.saveState = tab.saveState;
    this.selectedId = tab.selectedId;
    this.inspectorError = null;
    this.addOpen = false;
    this.showHome = false;
    const viewport = tab.viewport;
    if (viewport) void this.updateComplete.then(() => this.canvas?.setViewport(viewport));
    if (tab.stale) void this.refreshStaleTab(tab.id);
  }

  /** Opens a flow in a new tab — or in the active one if that's still an empty new automation. */
  private openTab(flow: OpenFlow): void {
    const active = this.tabs.find((tab) => tab.id === this.activeTabId);
    const activeIsBlank =
      active !== undefined && this.flow?.isNew === true && this.flow.graph.nodes.length === 0;
    const tab: EditorTab = {
      id: activeIsBlank && active ? active.id : randomId(),
      flow,
      past: [],
      future: [],
      saveState: flow.isNew ? 'unsaved' : 'saved',
      selectedId: null,
    };
    if (activeIsBlank) {
      this.tabs = this.tabs.map((existing) => (existing.id === tab.id ? tab : existing));
    } else {
      this.parkActiveTab();
      this.tabs = [...this.tabs, tab];
    }
    this.activateTab(tab);
  }

  private switchTab(id: string): void {
    if (id === this.activeTabId && this.flow) {
      this.showHome = false;
      return;
    }
    const target = this.tabs.find((tab) => tab.id === id);
    if (!target) return;
    this.parkActiveTab();
    this.activateTab(this.tabs.find((tab) => tab.id === id) ?? target);
  }

  /** Closing a tab with changes asks through HA's own "unsaved changes" dialog. */
  private async closeTab(id: string): Promise<void> {
    const tab = this.tabs.find((candidate) => candidate.id === id);
    const hass = this.hass;
    if (!tab || !hass) return;
    if (this.tabSaveState(tab) !== 'saved') {
      this.switchTab(id);
      await this.updateComplete;
      const flow = this.flow;
      const host = this.renderRoot.querySelector('.dialog-host');
      if (!flow || !(host instanceof HTMLElement)) return;
      const proceed = await confirmUnsavedChanges(hass, host, {
        flowKind: flow.item.kind,
        configId: flow.isNew ? undefined : flow.item.configId,
        settings: this.settingsOf(flow),
        registry: { entry: flow.registryEntry, update: flow.registryUpdate },
        save: async (settings, registryUpdate) => {
          this.applySettings(settings, registryUpdate);
          await this.save(true);
          return this.saveState === 'saved';
        },
      });
      if (!proceed) return;
    }
    const index = this.tabs.findIndex((candidate) => candidate.id === id);
    const remaining = this.tabs.filter((candidate) => candidate.id !== id);
    this.tabs = remaining;
    if (id !== this.activeTabId) return;
    const next = remaining[Math.min(index, remaining.length - 1)];
    if (next) {
      this.activateTab(next);
    } else {
      this.activeTabId = null;
      this.flow = null;
      this.showHome = true;
    }
  }

  private settingsOf(flow: OpenFlow): AutomationSettings {
    const metadata = flow.graph.metadata;
    return {
      // Like HA's editor: a new automation has no alias yet, so the dialog
      // opens as "save" with an empty, required name field.
      alias: flow.isNew ? '' : flow.graph.name,
      description: flow.graph.description ?? '',
      mode: metadata?.mode ?? 'single',
      max: metadata?.max,
      max_exceeded: metadata?.max_exceeded,
      icon: metadata?.icon,
    };
  }

  /** Opens HA's rename or mode dialog; resolves `false` when cancelled. */
  private async editSettings(kind: 'alias' | 'mode'): Promise<boolean> {
    const hass = this.hass;
    const flow = this.flow;
    const host = this.renderRoot.querySelector('.dialog-host');
    if (!hass || !flow || !(host instanceof HTMLElement)) return false;
    const target = {
      flowKind: flow.item.kind,
      configId: flow.isNew ? undefined : flow.item.configId,
    };
    const result = await promptAutomationDialog(hass, host, target, kind, this.settingsOf(flow), {
      entry: flow.registryEntry,
      update: flow.registryUpdate,
    });
    if (!result || !this.flow) return false;
    this.applySettings(result.settings, result.registryUpdate);
    return true;
  }

  /** Name, description and mode from one of HA's dialogs — one undo step. */
  private applySettings(settings: AutomationSettings, registryUpdate?: RegistryUpdate): void {
    const current = this.flow;
    if (!current) return;
    const { alias, description, mode, max, max_exceeded, icon } = settings;
    const metadata = FlowMetadataSchema.safeParse({
      ...current.graph.metadata,
      mode,
      max,
      max_exceeded,
      ...(current.item.kind === 'script' ? { icon } : {}),
    });
    this.commit({
      ...current.graph,
      name: alias || current.graph.name,
      description,
      ...(metadata.success ? { metadata: metadata.data } : {}),
    });
    const latest = this.flow ?? current;
    this.flow = {
      ...latest,
      item: { ...latest.item, name: alias || latest.item.name },
      registryUpdate: registryUpdate ?? latest.registryUpdate,
    };
    this.saveState = 'unsaved';
  }

  // ---- editing + history -----------------------------------------------------

  private commit(next: FlowGraph): void {
    const flow = this.flow;
    // A script always begins somewhere (its start node is hidden, see flow-model).
    const graph = ensureScriptEntry(next);
    if (!flow || graph === flow.graph) return;
    this.past = [...this.past.slice(-HISTORY_LIMIT + 1), flow.graph];
    this.future = [];
    this.flow = { ...flow, graph };
    this.saveState = 'unsaved';
  }

  private undo(): void {
    const flow = this.flow;
    const previous = this.past.at(-1);
    if (!flow || !previous) return;
    this.past = this.past.slice(0, -1);
    this.future = [flow.graph, ...this.future];
    this.flow = { ...flow, graph: previous };
    this.saveState = 'unsaved';
  }

  private redo(): void {
    const flow = this.flow;
    const [next, ...rest] = this.future;
    if (!flow || !next) return;
    this.future = rest;
    this.past = [...this.past, flow.graph];
    this.flow = { ...flow, graph: next };
    this.saveState = 'unsaved';
  }

  // ---- inspector resize ------------------------------------------------------

  private onResizeStart(event: PointerEvent): void {
    if (event.button !== 0 || !(event.currentTarget instanceof HTMLElement)) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const work = handle.parentElement?.getBoundingClientRect();
    if (!work) return;
    const move = (e: PointerEvent) => {
      // Dragging left widens; keep at least 40 % of the space for the canvas.
      const max = work.width * 0.6;
      this.inspectorWidth = Math.min(max, Math.max(INSPECTOR_MIN, work.right - e.clientX));
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      storeInspectorWidth(this.inspectorWidth);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  /**
   * Opens HA's own "add trigger / condition / action" dialog through a hidden
   * HA list element: HA builds the default step for whatever the user picks
   * and reports it as `value-changed` on that list (see `onStepAdded`).
   */
  /** Set by a card's "+": the step picked next gets connected after that output. */
  private pendingAdd: AddAt | null = null;

  private onAddNext(event: CustomEvent<AddAt>): void {
    void this.openAddDialog('action', event.detail);
  }

  private async openAddDialog(kind: StepKind, at: AddAt | null = null): Promise<void> {
    this.addOpen = false;
    this.pendingAdd = at;
    if (!(await ensureAutomationEditors(this.hass))) return;
    await this.updateComplete;
    const list = this.renderRoot.querySelector<HTMLElement & Record<string, unknown>>(
      `.add-lists [data-kind="${kind}"]`
    );
    const method = {
      trigger: '_addTriggerDialog',
      condition: '_addConditionDialog',
      action: '_addActionDialog',
    }[kind];
    const open = list?.[method];
    if (typeof open === 'function') open.call(list);
  }

  private onStepAdded(kind: StepKind, event: CustomEvent<{ value: unknown }>): void {
    event.stopPropagation();
    // HA's list focuses the row it just added once it re-renders; give it that
    // row for a moment (the list is hidden), then empty it again.
    const list = event.currentTarget;
    if (list instanceof HTMLElement && Array.isArray(event.detail.value)) {
      const prop = ADD_LIST_PROP[kind];
      Reflect.set(list, prop, event.detail.value);
      window.setTimeout(() => Reflect.set(list, prop, NO_STEPS), 1000);
    }
    const flow = this.flow;
    const added: unknown = Array.isArray(event.detail.value)
      ? event.detail.value.at(-1)
      : undefined;
    if (!flow || !isPlainObject(added)) return;
    const { type, data } = stepToNode(kind, added);
    const at = this.pendingAdd;
    this.pendingAdd = null;
    const source = at?.source ? flow.graph.nodes.find((n) => n.id === at.source) : undefined;
    // Where it was asked for (right-click, dropped connection); after a card one column
    // to its right; otherwise where the user is looking.
    const wanted =
      at?.position ??
      (source
        ? { x: source.position.x + NODE_WIDTH + 120, y: source.position.y }
        : (this.canvas?.visibleCenter() ?? { x: 0, y: 0 }));
    const { graph, id } = addNode(
      flow.graph,
      type,
      freePosition(flow.graph, wanted),
      undefined,
      data
    );
    this.commit(
      at?.source && source
        ? connect(graph, { source: at.source, sourceHandle: at.sourceHandle ?? null, target: id })
        : graph
    );
    this.selectedId = id;
  }

  private onStepChange(
    event: CustomEvent<{ id: string; kind: StepKind; step: Record<string, unknown> }>
  ): void {
    const flow = this.flow;
    if (!flow) return;
    const previous = flow.graph.nodes.find((n) => n.id === event.detail.id);
    const { type, data } = stepToNode(event.detail.kind, event.detail.step, previous);
    const { graph, error } = setNodeStep(flow.graph, event.detail.id, type, data);
    this.inspectorError = error ? `${t(this.language, 'invalid')}: ${error}` : null;
    if (!error) this.commit(graph);
  }

  private onDataChange(event: CustomEvent<{ id: string; data: unknown }>): void {
    const flow = this.flow;
    if (!flow) return;
    const { graph, error } = updateNodeData(flow.graph, event.detail.id, event.detail.data);
    this.inspectorError = error ? `${t(this.language, 'invalid')}: ${error}` : null;
    if (!error) this.commit(graph);
  }

  private onDelete(event: CustomEvent<{ id: string }>): void {
    const flow = this.flow;
    if (!flow) return;
    this.commit(removeNode(flow.graph, event.detail.id));
    this.selectedId = null;
  }

  /** FLODE's shortcuts (shortcuts.ts) — captured before HA's own single-key shortcuts. */
  private onWindowKeyDown = (event: KeyboardEvent): void => {
    if (!this.isConnected) return;
    const shortcut = matchShortcut(event);
    if (!shortcut) return;
    if (!shortcut.global && (!this.flow || this.showHome)) return;
    // Inside a text field / HA's code editor these keys belong to the text.
    if (shortcut.notInText && isTyping(event)) return;
    const run = this.shortcutAction(shortcut.id);
    // Nothing to do (e.g. ⌘C without a card) — the browser keeps the key.
    if (!run) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    run();
  };

  private shortcutAction(id: ShortcutId): (() => void) | null {
    const selected = this.selectedCard();
    switch (id) {
      case 'palette':
        return () => {
          this.paletteOpen = true;
        };
      case 'templates':
        return () => this.openTemplates(null);
      case 'shortcuts':
        return () => {
          this.shortcutsOpen = true;
        };
      case 'save':
        return () => void this.save();
      case 'saveCopy':
        return () => this.saveCopy();
      case 'undo':
        return () => this.undo();
      case 'redo':
        return () => this.redo();
      case 'add':
        return () => {
          this.addOpen = true;
        };
      case 'copy':
        // A text selection on the page keeps the browser's own copy.
        if (!selected || window.getSelection()?.toString()) return null;
        return () => {
          this.copiedNode = structuredClone(selected);
          this.notify(
            t(this.language, 'cardCopied').replace('{keys}', shortcutHint('paste') ?? '')
          );
        };
      case 'paste': {
        const copied = this.copiedNode;
        if (!copied) return null;
        return () => this.duplicateCard(copied);
      }
      case 'duplicate':
        return selected ? () => this.duplicateCard(selected) : null;
      case 'toggleEnabled':
        return selected ? () => this.toggleCard(selected) : null;
      case 'tidy':
        return () => void this.tidy();
      case 'fit':
        return () => this.canvas?.fitView();
      case 'minimap':
        return () => this.toggleMinimap();
      case 'delete':
        return null;
    }
  }

  /** "Automation suchen … (⌘K für Befehle)" — without the keyboard hint on phones. */
  private searchPlaceholder(): string {
    const text = t(this.language, 'searchHint');
    const keys = shortcutHint('palette');
    return this.narrow || !keys
      ? text
      : `${text} (${t(this.language, 'searchPaletteHint').replace('{keys}', keys)})`;
  }

  /**
   * Parts of the automation the transpiler didn't recognise when it was opened
   * — HA's own warning, so nobody saves over something FLODE didn't read.
   */
  private renderImportWarnings(flow: OpenFlow) {
    const warnings = flow.importWarnings;
    if (!warnings?.length) return nothing;
    return html`<ha-alert
      class="import-warnings"
      alert-type="warning"
      .title=${t(this.language, 'importWarnTitle')}
      dismissable
      @alert-dismissed-clicked=${() => {
        if (this.flow) this.flow = { ...this.flow, importWarnings: undefined };
      }}
    >
      ${t(this.language, 'importWarnText')}
      <ul>
        ${warnings.map((warning) => html`<li>${warning}</li>`)}
      </ul>
    </ha-alert>`;
  }

  /** Phones: the sheet's close button — the open panel first, else the selection. */
  private closeSheet(): void {
    if (this.assistOpen) this.assistOpen = false;
    else if (this.debugOpen) this.debugOpen = false;
    else this.selectedId = null;
  }

  private toggleMinimap(): void {
    this.minimapVisible = !this.minimapVisible;
    writeFlag(MINIMAP_KEY, this.minimapVisible);
  }

  /** The selected card — never the hidden script start. */
  private selectedCard(): FlowNode | null {
    const node = this.flow?.graph.nodes.find((n) => n.id === this.selectedId);
    return node && !isScriptStart(node.data) ? node : null;
  }

  private duplicateCard(node: FlowNode, at?: { x: number; y: number }): void {
    const flow = this.flow;
    if (!flow) return;
    const { graph, id } = copyNode(flow.graph, node, at);
    if (graph === flow.graph) return;
    this.commit(graph);
    this.selectedId = id;
  }

  private toggleCard(node: FlowNode): void {
    const flow = this.flow;
    if (flow) this.commit(toggleNodeEnabled(flow.graph, node.id));
  }

  /**
   * "Aufräumen": re-runs the import layout (ELK, from the transpiler) on the
   * current flow — one undo step, then frames everything.
   */
  private async tidy(): Promise<void> {
    const flow = this.flow;
    if (!flow || visibleGraph(flow.graph).nodes.length < 2) return;
    const tidied = await layoutGraph(flow.graph);
    const current = this.flow;
    if (!current || current.graph !== flow.graph) return;
    this.commit(tidied);
    await this.updateComplete;
    this.canvas?.fitView();
    // HA's own toast (the same event HA's panels use for "Saved" etc.).
    this.dispatchEvent(
      new CustomEvent('hass-notification', {
        detail: { message: t(this.language, 'tidied') },
        bubbles: true,
        composed: true,
      })
    );
  }

  // ---- render ----------------------------------------------------------------

  private renderItemGroup(items: AutomationListItem[]) {
    return html`<div class="grid">
      ${items.map(
        (item) => html`
          <ha-card
            class="item ${item.enabled ? '' : 'off'} ${this.mergeMode && this.mergeIds.includes(item.configId) ? 'picked' : ''}"
            @click=${() => {
              if (!this.mergeMode || item.kind !== 'automation') {
                void this.open(item);
                return;
              }
              this.mergeIds = this.mergeIds.includes(item.configId)
                ? this.mergeIds.filter((id) => id !== item.configId)
                : [...this.mergeIds, item.configId];
            }}
          >
            <div class="item-name">
              ${
                this.mergeMode && item.kind === 'automation'
                  ? html`<ha-checkbox .checked=${this.mergeIds.includes(item.configId)}></ha-checkbox>`
                  : nothing
              }
              ${item.name}
            </div>
            <div class="item-meta">
              ${
                item.kind === 'script'
                  ? html`<ha-icon icon="mdi:script-text-outline"></ha-icon>`
                  : html`<span class="dot ${item.enabled ? 'on' : ''}"></span>
                      ${item.enabled ? t(this.language, 'on') : t(this.language, 'off')}`
              }
              <span class="spacer"></span>
              ${
                item.lastTriggered
                  ? new Date(item.lastTriggered).toLocaleString(this.language, {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })
                  : t(this.language, 'never')
              }
            </div>
          </ha-card>
`
      )}
    </div>`;
  }

  private renderHome() {
    const hass = this.hass;
    const q = this.query.trim().toLowerCase();
    const view = this.homeKind;
    const kind: FlowKind = view === 'script' ? 'script' : 'automation';
    const items =
      hass && view !== 'map'
        ? listFlows(hass, kind).filter((a) => !q || a.name.toLowerCase().includes(q))
        : [];
    // Active automations first, deactivated ones in their own group below (both A–Z).
    const active = items.filter((item) => item.enabled);
    const inactive = items.filter((item) => !item.enabled);
    return html`
      <div class="home-scroll"><div class="home">
        <header class="home-head">
          ${
            // Phones: HA hides its sidebar — HA's own menu button opens it.
            this.narrow
              ? html`<ha-menu-button .hass=${this.hass} .narrow=${this.narrow}></ha-menu-button>`
              : nothing
          }
          <div>
            <h1>${t(this.language, 'title')}</h1>
            <p class="muted">${t(this.language, 'homeHint')}</p>
          </div>
        </header>
        ${this.renderAiSetup()}
        <div class="home-bar">
          <div class="kinds" role="tablist">
            ${(['automation', 'script', 'map'] as const).map(
              (option) => html`<button
                role="tab"
                class=${option === view ? 'active' : ''}
                aria-selected=${option === view ? 'true' : 'false'}
                @click=${() => {
                  this.homeKind = option;
                }}
              >
                ${option === 'map' ? mapT(this.language, 'title') : t(this.language, option === 'script' ? 'scripts' : 'automations')}
              </button>`
            )}
          </div>
          <div class="home-actions">
            ${
              this.aiEntityId
                ? html`<button class="save ai" @click=${() => {
                    this.aiOpen = true;
                  }}>
                    <ha-icon icon="mdi:creation"></ha-icon>${t(this.language, 'aiButton')}
                  </button>`
                : nothing
            }
            <button class="save" @click=${() => this.startNew(kind)}>
              <ha-icon icon="mdi:plus"></ha-icon>${t(this.language, kind === 'script' ? 'newScript' : 'newAutomation')}
            </button>
            ${this.renderMenu([
              {
                id: 'merge',
                icon: 'mdi:call-merge',
                label: t(this.language, 'mergeStart'),
                run: () => {
                  this.homeKind = 'automation';
                  this.mergeMode = true;
                  this.mergeIds = [];
                },
              },
              {
                id: 'yaml',
                icon: 'mdi:code-braces-box',
                label: t(this.language, 'ioImportYaml'),
                run: () => {
                  this.yamlImportOpen = true;
                },
              },
              {
                id: 'json',
                icon: 'mdi:file-import-outline',
                label: t(this.language, 'ioImportJson'),
                run: () => void this.importJson(),
              },
              {
                id: 'shortcuts',
                icon: 'mdi:keyboard-outline',
                label: t(this.language, 'shortcutsTitle'),
                run: () => {
                  this.shortcutsOpen = true;
                },
              },
            ])}
          </div>
        </div>
        <label class="search">
          <ha-icon icon="mdi:magnify"></ha-icon>
          <input
            .value=${this.query}
            placeholder=${view === 'map' ? mapT(this.language, 'searchPlaceholder') : this.searchPlaceholder()}
            @input=${(e: InputEvent) => {
              if (e.target instanceof HTMLInputElement) this.query = e.target.value;
            }}
            @keydown=${(e: KeyboardEvent) => e.stopPropagation()}
          />
        </label>
        ${this.message ? html`<p class="message">${this.message}</p>` : nothing}
        ${
          this.mergeMode && view === 'automation'
            ? html`<div class="merge-bar">
                <ha-icon icon="mdi:call-merge"></ha-icon>
                <span class="merge-text">
                  ${t(this.language, 'mergeHint')}
                  <strong>${t(this.language, 'mergeSelected').replace('{n}', String(this.mergeIds.length))}</strong>
                </span>
                <ha-button appearance="plain" @click=${() => {
                  this.mergeMode = false;
                  this.mergeIds = [];
                }}>${t(this.language, 'cancel')}</ha-button>
                <ha-button .disabled=${this.mergeIds.length < 2} @click=${() => void this.mergeSelected()}>
                  ${t(this.language, 'mergeRun')}
                </ha-button>
              </div>`
            : nothing
        }
        ${
          view === 'map'
            ? html`<flode-map
                .hass=${this.hass}
                .query=${this.query}
                @open-item=${(event: CustomEvent<AutomationListItem>) => void this.open(event.detail)}
                @clear-query=${() => {
                  this.query = '';
                }}
              ></flode-map>`
            : nothing
        }
        ${this.renderItemGroup(active)}
        ${
          inactive.length > 0
            ? html`<h2 class="group-title">${t(this.language, 'disabledGroup')} (${inactive.length})</h2>
                ${this.renderItemGroup(inactive)}`
            : nothing
        }
        ${items.length === 0 && view !== 'map' ? html`<p class="muted center">${t(this.language, 'empty')}</p>` : nothing}
      </div></div>
    `;
  }

  private renderEditor(flow: OpenFlow) {
    const language = this.language;
    const selected = flow.graph.nodes.find((n) => n.id === this.selectedId) ?? null;
    return html`
      <div class="editor">
        <header class="toolbar">
          <ha-icon-button .label=${t(language, 'back')} @click=${() => {
            // Back to the start screen; the tabs stay open.
            this.parkActiveTab();
            this.showHome = true;
            this.message = null;
          }}>
            <ha-icon icon="mdi:arrow-left"></ha-icon>
          </ha-icon-button>
          <div class="name">
            <button
              class="flow-name"
              title=${flow.graph.description || t(language, 'rename')}
              @click=${() => void this.editSettings('alias')}
            >
              ${flow.graph.name}
            </button>
            <span class="status ${this.saveState}">${t(language, this.saveState)}</span>
            ${this.renderLastRun(flow)}
          </div>
          <div class="dialog-host" hidden></div>
          <div class="tools">
            <div class="tool-group">
              <div class="add">
                <ha-icon-button .label=${labelWithHint(t(language, 'add'), 'add')} @click=${() => {
                  this.addOpen = !this.addOpen;
                }}>
                  <ha-icon icon="mdi:plus"></ha-icon>
                </ha-icon-button>
                ${
                  this.addOpen
                    ? html`<div class="menu" title=${t(language, 'addHint')}>
                      ${(
                        flow.item.kind === 'script'
                          ? (['condition', 'action'] as const)
                          : (['trigger', 'condition', 'action'] as const)
                      ).map(
                        (kind) => html`<button
                          @click=${() => void this.openAddDialog(kind)}
                          style="--node-color: ${NODE_META[kind].color}"
                        >
                          <ha-icon .icon=${NODE_META[kind].icon}></ha-icon>${typeLabel(kind, language)}
                        </button>`
                      )}
                    </div>`
                    : nothing
                }
              </div>
              <ha-icon-button .label=${labelWithHint(t(language, 'undo'), 'undo')} .disabled=${this.past.length === 0} @click=${() => this.undo()}>
                <ha-icon icon="mdi:undo"></ha-icon>
              </ha-icon-button>
              <ha-icon-button .label=${labelWithHint(t(language, 'redo'), 'redo')} .disabled=${this.future.length === 0} @click=${() => this.redo()}>
                <ha-icon icon="mdi:redo"></ha-icon>
              </ha-icon-button>
            </div>
            <span class="tool-sep"></span>
            <div class="tool-group">
              <ha-icon-button .label=${t(language, 'zoomOut')} @click=${() => this.canvas?.zoomBy(1 / 1.2)}>
                <ha-icon icon="mdi:magnify-minus-outline"></ha-icon>
              </ha-icon-button>
              <ha-icon-button .label=${t(language, 'zoomIn')} @click=${() => this.canvas?.zoomBy(1.2)}>
                <ha-icon icon="mdi:magnify-plus-outline"></ha-icon>
              </ha-icon-button>
              <ha-icon-button .label=${labelWithHint(t(language, 'fit'), 'fit')} @click=${() => this.canvas?.fitView()}>
                <ha-icon icon="mdi:fit-to-screen-outline"></ha-icon>
              </ha-icon-button>
              <ha-icon-button
                .label=${labelWithHint(t(language, 'tidy'), 'tidy')}
                .disabled=${visibleGraph(flow.graph).nodes.length < 2}
                @click=${() => void this.tidy()}
              >
                <ha-icon icon="mdi:auto-fix"></ha-icon>
              </ha-icon-button>
              <ha-icon-button
                class=${this.minimapVisible ? 'active' : ''}
                .label=${labelWithHint(t(language, 'minimap'), 'minimap')}
                @click=${() => this.toggleMinimap()}
              >
                <ha-icon icon="mdi:map-outline"></ha-icon>
              </ha-icon-button>
            </div>
            <span class="tool-sep"></span>
            <div class="tool-group">
              <ha-icon-button .label=${t(language, 'rename')} @click=${() => void this.editSettings('alias')}>
                <ha-icon icon="mdi:rename-outline"></ha-icon>
              </ha-icon-button>
              <ha-icon-button
                .label=${`${t(language, 'mode')}: ${t(language, `mode_${flow.graph.metadata?.mode ?? 'single'}`)}`}
                @click=${() => void this.editSettings('mode')}
              >
                <ha-icon icon="mdi:debug-step-over"></ha-icon>
              </ha-icon-button>
              <ha-icon-button .label=${labelWithHint(t(language, 'tplTitle'), 'templates')} @click=${() => this.openTemplates(null)}>
                <ha-icon icon="mdi:code-braces"></ha-icon>
              </ha-icon-button>
              ${
                flow.item.kind === 'script'
                  ? html`<ha-icon-button
                      .label=${t(language, 'fields')}
                      @click=${() => {
                        // The script's fields live on its hidden start node — HA's field editor opens in the inspector.
                        this.debugOpen = false;
                        this.assistOpen = false;
                        this.selectedId = scriptStartId(flow.graph) ?? null;
                      }}
                    >
                      <ha-icon icon="mdi:form-textbox"></ha-icon>
                    </ha-icon-button>
                    <ha-icon-button
                      .label=${t(language, flow.isNew ? 'runNeedsSave' : 'run')}
                      .disabled=${flow.isNew}
                      @click=${() => void this.runSavedScript()}
                    >
                      <ha-icon icon="mdi:play"></ha-icon>
                    </ha-icon-button>`
                  : nothing
              }
            </div>
            <span class="tool-sep"></span>
            <div class="tool-group">
              <ha-icon-button
                class=${this.debugOpen ? 'active' : ''}
                .label=${t(language, 'showRuns')}
                .disabled=${flow.isNew}
                @click=${() => {
                  this.debugOpen = !this.debugOpen;
                  if (this.debugOpen) this.assistOpen = false;
                }}
              >
                <ha-icon icon="mdi:timeline-clock-outline"></ha-icon>
              </ha-icon-button>
              ${
                this.aiEntityId
                  ? html`<button
                      class="tool-labeled ai ${this.assistOpen ? 'active' : ''}"
                      title=${t(language, 'assistButton')}
                      @click=${() => {
                        this.assistOpen = !this.assistOpen;
                        if (this.assistOpen) this.debugOpen = false;
                      }}
                    >
                      <ha-icon icon="mdi:creation"></ha-icon><span class="tool-label">${t(language, 'assistButton')}</span>
                    </button>`
                  : nothing
              }
            </div>
          </div>
          <div class="actions">
            <button class="save" ?disabled=${this.saveState !== 'unsaved'} @click=${() => void this.save()}>
              <ha-icon icon="mdi:content-save-outline"></ha-icon>${t(language, 'save')}
            </button>
            ${this.renderMenu([
              {
                id: 'copy',
                icon: 'mdi:content-duplicate',
                label: t(language, 'ioSaveCopy'),
                run: () => this.saveCopy(),
              },
              {
                id: 'yaml',
                icon: 'mdi:code-braces-box',
                label: t(language, 'ioShowYaml'),
                run: () => {
                  this.yamlViewOpen = true;
                },
              },
              {
                id: 'json',
                icon: 'mdi:file-export-outline',
                label: t(language, 'ioExportJson'),
                run: () => downloadFlowJson(flow.graph),
              },
              {
                id: 'shortcuts',
                icon: 'mdi:keyboard-outline',
                label: t(language, 'shortcutsTitle'),
                run: () => {
                  this.shortcutsOpen = true;
                },
              },
            ])}
          </div>
        </header>
        ${this.renderTabs()}
        ${this.message ? html`<p class="message">${this.message}</p>` : nothing}
        ${this.renderImportWarnings(flow)}
        <div class="work" @pointerdown=${this.closeCanvasMenuOutside}>
          <flode-canvas
            .graph=${flow.graph}
            .minimap=${this.minimapVisible}
            .hass=${this.hass}
            .selectedId=${this.selectedId}
            .runMarks=${this.debugOpen ? this.runMarks : null}
            .activeRunNode=${this.debugOpen ? this.activeRunNode : null}
            @graph-change=${(e: CustomEvent<{ graph: FlowGraph }>) => this.commit(e.detail.graph)}
            @add-next=${this.onAddNext}
            @canvas-menu=${(e: CustomEvent<CanvasMenuDetail>) => {
              this.canvasMenu = e.detail;
            }}
            @select=${(e: CustomEvent<{ id: string | null }>) => {
              this.selectedId = e.detail.id;
              this.inspectorError = null;
            }}
          >
            ${
              flow.item.kind === 'automation'
                ? html`<div slot="empty" class="empty-start">
                    <p>${t(language, 'emptyHint')}</p>
                    <button class="save" @click=${() => void this.openAddDialog('trigger')}>
                      <ha-icon icon="mdi:plus"></ha-icon>${t(language, 'addFirstTrigger')}
                    </button>
                  </div>`
                : html`<div slot="empty" class="empty-start">
                    <p>${t(language, 'emptyScriptHint')}</p>
                    <button class="save" @click=${() => void this.openAddDialog('action')}>
                      <ha-icon icon="mdi:plus"></ha-icon>${t(language, 'addFirstAction')}
                    </button>
                  </div>`
            }
          </flode-canvas>
          ${this.renderCanvasMenu(flow)}
          <div
            class="resizer"
            title=${t(language, 'resize')}
            @pointerdown=${this.onResizeStart}
            @dblclick=${() => {
              this.inspectorWidth = null;
              storeInspectorWidth(null);
            }}
          ></div>
          <div class="side ${this.assistOpen || this.debugOpen || selected ? 'open' : ''}">
          <div class="sheet-bar">
            <span class="grip"></span>
            <ha-icon-button .label=${t(language, 'close')} @click=${() => this.closeSheet()}>
              <ha-icon icon="mdi:close"></ha-icon>
            </ha-icon-button>
          </div>
          ${
            this.assistOpen && this.aiEntityId
              ? html`<flode-assist
                  style=${this.inspectorWidth ? `--inspector-width: ${this.inspectorWidth}px` : ''}
                  .hass=${this.hass}
                  .aiEntityId=${this.aiEntityId}
                  .graph=${flow.graph}
                  .kind=${flow.item.kind}
                  @assist-apply=${this.onAssistApply}
                ></flode-assist>`
              : this.debugOpen && !flow.isNew
                ? html`<flode-debug
                  style=${this.inspectorWidth ? `--inspector-width: ${this.inspectorWidth}px` : ''}
                  .hass=${this.hass}
                  .item=${flow.item}
                  .graph=${flow.graph}
                  .aiEntityId=${this.aiEntityId}
                  .manualRuns=${this.manualRuns.filter((run) => run.graphId === flow.graph.id)}
                  @test-template=${(e: CustomEvent<{ variables: Record<string, unknown> }>) =>
                    this.openTemplates(e.detail.variables)}
                  @run-marks=${(
                    e: CustomEvent<{ marks: Map<string, RunMark> | null; active: string | null }>
                  ) => {
                    this.runMarks = e.detail.marks;
                    this.activeRunNode = e.detail.active;
                  }}
                ></flode-debug>`
                : html`          <flode-inspector
              style=${this.inspectorWidth ? `--inspector-width: ${this.inspectorWidth}px` : ''}
              .hass=${this.hass}
              .node=${selected}
              .error=${this.inspectorError}
              @data-change=${this.onDataChange}
              @step-change=${this.onStepChange}
            @run-from=${(e: CustomEvent<{ id: string }>) => {
              this.runFromId = e.detail.id;
            }}
              @delete=${this.onDelete}
            ></flode-inspector>`
          }
          </div>
        </div>
        <div class="add-lists" hidden>
          <ha-automation-trigger
            data-kind="trigger"
            .hass=${this.hass}
            .triggers=${NO_STEPS}
            @value-changed=${(e: CustomEvent<{ value: unknown }>) => this.onStepAdded('trigger', e)}
          ></ha-automation-trigger>
          <ha-automation-condition
            data-kind="condition"
            .hass=${this.hass}
            .conditions=${NO_STEPS}
            @value-changed=${(e: CustomEvent<{ value: unknown }>) => this.onStepAdded('condition', e)}
          ></ha-automation-condition>
          <ha-automation-action
            data-kind="action"
            .hass=${this.hass}
            .actions=${NO_STEPS}
            @value-changed=${(e: CustomEvent<{ value: unknown }>) => this.onStepAdded('action', e)}
          ></ha-automation-action>
        </div>
      </div>
    `;
  }

  /** No AI yet: how to set it up in HA (HA's own alert, links into HA's settings). */
  private renderAiSetup() {
    if (this.aiEntityId || this.aiSetupHidden || !this.hass) return nothing;
    const language = this.language;
    return html`<ha-alert alert-type="info" .title=${t(language, 'aiSetupTitle')}>
      ${t(language, this.aiNeedsDefault ? 'aiSetupDefault' : 'aiSetupText')}
      <div class="ai-setup-actions">
        ${
          this.aiNeedsDefault
            ? nothing
            : html`<ha-button appearance="plain" @click=${() => navigateInHa('/config/integrations/dashboard')}>
                ${t(language, 'aiOpenIntegrations')}
              </ha-button>`
        }
        <ha-button appearance="plain" @click=${() => navigateInHa('/config/ai-tasks')}>
          ${t(language, 'aiOpenDefault')}
        </ha-button>
        <ha-button
          appearance="plain"
          @click=${() => {
            this.aiSetupHidden = true;
            writeFlag(AI_SETUP_HIDDEN_KEY, true);
          }}
        >
          ${t(language, 'aiDismiss')}
        </ha-button>
      </div>
    </ha-alert>`;
  }

  /** "Last run: 20:14" from HA's state — a click opens the runs. */
  private renderLastRun(flow: OpenFlow) {
    const last = this.hass?.states[flow.item.entityId]?.attributes.last_triggered;
    if (flow.isNew || typeof last !== 'string') return nothing;
    const when = new Date(last).toLocaleString(this.language, {
      dateStyle: 'short',
      timeStyle: 'short',
    });
    return html`<button class="last-run" title=${t(this.language, 'showRuns')} @click=${() => {
      this.debugOpen = true;
      this.assistOpen = false;
    }}>
      <ha-icon icon="mdi:history"></ha-icon>${t(this.language, 'lastRun')}: ${when}
    </button>`;
  }

  private renderTabs() {
    const language = this.language;
    return html`
      <nav class="tabs" aria-label=${t(language, 'tabsLabel')}>
        ${this.tabs.map((tab) => {
          const flow = this.tabFlow(tab);
          const active = tab.id === this.activeTabId;
          const unsaved = this.tabSaveState(tab) !== 'saved';
          return html`
            <div
              class="tab ${active ? 'active' : ''}"
              role="tab"
              aria-selected=${active ? 'true' : 'false'}
              title=${flow.graph.name}
              @click=${() => this.switchTab(tab.id)}
            >
              <span class="tab-name">${flow.graph.name}</span>
              ${unsaved ? html`<span class="tab-dot" title=${t(language, 'unsaved')}></span>` : nothing}
              <ha-icon-button
                class="tab-close"
                .label=${t(language, 'closeTab')}
                @click=${(event: Event) => {
                  event.stopPropagation();
                  void this.closeTab(tab.id);
                }}
              >
                <ha-icon icon="mdi:close"></ha-icon>
              </ha-icon-button>
            </div>
          `;
        })}
        <ha-icon-button .label=${t(language, 'newTab')} @click=${() => this.startNew()}>
          <ha-icon icon="mdi:plus"></ha-icon>
        </ha-icon-button>
      </nav>
    `;
  }

  render() {
    return html`
      ${this.flow && !this.showHome ? this.renderEditor(this.flow) : this.renderHome()}
      <flode-palette
        .hass=${this.hass}
        .entries=${this.paletteOpen ? this.paletteEntries() : []}
        .open=${this.paletteOpen}
        @closed=${() => {
          this.paletteOpen = false;
        }}
      ></flode-palette>
      <flode-yaml-view
        .hass=${this.hass}
        .graph=${this.flow?.graph}
        .kind=${this.flow?.item.kind ?? 'automation'}
        .open=${this.yamlViewOpen}
        @closed=${() => {
          this.yamlViewOpen = false;
        }}
      ></flode-yaml-view>
      <flode-shortcuts
        .hass=${this.hass}
        .open=${this.shortcutsOpen}
        @closed=${() => {
          this.shortcutsOpen = false;
        }}
      ></flode-shortcuts>
      <flode-yaml-import
        .hass=${this.hass}
        .open=${this.yamlImportOpen}
        @closed=${() => {
          this.yamlImportOpen = false;
        }}
        @imported=${(e: CustomEvent<ImportedFlow>) => this.openImported(e.detail)}
      ></flode-yaml-import>
      <flode-runfrom
        .hass=${this.hass}
        .graph=${this.flow?.graph}
        .nodeId=${this.runFromId}
        .label=${this.runFromLabel()}
        @closed=${() => {
          this.runFromId = null;
        }}
        @run-start=${this.onRunStart}
      ></flode-runfrom>
      <flode-templates
        .hass=${this.hass}
        .open=${this.templatesOpen}
        .item=${this.flow && !this.showHome && !this.flow.isNew ? this.flow.item : null}
        .given=${this.templateVars}
        @closed=${() => {
          this.templatesOpen = false;
        }}
      ></flode-templates>
      <flode-ai-dialog
        .hass=${this.hass}
        .aiEntityId=${this.aiEntityId}
        .kind=${this.homeKind === 'script' ? 'script' : 'automation'}
        .open=${this.aiOpen}
        @closed=${() => {
          this.aiOpen = false;
        }}
        @ai-draft=${this.onAiDraft}
      ></flode-ai-dialog>
    `;
  }

  static styles = css`
    :host {
      display: block;
      /* HA's partial-panel-resolver has no definite height, so 100% collapsed
         the editor to its content — size to the viewport like HA's own panels. */
      height: 100vh;
      height: 100dvh;
      background: var(--primary-background-color);
      color: var(--primary-text-color);
      font-family: var(--ha-font-family-body, Roboto, sans-serif);
    }
    .muted {
      color: var(--secondary-text-color);
    }
    .center {
      text-align: center;
    }
    /* The whole start screen scrolls at the panel's edge, so the centred
       content keeps one width whether the list is long (automations) or not. */
    .home-scroll {
      height: 100%;
      overflow-y: auto;
    }
    .home {
      box-sizing: border-box;
      max-width: 1100px;
      margin: 0 auto;
      padding: 32px 16px 64px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    h1 {
      margin: 0;
      font-size: 30px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .merge-bar {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-radius: 12px;
      background: color-mix(in srgb, var(--primary-color) 10%, transparent);
    }
    .merge-text {
      flex: 1;
      font-size: 14px;
    }
    .merge-text strong {
      margin-left: 6px;
    }
    .item.picked {
      outline: 2px solid var(--primary-color);
    }
    .item-name ha-checkbox {
      margin: -8px 4px -8px -8px;
      vertical-align: middle;
    }
    .home-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .home-actions {
      display: flex;
      align-items: center;
      flex: none;
      gap: 8px;
      justify-content: flex-end;
    }
    .home-actions .save {
      white-space: nowrap;
    }
    /* Same purple as the editor's AI assistant button. */
    .save.ai {
      color: #fff;
      background: linear-gradient(
        135deg,
        var(--deep-purple-color, #673ab7),
        var(--purple-color, #9c27b0)
      );
    }
    .save.ai:hover {
      filter: brightness(1.1);
    }
    .ai-setup-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 8px;
    }
    .home-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }
    .home-head p {
      margin: 6px 0 0;
    }
    .home-head > div {
      flex: 1;
      min-width: 0;
    }
    .home-head ha-menu-button {
      flex: none;
      margin: -2px -8px 0 -12px;
    }
    .empty-start {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      color: var(--secondary-text-color);
    }
    .empty-start p {
      margin: 0;
      font-size: 15px;
    }
    .kinds {
      display: flex;
      gap: 4px;
      padding: 4px;
      border-radius: 12px;
      background: var(--secondary-background-color);
    }
    .kinds button {
      height: 32px;
      padding: 0 16px;
      border: 0;
      border-radius: 9px;
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      color: var(--secondary-text-color);
      background: transparent;
    }
    .kinds button.active {
      color: var(--primary-text-color);
      background: var(--card-background-color);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
    }
    .search {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 44px;
      padding: 0 14px;
      border-radius: 12px;
      border: 1px solid var(--divider-color);
      background: var(--card-background-color);
      color: var(--secondary-text-color);
    }
    .search:focus-within {
      border-color: var(--primary-color);
    }
    .search input {
      flex: 1;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-size: 15px;
    }
    .group-title {
      margin: 8px 0 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--secondary-text-color);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 12px;
    }
    .item {
      padding: 14px 16px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 10px;
      transition: transform 0.15s;
    }
    .item:hover {
      transform: translateY(-1px);
    }
    .item.off {
      opacity: 0.65;
    }
    .item-name {
      font-weight: 600;
      font-size: 15px;
    }
    .item-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--secondary-text-color);
    }
    .spacer {
      flex: 1;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--disabled-text-color, #999);
    }
    .dot.on {
      background: var(--success-color, #43a047);
    }
    .message {
      margin: 0;
      padding: 10px 14px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--warning-color, #ffa600) 15%, transparent);
      font-size: 13px;
    }
    .editor {
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 8px;
      min-height: 56px;
      box-sizing: border-box;
      border-bottom: 1px solid var(--divider-color);
      background: var(--app-header-background-color, var(--card-background-color));
      color: var(--app-header-text-color, var(--primary-text-color));
    }
    .name {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: baseline;
      gap: 10px;
    }
    .flow-name {
      min-width: 0;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      cursor: pointer;
      text-align: left;
      font-size: 18px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .status {
      font-size: 12px;
      opacity: 0.75;
      white-space: nowrap;
    }
    .status.unsaved {
      color: var(--warning-color, #ffa600);
      opacity: 1;
    }
    .tools {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 2px;
      min-width: 0;
    }
    .save {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-left: 6px;
      height: 36px;
      padding: 0 16px;
      border: 0;
      border-radius: 18px;
      font: inherit;
      font-weight: 500;
      cursor: pointer;
      color: var(--text-primary-color, #fff);
      background: var(--primary-color);
      --mdc-icon-size: 18px;
    }
    .save:disabled {
      opacity: 0.45;
      cursor: default;
    }
    .add {
      position: relative;
    }
    .menu {
      position: absolute;
      top: 44px;
      right: 0;
      z-index: 5;
      display: flex;
      flex-direction: column;
      min-width: 180px;
      padding: 6px;
      border-radius: 12px;
      background: var(--card-background-color);
      border: 1px solid var(--divider-color);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    }
    .menu button {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      text-align: left;
      cursor: pointer;
      --mdc-icon-size: 18px;
    }
    .menu button ha-icon {
      color: var(--node-color);
    }
    .menu button:hover {
      background: var(--secondary-background-color);
    }
    .last-run {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border: 0;
      border-radius: 999px;
      font: inherit;
      font-size: 12px;
      white-space: nowrap;
      cursor: pointer;
      color: var(--secondary-text-color);
      background: var(--secondary-background-color);
      --mdc-icon-size: 14px;
    }
    .last-run:hover {
      color: var(--primary-text-color);
    }
    .tool-group {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .tool-sep {
      width: 1px;
      height: 24px;
      margin: 0 8px;
      background: color-mix(in srgb, var(--secondary-text-color) 45%, transparent);
    }
    /* Panels you switch on (runs, AI) carry their name — icons alone got hard to tell apart. */
    .tool-labeled {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 34px;
      padding: 0 12px;
      border: 1px solid var(--divider-color);
      border-radius: 17px;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      white-space: nowrap;
      cursor: pointer;
      color: var(--primary-text-color);
      background: transparent;
      --mdc-icon-size: 18px;
    }
    .tool-labeled:hover:not([disabled]) {
      border-color: var(--primary-color);
    }
    .tool-labeled.active {
      color: var(--primary-color);
      border-color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 12%, transparent);
    }
    /* The AI assistant stands out — HA's own purple tones, white text. */
    .tool-labeled.ai {
      border-color: transparent;
      color: #fff;
      background: linear-gradient(
        135deg,
        var(--deep-purple-color, #673ab7),
        var(--purple-color, #9c27b0)
      );
    }
    .tool-labeled.ai:hover:not([disabled]) {
      border-color: transparent;
      filter: brightness(1.1);
    }
    .tool-labeled.ai.active {
      color: #fff;
      border-color: transparent;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--purple-color, #9c27b0) 45%, transparent);
    }
    .tool-labeled[disabled] {
      opacity: 0.45;
      cursor: default;
    }
    .tools ha-icon-button.active {
      color: var(--primary-color);
    }
    flode-assist,
    flode-debug {
      width: var(--inspector-width, clamp(360px, 28vw, 520px));
      flex: none;
      background: var(--card-background-color);
    }
    .tabs {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 0 8px;
      overflow-x: auto;
      border-bottom: 1px solid var(--divider-color);
      --mdc-icon-button-size: 32px;
      --mdc-icon-size: 16px;
    }
    .tab {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      max-width: 240px;
      height: 36px;
      padding: 0 2px 0 12px;
      flex: none;
      cursor: pointer;
      color: var(--secondary-text-color);
      border-bottom: 2px solid transparent;
    }
    .tab:hover {
      color: var(--primary-text-color);
    }
    .tab.active {
      color: var(--primary-text-color);
      border-bottom-color: var(--primary-color);
    }
    .tab-name {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 13px;
      font-weight: 500;
    }
    .tab-dot {
      width: 6px;
      height: 6px;
      flex: none;
      border-radius: 50%;
      background: var(--warning-color, #ffa600);
    }
    .work {
      flex: 1;
      min-height: 0;
      display: flex;
    }
    flode-canvas {
      flex: 1;
      min-width: 0;
    }
    flode-inspector {
      width: var(--inspector-width, clamp(360px, 28vw, 520px));
      flex: none;
      background: var(--card-background-color);
    }
    .resizer {
      flex: none;
      width: 7px;
      margin-right: -4px;
      z-index: 1;
      cursor: col-resize;
      touch-action: none;
      background: linear-gradient(
        to right,
        transparent 3px,
        var(--divider-color) 3px,
        var(--divider-color) 4px,
        transparent 4px
      );
    }
    .resizer:hover,
    .resizer:active {
      background: linear-gradient(
        to right,
        transparent 2px,
        var(--primary-color) 2px,
        var(--primary-color) 5px,
        transparent 5px
      );
    }
    .import-warnings {
      display: block;
      margin: 8px 12px 0;
    }
    .import-warnings ul {
      margin: 6px 0 0;
      padding-left: 20px;
    }
    .menu-anchor {
      position: fixed;
      width: 1px;
      height: 1px;
      pointer-events: none;
    }
    .actions {
      display: flex;
      align-items: center;
      flex: none;
    }
    .side {
      display: contents;
    }
    .sheet-bar {
      display: none;
    }
    /* Phones: header in two rows, side panels as a bottom sheet. */
    @media (max-width: 760px) {
      .toolbar {
        flex-wrap: wrap;
        row-gap: 0;
        padding-bottom: 0;
      }
      .toolbar > .name {
        order: 1;
      }
      .toolbar > .actions {
        order: 2;
      }
      .tools {
        order: 3;
        flex: 1 0 100%;
        flex-wrap: nowrap;
        justify-content: flex-start;
        overflow-x: auto;
        scrollbar-width: none;
        padding-bottom: 4px;
      }
      .tools::-webkit-scrollbar {
        display: none;
      }
      .tool-label,
      .status,
      .last-run {
        display: none;
      }
      .tool-labeled {
        padding: 0 10px;
      }
      .save {
        padding: 0 12px;
      }
      /* The + menu opens as an action sheet from the bottom (the tool strip scrolls and would clip it). */
      .add .menu {
        position: fixed;
        top: auto;
        left: 8px;
        right: 8px;
        bottom: 8px;
        z-index: 20;
        padding: 8px;
      }
      .add .menu button {
        padding: 14px 12px;
        font-size: 15px;
      }
      .work {
        position: relative;
      }
      .resizer {
        display: none;
      }
      .side {
        display: none;
      }
      .side.open {
        position: absolute;
        left: 8px;
        right: 8px;
        bottom: 8px;
        z-index: 10;
        height: 58%;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border-radius: 16px;
        border: 1px solid var(--divider-color);
        background: var(--card-background-color);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
      }
      .side.open > :not(.sheet-bar) {
        flex: 1;
        min-height: 0;
        width: auto;
      }
      .sheet-bar {
        position: relative;
        display: flex;
        justify-content: flex-end;
        align-items: center;
        flex: none;
        height: 36px;
        --mdc-icon-button-size: 36px;
        --mdc-icon-size: 20px;
      }
      .grip {
        position: absolute;
        top: 8px;
        left: 50%;
        width: 40px;
        height: 4px;
        margin-left: -20px;
        border-radius: 2px;
        background: var(--divider-color);
      }
    }
  `;
}

customElements.define('flode-panel', FlodePanel);
