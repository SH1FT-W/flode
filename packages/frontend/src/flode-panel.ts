import {
  type FlowDirection,
  type FlowGraph,
  FlowMetadataSchema,
  type FlowNode,
  flowAxis,
  isPlainObject,
  isScriptStart,
  NodeSchema,
  SCRIPT_START_TRIGGER,
} from '@flode/shared';
import { dump as yamlDump } from 'js-yaml';
import { css, html, LitElement, nothing, type PropertyValues } from 'lit';
import './flode-canvas';
import './flode-inspector';
import type { NodeDataEdit, NodesChange } from './flode-inspector';
import './flode-debug';
import './flode-ai';
import './flode-assist';
import './flode-palette';
import './flode-map';
import './flode-templates';
import type { SequenceScope } from '@flode/transpiler';
import './flode-runfrom';
import './flode-shortcuts';
import './flode-ha-list';
import './flode-progress';
import { chooseAiTask, keepAiTask, mergeAutomations, randomId } from '@flode/ui-core';
import {
  addFrame,
  addFrameAround,
  addNote,
  kindOf,
  nextColor,
  removeAnnotation,
  snapToGrid,
} from './annotations';
import {
  type BranchCardRef,
  type BranchView,
  branchInsertAt,
  branchLabelText,
  cachedBranchView,
  cardShape,
  detachBranchStep,
  drawnBox,
  insertBranchStep,
  removeBranchStep,
  setBranchStep,
  storedPosition,
  withoutStaleOffsets,
} from './branch-view';
import { defineElement } from './define-element';
import type { AddAt, CanvasMenuDetail, FlodeCanvas, SelectionAction } from './flode-canvas';
import { type FlodeHaList, HA_LIST_TAGS } from './flode-ha-list';
import { downloadFlowJson, type ImportedFlow, pickFlowJson } from './flode-io';
import type { PaletteEntry } from './flode-palette';
import type { Progress } from './flode-progress';
import { type WelcomeMode, welcomeMode } from './flode-welcome';
import {
  addNode,
  applyProposal,
  connect,
  copyNode,
  disconnectNode,
  duplicateNode,
  ensureScriptEntry,
  freePosition,
  insertBetween,
  moveNode,
  NODE_HEIGHT,
  NODE_WIDTH,
  nextPosition,
  outgoing,
  removeEdge,
  removeNode,
  scriptStartId,
  setNodeStep,
  toggleNodeEnabled,
  updateNodeData,
  visibleGraph,
  withEnabledToggled,
} from './flow-model';
import { flowYaml } from './flow-yaml';
import {
  type AutomationListItem,
  type AutomationSettings,
  applyRegistryUpdate,
  blueprintPath,
  configFingerprint,
  confirmUnsavedChanges,
  ensureAutomationEditors,
  errorMessage,
  type FlowKind,
  flowName,
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
  sameFlow,
  saveFlowConfig,
  substituteBlueprint,
  syncScriptIds,
  usesBlueprint,
  waitForAutomationEntity,
} from './ha';
import {
  completeNewStep,
  nodeToStep,
  type StepEdit,
  type StepKind,
  stepKind,
  stepKindsFor,
  stepToNode,
} from './ha-step';
import { mapT } from './i18n';
import { InFlight, Serial } from './in-flight';
import { withLineBends } from './line-bends';
import { LOGBOOK_POLL_MS, type ManualRun } from './manual-runs';
import { mergeWarningsHeading, mergeWarningText } from './merge-warnings';
import { NODE_META, nodeTitle, summarize, typeLabel } from './node-meta';
import { copyToClipboard, notify } from './notify';
import {
  describeFlowCheckErrors,
  describeHaSaveError,
  type SaveProblem,
  SaveProblemError,
} from './save-errors';
import {
  pasteSnapshot,
  removeSelection,
  type SelectionSnapshot,
  selectionBox,
  snapshotSelection,
  toggleSelectionEnabled,
} from './selection';
import {
  haDialogShowing,
  isInDialog,
  labelWithHint,
  matchShortcut,
  type ShortcutId,
  shortcutHint,
  shortcutKeys,
} from './shortcuts';
import { type StringKey, t } from './strings';
import {
  continuesStep,
  type EditorTab,
  type HistoryMark,
  historySaveState,
  type OpenFlow,
  readTabs,
  type SaveResult,
  type SaveState,
  settleSave,
  writeTabs,
} from './tabs';
import type { RunMark } from './trace';
import { isNarrow, isTouch, SHEET_SHARE } from './viewport';

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
const HA_CARD_TEXT_KEY = 'flode3.haCardText';
/** Flows without a saved direction open top to bottom (#29). */
const VERTICAL_KEY = 'flode3.vertical';
/** The side panel shows only while a card, the assistant or the runs are open (#28). */
const AUTO_SIDE_KEY = 'flode3.autoSide';
const DIRECTION_ICON: Record<FlowDirection, string> = {
  right: 'mdi:arrow-right',
  down: 'mdi:arrow-down',
};

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

interface HomeTab {
  view: HomeView;
  label: string;
}

/** Stable empty list for HA's hidden add lists (a new array per render would reset them). */
const NO_STEPS: readonly unknown[] = [];
const ADD_LIST_PROP: Record<StepKind, string> = {
  trigger: 'triggers',
  condition: 'conditions',
  action: 'actions',
};
const HISTORY_LIMIT = 100;

/** `past` with `graph` as its newest undo step (at most `HISTORY_LIMIT`). */
function withHistory(past: FlowGraph[], graph: FlowGraph): FlowGraph[] {
  return [...past.slice(-HISTORY_LIMIT + 1), graph];
}

/** Edits of one card's form share an undo step while they come in quickly. */
function cardEditKey(id: string): string {
  return `card:${id}`;
}

/** The answer to "changed in Home Assistant meanwhile" when saving. */
type ConflictChoice = 'overwrite' | 'reload' | 'cancel';

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

/**
 * The import layout (ELK, from the transpiler) over the visible cards, branch
 * steps back in place — "Aufräumen". Runs the way the flow does, or the way
 * it is turned to (`turnTo`, #29).
 */
async function layoutGraph(graph: FlowGraph, turnTo?: FlowDirection): Promise<FlowGraph> {
  const { applyHeuristicLayout } = await loadTranspiler();
  // Moved branch steps go back into their lanes too, lines laid by hand are laid anew.
  const { branchOffsets: _moved, lineBends: _laid, ...rest } = graph;
  // Turned on purpose, the direction is kept — left to right too, so a flow
  // arranged so stays so when flows open top to bottom by default.
  const turned: FlowGraph = turnTo ? { ...rest, direction: turnTo } : rest;
  const axis = flowAxis(turned);
  const view = cachedBranchView(turned);
  const shown = visibleGraph(graph);
  // An expanded block takes the room of all its branches across the flow (they
  // spread around it), so nothing beside it lands on them; along the flow the
  // branch view moves what follows anyway.
  const boxes = new Map(
    shown.nodes.map((node) => {
      const card = {
        width: NODE_WIDTH,
        height: axis.direction === 'down' ? cardShape(view, node).height : NODE_HEIGHT,
      };
      const box = drawnBox(view, node.id);
      const before = axis.cross(node.position) - box.crossStart;
      const breadth = Math.max(axis.breadth(card), box.crossEnd - box.crossStart);
      return [node.id, { size: axis.at(axis.length(card), breadth), before }];
    })
  );
  const laidOut = await applyHeuristicLayout(
    shown.nodes,
    shown.edges,
    Object.fromEntries([...boxes].map(([id, { size }]) => [id, { width: size.x, height: size.y }])),
    axis.direction
  );
  // ELK places the boxes; each card sits in its own where its branches leave room.
  const positions = new Map(
    laidOut.map((node) => {
      const before = boxes.get(node.id)?.before ?? 0;
      return [node.id, axis.at(axis.main(node.position), axis.cross(node.position) + before)];
    })
  );
  return {
    ...turned,
    nodes: graph.nodes.map((node) => ({
      ...node,
      position: positions.get(node.id) ?? node.position,
    })),
  };
}

/**
 * Phones: the tool strip scrolls sideways — `more` / `less` say there is more
 * of it to the right / left, which fades that edge (see `.tools` styles).
 */
function markScrollable(strip: HTMLElement): void {
  strip.classList.toggle('less', strip.scrollLeft > 1);
  strip.classList.toggle('more', strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1);
}

/** The name a new automation / script starts with ("New automation", "Neues Skript" …). */
function newFlowName(language: string, kind: FlowKind): string {
  return t(language, kind === 'script' ? 'newScript' : 'newAutomation');
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
    multiIds: { state: true },
    saveState: { state: true },
    message: { state: true },
    saveProblem: { state: true },
    progress: { state: true },
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
    haCardText: { state: true },
    verticalDefault: { state: true },
    autoSide: { state: true },
    yamlViewOpen: { state: true },
    canvasMenu: { state: true },
    templatesOpen: { state: true },
    runFromId: { state: true },
    runScope: { state: true },
    manualRuns: { state: true },
    yamlImportOpen: { state: true },
    mergeMode: { state: true },
    mergeIds: { state: true },
    haList: { state: true },
    welcome: { state: true },
    templateVars: { state: true },
    aiSetupHidden: { state: true },
    runMarks: { state: true },
    activeRunNode: { state: true },
    conflict: { state: true },
  };

  declare hass: HomeAssistant | undefined;
  declare narrow: boolean;
  declare query: string;
  declare flow: OpenFlow | null;
  declare selectedId: string | null;
  /** Cards and notes picked together on the canvas (marquee, Shift-click). */
  declare multiIds: string[];
  declare saveState: SaveState;
  declare message: string | null;
  /** Why the active tab's last save failed (its bar and the red card). */
  declare saveProblem: SaveProblem | null;
  /** A running load (opening, merging) — shown as HA dialog with a progress bar. */
  declare progress: Progress | null;
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
  /** Cards worded like HA's own editor (per browser); FLODE's sentences otherwise. */
  declare haCardText: boolean;
  /** Flows without a saved direction open top to bottom (#29). */
  declare verticalDefault: boolean;
  /** The side panel shows only while something in it is open (#28). */
  declare autoSide: boolean;
  declare yamlViewOpen: boolean;
  /** Right-click menu on the canvas (null = closed). */
  declare canvasMenu: CanvasMenuDetail | null;
  /** ⌘C/⌘V — FLODE's own card clipboard (works across tabs). */
  private copiedNode: FlowNode | null = null;
  /** Several cards copied together (with the connections between them) — pasted instead of `copiedNode`. */
  private copiedSelection: SelectionSnapshot | null = null;
  declare templatesOpen: boolean;
  /** The block "run from here" was chosen for (its confirmation is open). */
  declare runFromId: string | null;
  declare runScope: SequenceScope;
  /** "Run from here" executions of this page view (newest first). */
  declare manualRuns: ManualRun[];
  declare yamlImportOpen: boolean;
  /** Start screen: picking automations to merge. */
  declare mergeMode: boolean;
  declare mergeIds: string[];
  /** HA's own list page is available (null = still loading it). */
  declare haList: boolean | null;
  /** Start sheet: welcome on the first visit, what's new after an update. */
  declare welcome: WelcomeMode | null;
  /** Variables handed over from a run step ("test a template with these"). */
  declare templateVars: Record<string, unknown> | null;
  declare aiSetupHidden: boolean;
  declare runMarks: Map<string, RunMark> | null;
  declare activeRunNode: string | null;
  /** Saving found the flow changed in HA meanwhile — the question is open. */
  declare conflict: { name: string; resolve: (choice: ConflictChoice) => void } | null;

  private past: FlowGraph[] = [];
  private future: FlowGraph[] = [];
  /** The last edit in the undo history — typing in HA's form continues it (see `continuesStep`). */
  private lastEdit: HistoryMark | null = null;
  /** HA dialogs FLODE opened that are still open (rename, unsaved changes, run script). */
  private haDialogs = 0;
  /** Every tab this window had (open or closed) — other windows' drafts are the rest. */
  private readonly knownTabIds = new Set<string>();
  private storageFullNoted = false;

  constructor() {
    super();
    this.narrow = false;
    this.query = '';
    this.flow = null;
    this.selectedId = null;
    this.multiIds = [];
    this.saveState = 'saved';
    this.message = null;
    this.saveProblem = null;
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
    this.haCardText = readFlag(HA_CARD_TEXT_KEY);
    this.verticalDefault = readFlag(VERTICAL_KEY);
    this.autoSide = readFlag(AUTO_SIDE_KEY);
    this.yamlViewOpen = false;
    this.canvasMenu = null;
    this.templatesOpen = false;
    this.templateVars = null;
    this.runFromId = null;
    this.runScope = 'from';
    this.manualRuns = [];
    this.yamlImportOpen = false;
    this.mergeMode = false;
    this.mergeIds = [];
    this.haList = null;
    this.progress = null;
    this.welcome = welcomeMode();
    this.aiSetupHidden = readFlag(AI_SETUP_HIDDEN_KEY);
    this.runMarks = null;
    this.activeRunNode = null;
    this.conflict = null;
    this.restoreTabs();
  }

  // ---- remembered tabs --------------------------------------------------------

  private persistTimer: number | undefined;

  /** Tabs from before a reload; unchanged ones are refreshed from HA when shown. */
  private restoreTabs(): void {
    const stored = readTabs();
    if (!stored || stored.tabs.length === 0) return;
    for (const tab of stored.tabs) this.knownTabIds.add(tab.id);
    this.tabs = stored.tabs;
    const active = stored.tabs.find((tab) => tab.id === stored.activeTabId);
    if (active) this.activateTab(active);
    this.showHome = stored.showHome;
  }

  private persistTabs(): void {
    window.clearTimeout(this.persistTimer);
    this.persistTimer = undefined;
    const viewport = this.canvas?.viewport;
    const stored = writeTabs(
      {
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
      },
      this.knownTabIds
    );
    // Said once per page view — every later write would fail the same way.
    if (!stored && !this.storageFullNoted) {
      this.storageFullNoted = true;
      this.notify(t(this.language, 'tabsStorageFull'));
    }
  }

  private schedulePersist(): void {
    window.clearTimeout(this.persistTimer);
    this.persistTimer = window.setTimeout(() => this.persistTabs(), 400);
  }

  private onPageHide = (): void => this.persistTabs();

  /**
   * HA has no event when the AI default changes — re-read it whenever the
   * window regains focus. The open flow may have been changed in HA meanwhile.
   */
  private onWindowFocus = (): void => {
    void this.loadAiChoice();
    this.refreshActiveTab();
  };

  private onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') this.refreshActiveTab();
  };

  /** Counts the reads — an older answer arriving late is ignored. */
  private aiChoiceRead = 0;

  private async loadAiChoice(): Promise<void> {
    const hass = this.hass;
    if (!hass) return;
    const read = ++this.aiChoiceRead;
    const next = await chooseAiTask((message) => hass.callWS(message), hass.states);
    if (read !== this.aiChoiceRead) return;
    const choice = keepAiTask(
      { entityId: this.aiEntityId, needsDefault: this.aiNeedsDefault },
      next
    );
    this.aiEntityId = choice.entityId;
    this.aiNeedsDefault = choice.needsDefault;
  }

  private updateManualRun(id: string, patch: Partial<ManualRun>): void {
    this.manualRuns = this.manualRuns.map((run) => (run.id === id ? { ...run, ...patch } : run));
  }

  private notify(message: string): void {
    notify(this, message);
  }

  /**
   * "Done – ⌘Z to undo" once `before` was changed; on a touch screen without the
   * shortcut, with an undo button instead.
   */
  private notifyUndoable(before: FlowGraph, done: StringKey, withShortcut: StringKey): void {
    // Not taken (a blueprint flow says so itself): nothing to undo.
    if (!this.flow || this.flow.graph === before) return;
    if (!isTouch()) {
      this.notify(t(this.language, withShortcut));
      return;
    }
    // Only while that change is still the last one (not after further edits or in another tab).
    const changed = this.flow?.graph;
    notify(this, t(this.language, done), {
      text: t(this.language, 'undo'),
      action: () => {
        if (changed && this.flow?.graph === changed) this.undo();
      },
    });
  }

  /**
   * Runs the confirmed "run from here" with HA's `execute_script` and lists it
   * under "Runs" (HA keeps no trace for it), then reads what HA's logbook
   * recorded for its context.
   */
  private async onRunStart(
    event: CustomEvent<{
      sequence: unknown[];
      nodeIds: string[];
      label: string;
      scope?: SequenceScope;
      variables?: Record<string, unknown>;
    }>
  ): Promise<void> {
    const hass = this.hass;
    const flow = this.flow;
    if (!hass || !flow) return;
    const { sequence, nodeIds, label, scope, variables } = event.detail;
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
        // `trigger` of the last run, for steps that read `trigger.…`.
        ...(variables ? { variables } : {}),
      });
      const contextId = result?.context?.id;
      this.updateManualRun(run.id, { status: 'done', ...(contextId ? { contextId } : {}) });
      this.notify(
        t(language, scope === 'only' ? 'runOnlyDone' : 'runFromDone').replace('{name}', label)
      );
      if (contextId) {
        for (const delay of LOGBOOK_POLL_MS) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          this.updateManualRun(run.id, {
            logbook: await getRunLogbook(hass, run.startedAt, contextId),
          });
        }
        // Every poll is in: an empty logbook now means the run changed nothing.
        this.updateManualRun(run.id, { logbookFinal: true });
      }
    } catch (error) {
      this.updateManualRun(run.id, { status: 'error', error: errorMessage(error) });
      this.notify(`${t(language, 'runFromFailed')} ${errorMessage(error)}`);
    }
  }

  // ---- import / export / copy / merge ------------------------------------------

  /** An imported flow (pasted YAML, FLODE file) opens as a new, unsaved draft. */
  private async openImported(flow: ImportedFlow): Promise<void> {
    const name = flow.graph.name || newFlowName(this.language, flow.kind);
    this.yamlImportOpen = false;
    const graph = await this.inDefaultDirection(flow.graph);
    this.openTab({
      item: {
        kind: flow.kind,
        entityId: '',
        configId: String(Date.now()),
        name,
        enabled: true,
        lastTriggered: null,
      },
      graph: { ...graph, id: randomId(), name },
      isNew: true,
      registryEntry: null,
    });
    this.notify(t(this.language, 'ioImported'));
  }

  private async importJson(): Promise<void> {
    try {
      const flow = await pickFlowJson();
      if (flow) await this.openImported(flow);
    } catch (error) {
      this.notify(`${t(this.language, 'ioImportFailed')} ${errorMessage(error)}`);
    }
  }

  private async copyYaml(): Promise<void> {
    const flow = this.flow;
    if (!flow) return;
    await copyToClipboard(
      this,
      () => flowYaml(flow.graph, flow.item.kind),
      t(this.language, 'ioYamlCopied')
    );
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
    const heading = t(this.language, 'progressMerge');
    this.message = null;
    try {
      const sources = [];
      for (const [index, item] of items.entries()) {
        // Each source is an equal share of the bar.
        const flow = await this.loadFlow(hass, item, (step, value) => {
          this.progress = { heading, name: item.name, step, value: (index + value) / items.length };
        });
        sources.push({
          graph: flow.graph,
          automationId: item.configId,
          entityId: item.entityId,
          alias: item.name,
        });
      }
      // Laid out as one flow right away — not the source automations side by side.
      const { graph: mergedGraph, warnings } = mergeAutomations(sources);
      // Laid out once, the way flows open.
      const merged = this.verticalDefault
        ? await this.inDefaultDirection(mergedGraph)
        : await layoutGraph(mergedGraph);
      const name = t(this.language, 'mergeName').replace(
        '{names}',
        items.map((item) => item.name).join(' + ')
      );
      this.mergeMode = false;
      this.mergeIds = [];
      this.message = null;
      this.haListElement?.clearSelection();
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
        ...(warnings.length
          ? {
              importWarnings: warnings.map((warning) => mergeWarningText(this.language, warning)),
              importWarningsHeading: mergeWarningsHeading(warnings),
            }
          : {}),
      });
      this.notify(t(this.language, 'mergeDone'));
    } catch (error) {
      this.message = `${t(this.language, 'mergeFailed')} ${errorMessage(error)}`;
    } finally {
      this.progress = null;
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
   * "Waagerecht / Senkrecht anordnen": the flow laid out running `direction`
   * (#29) — ticked when `current` already runs so.
   */
  private directionEntry(direction: FlowDirection, current?: FlowDirection): MenuItem {
    const down = direction === 'down';
    return {
      id: down ? 'tidyDown' : 'tidyRight',
      icon: direction === current ? 'mdi:check' : DIRECTION_ICON[direction],
      label: t(this.language, down ? 'tidyDown' : 'tidyRight'),
      run: () => void this.tidy(direction),
    };
  }

  /** Lay the flow out either way, and which way flows open. */
  private directionEntries(current: FlowDirection): MenuEntry[] {
    return [
      this.directionEntry('right', current),
      this.directionEntry('down', current),
      'divider',
      this.verticalDefaultEntry(),
    ];
  }

  /** "Karte einfärben": the colours above the cards among `ids` (notes picked with them keep theirs) (#28). */
  private tintEntry(id: 'tintCard' | 'tintCards', ids: readonly string[]): MenuItem {
    return {
      id,
      icon: 'mdi:palette-outline',
      label: t(this.language, id),
      run: () => {
        const flow = this.flow;
        if (!flow) return;
        const drawn = new Set(cachedBranchView(flow.graph).graph.nodes.map((n) => n.id));
        this.canvas?.showTintPicker(ids.filter((card) => drawn.has(card)));
      },
    };
  }

  /** A setting in a menu, ticked while on. */
  private flagEntry(id: 'verticalDefault' | 'autoSide', on: boolean, run: () => void): MenuItem {
    return {
      id,
      icon: on ? 'mdi:checkbox-marked-outline' : 'mdi:checkbox-blank-outline',
      label: t(this.language, id),
      run,
    };
  }

  /** "Flows immer senkrecht öffnen", ticked while on. */
  private verticalDefaultEntry(): MenuItem {
    return this.flagEntry('verticalDefault', this.verticalDefault, () =>
      this.toggleVerticalDefault()
    );
  }

  /** "Seitenleiste nur bei Auswahl zeigen", ticked while on (#28). */
  private autoSideEntry(): MenuItem {
    return this.flagEntry('autoSide', this.autoSide, () => this.toggleAutoSide());
  }

  /**
   * "Aufräumen" the way the flow runs, and turning it the other way (#29) —
   * in the right-click menu.
   */
  private tidyEntries(flow: OpenFlow): MenuItem[] {
    const hint = shortcutHint('tidy');
    return [
      {
        id: 'tidy',
        icon: 'mdi:auto-fix',
        label: t(this.language, 'tidy'),
        run: () => void this.tidy(),
        ...(hint ? { hint } : {}),
      },
      this.directionEntry(flowAxis(flow.graph).direction === 'down' ? 'right' : 'down'),
    ];
  }

  /** The toolbar's direction menu (#29): lay the flow out either way, and which way flows open. */
  private renderDirectionMenu(flow: OpenFlow) {
    const direction = flowAxis(flow.graph).direction;
    const label = t(this.language, direction === 'down' ? 'directionDown' : 'directionRight');
    return this.renderMenu(
      this.directionEntries(direction),
      html`<ha-icon-button slot="trigger" .label=${label}>
        <ha-icon icon=${DIRECTION_ICON[direction]}></ha-icon>
      </ha-icon-button>`,
      { placement: 'bottom-start' }
    );
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
    // A step inside a choose / if branch gets the card's menu too (#30) — minus
    // what only a card of the flow has (its connections, run from here).
    const branchCard = this.branchCard(menu.nodeId);
    const node = branchCard
      ? cachedBranchView(flow.graph).graph.nodes.find((n) => n.id === menu.nodeId)
      : flow.graph.nodes.find((n) => n.id === menu.nodeId);
    const hinted = (id: ShortcutId, icon: string, label: string, run: () => void): MenuItem => ({
      id,
      icon,
      label,
      run,
      hint: shortcutHint(id),
    });
    const entries: MenuEntry[] = [];
    if (menu.annotationId) {
      const id = menu.annotationId;
      const isNote = kindOf(flow.graph, id) === 'note';
      entries.push(
        {
          id: 'editAnnotation',
          icon: 'mdi:pencil-outline',
          label: t(language, 'editAnnotation'),
          run: () => this.canvas?.editAnnotation(id),
        },
        {
          id: 'changeColor',
          icon: 'mdi:palette-outline',
          label: t(language, 'changeColor'),
          run: () => this.commit(nextColor(flow.graph, id)),
        },
        'divider',
        hinted(
          'delete',
          'mdi:delete-outline',
          t(language, isNote ? 'deleteNote' : 'deleteFrame'),
          () => this.commit(removeAnnotation(flow.graph, id))
        )
      );
    } else if (menu.edgeId) {
      const edgeId = menu.edgeId;
      const laid = menu.laidLine;
      if (laid) {
        entries.push(
          {
            id: 'resetLine',
            icon: 'mdi:vector-polyline-remove',
            label: t(language, 'resetLine'),
            run: () => this.commit(withLineBends(flow.graph, laid, [])),
          },
          'divider'
        );
      }
      entries.push(
        hinted('delete', 'mdi:delete-outline', t(language, 'deleteConnection'), () =>
          this.commit(removeEdge(flow.graph, edgeId))
        )
      );
    } else if (menu.nodeId && this.multiIds.length > 1 && this.multiIds.includes(menu.nodeId)) {
      const pick = (action: SelectionAction) => () => this.selectionAction(action);
      entries.push(
        hinted('copy', 'mdi:content-copy', t(language, 'copyCard'), pick('copy')),
        hinted(
          'duplicate',
          'mdi:content-duplicate',
          t(language, 'duplicateCard'),
          pick('duplicate')
        ),
        hinted(
          'toggleEnabled',
          'mdi:toggle-switch-outline',
          t(language, 'toggleSelection'),
          pick('toggle')
        ),
        {
          id: 'frameSelection',
          icon: 'mdi:select-drag',
          label: t(language, 'frameSelection'),
          run: pick('frame'),
        },
        this.tintEntry('tintCards', this.multiIds),
        'divider',
        hinted('delete', 'mdi:delete-outline', t(language, 'delete'), pick('delete'))
      );
    } else if (node && !isScriptStart(node.data)) {
      const off = 'enabled' in node.data && node.data.enabled === false;
      entries.push(
        hinted('copy', 'mdi:content-copy', t(language, 'copyCard'), () => {
          this.copiedSelection = null;
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
        this.tintEntry('tintCard', [node.id])
      );
      const disconnect = (run: () => void): MenuItem => ({
        id: 'disconnect',
        icon: 'mdi:link-variant-off',
        label: t(language, 'disconnectCard'),
        run,
      });
      // The card alone (its step is all it needs); a trigger has no step to run.
      const runOnly: MenuItem = {
        id: 'runOnly',
        icon: 'mdi:play-outline',
        label: t(language, 'runOnly'),
        run: () => this.startRun(node.id, 'only'),
      };
      if (branchCard) {
        // A branch step runs on its own, but not "from here": it has no connections of the
        // graph. Its only connection is its place in the branch: out of it, as a card of its own (#35).
        entries.push(
          'divider',
          runOnly,
          disconnect(() => {
            this.commit(detachBranchStep(flow.graph, branchCard, node));
            this.selectedId = null;
          })
        );
      } else {
        entries.push('divider');
        if (node.type !== 'trigger') entries.push(runOnly);
        entries.push({
          id: 'runFrom',
          icon: 'mdi:play-circle-outline',
          label: t(language, 'runFrom'),
          run: () => this.startRun(node.id, 'from'),
        });
        if (flow.graph.edges.some((e) => e.source === node.id || e.target === node.id))
          entries.push(disconnect(() => this.commit(disconnectNode(flow.graph, node.id))));
      }
      entries.push(
        'divider',
        hinted('delete', 'mdi:delete-outline', t(language, 'delete'), () =>
          this.removeCard(node.id)
        )
      );
    } else if (menu.after) {
      entries.push(...this.addAfterEntries(flow, menu.after));
    } else {
      const copied = this.copiedNode;
      const group = this.copiedSelection;
      if (group) {
        entries.push(
          hinted('paste', 'mdi:content-paste', t(language, 'pasteCard'), () =>
            this.pasteSelection(group, menu.position)
          ),
          'divider'
        );
      } else if (copied) {
        entries.push(
          hinted('paste', 'mdi:content-paste', t(language, 'pasteCard'), () =>
            this.pasteCard(copied, menu.position)
          ),
          'divider'
        );
      }
      for (const kind of stepKindsFor(flow.item.kind)) {
        entries.push({
          id: `add-${kind}`,
          icon: NODE_META[kind].icon,
          label: t(language, 'addHere').replace('{type}', typeName(kind, language)),
          run: () => void this.openAddDialog(kind, { position: menu.position }),
        });
      }
      entries.push(
        'divider',
        {
          id: 'addNote',
          icon: 'mdi:note-text-outline',
          label: t(language, 'addNote'),
          run: () => this.addAnnotation(flow, 'note', menu.position),
        },
        {
          id: 'addFrame',
          icon: 'mdi:select-drag',
          label: t(language, 'addFrame'),
          run: () => this.addAnnotation(flow, 'frame', menu.position),
        },
        'divider',
        hinted('fit', 'mdi:fit-to-screen-outline', t(language, 'fit'), () =>
          this.canvas?.fitView()
        ),
        ...this.tidyEntries(flow),
        'divider',
        this.autoSideEntry()
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

  /** A new note or frame at `position`, picked and ready for its text. */
  private addAnnotation(
    flow: OpenFlow,
    kind: 'note' | 'frame',
    position: { x: number; y: number }
  ) {
    const at = { x: snapToGrid(position.x), y: snapToGrid(position.y) };
    const [graph, id] = kind === 'note' ? addNote(flow.graph, at) : addFrame(flow.graph, at);
    this.commit(graph);
    this.canvas?.selectAnnotation(id, true);
  }

  /**
   * A card's "+" with a choice: after a trigger what can follow it; on an output
   * that already leads on, in between or beside what follows.
   */
  private addAfterEntries(flow: OpenFlow, after: AddAt): MenuEntry[] {
    const language = this.language;
    const source = flow.graph.nodes.find((n) => n.id === after.source);
    const leadsOn =
      !!source && outgoing(flow.graph, source.id, after.sourceHandle ?? null).length > 0;
    const add = (id: string, icon: string, label: string, kind: StepKind, at: AddAt): MenuItem => ({
      id,
      icon,
      label,
      run: () => void this.openAddDialog(kind, at),
    });
    const between = { ...after, between: true };
    if (source?.type === 'trigger' && !leadsOn) {
      return (['condition', 'action'] as const).map((kind) =>
        add(`add-${kind}`, NODE_META[kind].icon, typeLabel(kind, language), kind, after)
      );
    }
    if (source?.type === 'trigger') {
      // After a trigger that already leads on: a condition belongs in between, beside it makes no sense.
      return [
        add(
          'insert-condition',
          NODE_META.condition.icon,
          t(language, 'insertConditionBetween'),
          'condition',
          between
        ),
        add(
          'insert-action',
          NODE_META.action.icon,
          t(language, 'insertActionBetween'),
          'action',
          between
        ),
        add('add-parallel', 'mdi:call-split', t(language, 'addParallel'), 'action', after),
      ];
    }
    return [
      add('insert-between', 'mdi:source-commit', t(language, 'insertBetween'), 'action', between),
      add('add-parallel', 'mdi:call-split', t(language, 'addParallel'), 'action', after),
    ];
  }

  private runFromLabel(): string {
    const node = this.runGraph()?.nodes.find((n) => n.id === this.runFromId);
    return node ? summarize(node, this.hass).title : '';
  }

  /** Opens the run dialog for `id`: the card and everything after it, or the card alone. */
  private startRun(id: string, scope: SequenceScope): void {
    this.runScope = scope;
    this.runFromId = id;
  }

  /** The graph the run dialog works on: a branch card is a node of the drawn graph only. */
  private runGraph(): FlowGraph | undefined {
    const flow = this.flow;
    if (!flow) return undefined;
    return this.branchCard(this.runFromId) ? cachedBranchView(flow.graph).graph : flow.graph;
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
      for (const item of [this.directionEntry('right'), this.directionEntry('down')]) {
        command(item.id, item.label, item.icon, item.run);
      }
      command('fit', t(language, 'fit'), 'mdi:fit-to-screen-outline', () => this.canvas?.fitView());
      command('minimap', t(language, 'minimap'), 'mdi:map-outline', () => this.toggleMinimap());
      command('haCardText', t(language, 'haCardText'), 'mdi:home-assistant', () =>
        this.toggleHaCardText()
      );
      command('autoSide', t(language, 'autoSide'), 'mdi:dock-right', () => this.toggleAutoSide());
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
        if (selected.type !== 'trigger')
          command('runOnly', t(language, 'runOnly'), 'mdi:play-outline', () =>
            this.startRun(selected.id, 'only')
          );
        command('runFrom', t(language, 'runFrom'), 'mdi:play-circle-outline', () =>
          this.startRun(selected.id, 'from')
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
      for (const kind of stepKindsFor(flow.item.kind)) {
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
      this.startMerge();
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
    // Also on the start page: it decides how flows open.
    const vertical = this.verticalDefaultEntry();
    command(vertical.id, vertical.label, vertical.icon, vertical.run);
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

  /**
   * The assistant's proposal replaces the flow's cards — one undo step, not
   * saved. Name, description, mode and variables only change when the reply's
   * YAML wrote them (`present`: its top-level keys).
   */
  private async onAssistApply(
    event: CustomEvent<{ graph: FlowGraph; present?: string[] }>
  ): Promise<void> {
    const { graph: proposal, present } = event.detail;
    const flow = this.flow;
    if (flow) await this.applyAssist(flow.graph.id, proposal, present && new Set(present));
  }

  /** Puts the assistant's proposal into the flow `graphId`, onto whatever it is by then. */
  private async applyAssist(
    graphId: string,
    proposal: FlowGraph,
    present: Set<string> | undefined
  ): Promise<void> {
    const flow = this.flow;
    if (!flow || flow.graph.id !== graphId) {
      this.notify(t(this.language, 'assistNotApplied'));
      return;
    }
    const applied = applyProposal(flow.graph, proposal, present);
    // The proposal comes laid out left to right — a flow running top to bottom stays so
    // (should laying out fail, the change still goes in, just as it came).
    const laidOut =
      flowAxis(flow.graph).direction === 'down'
        ? await layoutGraph(applied).catch(() => applied)
        : applied;
    // Changed while laying out (an edit, undo): apply it to that instead of undoing it.
    if (this.flow !== flow) {
      await this.applyAssist(graphId, proposal, present);
      return;
    }
    this.commit(laidOut);
    this.selectedId = null;
    void this.updateComplete.then(() => this.canvas?.fitView());
    this.notifyUndoable(flow.graph, 'assistAppliedDone', 'assistAppliedToast');
  }

  /** A draft from "Build with AI" opens as a new, unsaved tab. */
  private async onAiDraft(
    event: CustomEvent<{ graph: FlowGraph; unknownEntityIds: string[]; kind: FlowKind }>
  ): Promise<void> {
    const { unknownEntityIds, kind } = event.detail;
    this.aiOpen = false;
    const graph = await this.inDefaultDirection(event.detail.graph);
    const name = graph.name || newFlowName(this.language, kind);
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
    this.notify(t(this.language, 'aiDone'));
  }

  private readonly refreshing = new InFlight();

  /**
   * A tab without unsaved changes shows HA's current version: after a reload
   * (remembered tabs) and whenever the flow was changed in HA meanwhile
   * (HA's editor, another window) — checked when the tab is shown and when
   * the window comes back.
   */
  private async refreshFromHa(id: string): Promise<void> {
    const hass = this.hass;
    const tab = this.tabs.find((candidate) => candidate.id === id);
    if (!hass || !tab) return;
    const flow = this.tabFlow(tab);
    if (flow.isNew || this.tabSaveState(tab) !== 'saved' || !this.refreshing.start(id)) return;
    try {
      const config = await loadFlowConfig(hass, flow.item.kind, flow.item.configId);
      if (flow.haVersion === configFingerprint(config)) return;
      const fresh = await this.loadFlow(hass, this.currentItem(flow.item), undefined, config);
      // Only if nothing happened to the tab meanwhile (an edit, a save).
      const now = this.tabs.find((candidate) => candidate.id === id);
      if (now && this.tabSaveState(now) === 'saved' && this.tabFlow(now) === flow) {
        this.adoptFromHa(id, fresh);
      }
    } catch {
      // Deleted or unreachable in HA — keep what the tab shows.
    } finally {
      this.refreshing.end(id);
    }
  }

  /** `item` as HA lists it now (renamed in HA meanwhile, new entity id …). */
  private currentItem(item: AutomationListItem): AutomationListItem {
    const hass = this.hass;
    return (hass && listFlows(hass, item.kind).find((other) => sameFlow(other, item))) || item;
  }

  /** Re-checks the open flow against HA (window focus, tab visible again). */
  private refreshActiveTab(): void {
    if (this.activeTabId && !this.showHome) void this.refreshFromHa(this.activeTabId);
  }

  /**
   * Tab `id` shows `fresh` (HA's version), saved. What it showed before stays
   * one undo step back.
   */
  private adoptFromHa(id: string, fresh: OpenFlow): void {
    if (id === this.activeTabId) {
      const flow = this.flow;
      if (!flow) return;
      this.past = withHistory(this.past, flow.graph);
      this.future = [];
      this.lastEdit = null;
      this.flow = { ...fresh, savedGraph: fresh.graph };
      this.saveState = 'saved';
      return;
    }
    this.tabs = this.tabs.map((tab) =>
      tab.id === id
        ? {
            ...tab,
            flow: { ...fresh, savedGraph: fresh.graph },
            past: withHistory(tab.past, tab.flow.graph),
            future: [],
            saveState: 'saved',
          }
        : tab
    );
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
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.toolsSize.disconnect();
    this.watchedTools = null;
    window.removeEventListener('keydown', this.onWindowKeyDown, true);
    window.removeEventListener('pagehide', this.onPageHide);
    window.removeEventListener('focus', this.onWindowFocus);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.persistTabs();
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    // A menu at a card or "+" belongs to the flow as it was (an edit, undo, another tab).
    if (changed.has('flow') && changed.get('flow') !== undefined) this.canvasMenu = null;
    if (changed.has('hass') && this.hass) {
      loadSummaryTranslations(this.hass);
      // First `hass` after a reload: refresh the restored active tab.
      if (!changed.get('hass') && this.activeTabId) void this.refreshFromHa(this.activeTabId);
      if (!changed.get('hass')) void this.loadAiChoice();
      if (!changed.get('hass')) void this.loadHaList();
      void this.syncScripts(this.hass);
    }
  }

  /** Renamed scripts: their config ids come from HA's entity registry (see `syncScriptIds`). */
  private async syncScripts(hass: HomeAssistant): Promise<void> {
    if (await syncScriptIds(hass)) this.requestUpdate();
  }

  /** The start screen is HA's own automation list — FLODE's cards stay the fallback. */
  private async loadHaList(): Promise<void> {
    const ready = await ensureAutomationEditors(this.hass);
    this.haList = ready && HA_LIST_TAGS.every((tag) => customElements.get(tag) !== undefined);
  }

  /** The tool strip and its buttons as they grow (HA's buttons take their size late). */
  private toolsSize = new ResizeObserver(() => {
    if (this.watchedTools) markScrollable(this.watchedTools);
  });
  private watchedTools: HTMLElement | null = null;

  private watchTools(): void {
    const tools = this.renderRoot.querySelector<HTMLElement>('.tools');
    if (tools === this.watchedTools) {
      if (tools) markScrollable(tools);
      return;
    }
    this.toolsSize.disconnect();
    this.watchedTools = tools;
    if (!tools) return;
    this.toolsSize.observe(tools);
    for (const child of tools.children) this.toolsSize.observe(child);
  }

  protected updated(changed: PropertyValues<this>): void {
    this.watchTools();
    // ⌘B / "+": the keyboard goes into the menu (↑↓, Enter, Esc).
    if (changed.has('addOpen') && this.addOpen) this.addMenuButtons()[0]?.focus();
    if (changed.has('selectedId') && this.selectedId && isNarrow()) {
      this.canvas?.revealNode(this.selectedId);
    }
    // Phones: runs / assistant open as a sheet over the lower part — the flow (or the
    // run's path) moves into the part above it.
    if (
      (changed.has('debugOpen') || changed.has('assistOpen') || changed.has('runMarks')) &&
      (this.debugOpen || this.assistOpen) &&
      isNarrow()
    ) {
      const marks = this.debugOpen ? this.runMarks : null;
      this.canvas?.fitView(true, {
        covered: SHEET_SHARE,
        only: marks ? new Set(marks.keys()) : undefined,
      });
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
  /** `report(step, value)`: how far loading got, 0–1. */
  private async loadFlow(
    hass: HomeAssistant,
    item: AutomationListItem,
    report: (step: string, value: number) => void = () => undefined,
    /** HA's config when it was just read. */
    loaded?: Record<string, unknown>
  ): Promise<OpenFlow> {
    const language = this.language;
    report(t(language, 'progressConfig'), 0.1);
    const config = loaded ?? (await loadFlowConfig(hass, item.kind, item.configId));
    // A blueprint flow is shown read-only: the blueprint's steps with its inputs filled in.
    const blueprint = usesBlueprint(config) ? (blueprintPath(config) ?? '') : undefined;
    const steps =
      blueprint === undefined ? config : await substituteBlueprint(hass, item.kind, config);
    report(t(language, 'progressParse'), 0.35);
    const { transpiler, parseScript } = await loadTranspiler();
    // Wenn-dann, Auswählen, Wiederholen, Parallel stay HA blocks (HA's own nested editor).
    const options = { keepBlocks: true };
    const result =
      item.kind === 'script'
        ? await parseScript(transpiler, steps, options)
        : await transpiler.fromYaml(
            yamlDump(steps, { indent: 2, lineWidth: -1, quotingType: '"', forceQuotes: false }),
            options
          );
    if (!result.success || !result.graph) throw new Error(result.errors?.join('\n') ?? 'parse');
    report(t(language, 'progressRegistry'), 0.8);
    const registryEntry = await getRegistryEntry(hass, item.entityId);
    const graph = await this.inDefaultDirection(result.graph);
    report(t(language, 'progressOpen'), 1);
    return {
      item,
      graph: {
        ...graph,
        name: flowName(config, item.name),
        description: typeof config.description === 'string' ? config.description : '',
      },
      isNew: false,
      ...(blueprint === undefined ? {} : { blueprint }),
      registryEntry,
      haVersion: configFingerprint(config),
      ...(result.warnings?.length ? { importWarnings: result.warnings } : {}),
    };
  }

  /** The tab showing this automation/script, if it's open. */
  private findTab(item: AutomationListItem): EditorTab | undefined {
    return this.tabs.find((tab) => sameFlow(this.tabFlow(tab).item, item));
  }

  private readonly opening = new InFlight();

  private async open(item: AutomationListItem): Promise<void> {
    const hass = this.hass;
    if (!hass) return;
    const openTab = this.findTab(item);
    if (openTab) {
      this.switchTab(openTab.id);
      return;
    }
    // A double click / second ⌘K while it loads: the first one opens it.
    const key = `${item.kind}:${item.configId}`;
    if (!this.opening.start(key)) return;
    const heading = t(
      this.language,
      item.kind === 'script' ? 'progressOpenScript' : 'progressOpenAutomation'
    );
    this.message = null;
    try {
      const flow = await this.loadFlow(hass, item, (step, value) => {
        this.progress = { heading, name: item.name, step, value };
      });
      const opened = this.findTab(item);
      if (opened) this.switchTab(opened.id);
      else this.openTab(flow);
    } catch (error) {
      this.message = `${t(this.language, 'loadFailed')}: ${errorMessage(error)}`;
    } finally {
      // Another flow still loading keeps its progress dialog.
      if (this.opening.end(key)) this.progress = null;
    }
  }

  /** Saves run one after another: a later one sees the first one's result (`isNew`, config id). */
  private readonly saves = new Serial();

  /**
   * Saves the active tab. `named`: the name was just entered (HA's
   * unsaved-changes dialog) — don't ask again. Never two at once: a save
   * requested while one runs waits for it (a new flow is in HA then); one
   * requested while the name dialog is open joins that save.
   */
  private save(named = false): Promise<void> {
    const tabId = this.activeTabId;
    return this.saves
      .enqueue(
        tabId,
        () => this.prepareSave(tabId, named),
        () => this.writeFlow(tabId)
      )
      .catch((error: unknown) => {
        // The preparation failed (HA's name dialog): shown like any other save error
        this.notify(`${t(this.language, 'saveFailed')}: ${errorMessage(error)}`);
      });
  }

  /** Whether tab `tabId` is to be written: still shown, has changes, has a name. */
  private async prepareSave(tabId: string | null, named: boolean): Promise<boolean> {
    const flow = this.flow;
    // Switched to another tab while waiting for the previous save.
    if (!this.hass || !flow || tabId !== this.activeTabId) return false;
    if (!flow.isNew && this.saveState === 'saved') return false;
    // A new automation gets its name first, exactly like HA's own editor.
    return !flow.isNew || named || (await this.editSettings('alias'));
  }

  private async writeFlow(tabId: string | null): Promise<void> {
    const hass = this.hass;
    const flow = this.flow;
    if (!hass || !flow) return;
    // The tab can change while saving — the result belongs to the one saved.
    let current = flow;
    this.saveState = 'saving';
    try {
      const { FlowTranspiler, buildAutomationSaveConfig, transpileScript } = await loadTranspiler();
      const transpiler = new FlowTranspiler();
      const validation = transpiler.validate(current.graph);
      if (validation.errors.length > 0) {
        throw new SaveProblemError(
          describeFlowCheckErrors(validation.errors, current.graph, {
            language: this.language,
            hass,
          })
        );
      }
      // A blueprint flow is only shown — never written over (`saveFlowConfig` checks HA's too).
      if (current.blueprint !== undefined && !current.isNew) {
        throw new Error(t(this.language, 'blueprintNoSave'));
      }
      const kind = current.item.kind;
      if (kind === 'script' && current.isNew) {
        // Like HA's script editor: a new script's id comes from its name —
        // unique among today's scripts (renamed ones by their registry id).
        await syncScriptIds(this.hass ?? hass);
        const configId = newScriptId(this.hass ?? hass, current.graph.name);
        current = { ...current, item: { ...current.item, configId } };
        this.updateTab(tabId, (open, saveState) => ({
          flow: { ...open, item: { ...open.item, configId } },
          saveState,
        }));
      }
      if (!(await this.resolveConflict(tabId, current))) {
        // Cancelled, or HA's version was loaded instead (that tab is saved then).
        this.updateTab(tabId, (open, saveState) => ({
          flow: open,
          saveState: saveState === 'saving' ? 'unsaved' : saveState,
        }));
        return;
      }
      // Offsets of steps no longer in their branch aren't saved.
      const graph = withoutStaleOffsets(current.graph);
      const result =
        kind === 'script'
          ? transpileScript(transpiler, graph)
          : buildAutomationSaveConfig(transpiler, graph, {
              alias: current.graph.name,
              description: current.graph.description ?? '',
            });
      if (!result.success || !result.config) throw new Error(result.errors?.join(', '));
      const configId = current.item.configId;
      await saveFlowConfig(hass, kind, configId, result.config);
      // It's in HA now — whatever comes next (another save, closing) must not create it again.
      this.updateTab(tabId, (open, saveState) => ({
        flow: open.item.configId === configId ? { ...open, isNew: false } : open,
        saveState,
      }));
      const saved = await this.afterSave(current);
      if (this.updateTab(tabId, (open) => settleSave(open, { graph: current.graph, saved }))) {
        this.message = null;
        this.saveProblem = null;
      }
    } catch (error) {
      const problem =
        error instanceof SaveProblemError
          ? error.problem
          : describeHaSaveError(errorMessage(error), current.graph, current.item.kind, {
              language: this.language,
              hass: this.hass,
            });
      if (this.updateTab(tabId, (open) => settleSave(open, null))) this.showSaveProblem(problem);
      else this.notify(`${t(this.language, 'saveFailed')}: ${problem.text}`);
    }
  }

  /**
   * Before overwriting a flow in HA: was it changed there since FLODE read
   * it? Then the user picks — overwrite, or load HA's version (theirs stays
   * one undo step back). Resolves `true` to go on saving.
   */
  private async resolveConflict(tabId: string | null, flow: OpenFlow): Promise<boolean> {
    const hass = this.hass;
    if (!hass || flow.isNew || !flow.haVersion) return true;
    let stored: Record<string, unknown>;
    try {
      stored = await loadFlowConfig(hass, flow.item.kind, flow.item.configId);
    } catch {
      return true; // Gone from HA — saving creates it again.
    }
    if (configFingerprint(stored) === flow.haVersion) return true;
    const choice = await this.askConflict(flow.graph.name);
    if (choice !== 'reload') return choice === 'overwrite';
    try {
      const fresh = await this.loadFlow(hass, this.currentItem(flow.item), undefined, stored);
      if (tabId) this.adoptFromHa(tabId, fresh);
    } catch (error) {
      this.message = `${t(this.language, 'loadFailed')}: ${errorMessage(error)}`;
    }
    return false;
  }

  /** The tab's bar: why saving failed (with a way to its card and HA's own words), or a message. */
  private renderSaveProblem() {
    const problem = this.saveProblem;
    const language = this.language;
    if (!problem) return this.message ? html`<p class="message">${this.message}</p>` : nothing;
    return html`<div class="message save-problem" role="alert">
      <div class="save-problem-line">
        <span><strong>${t(language, 'saveFailed')}:</strong> ${problem.text}</span>
        ${
          problem.issue
            ? html`<ha-button appearance="plain" size="small" @click=${() => this.revealSaveProblem()}>
                ${t(language, 'saveErrShow')}
              </ha-button>`
            : nothing
        }
      </div>
      ${
        problem.detail
          ? html`<details>
              <summary>${t(language, 'saveErrDetail')}</summary>
              ${problem.detail}
            </details>`
          : nothing
      }
    </div>`;
  }

  /** A failed save of the active tab: its bar explains it, its card is marked and picked. */
  private showSaveProblem(problem: SaveProblem): void {
    this.message = null;
    this.saveProblem = problem;
    this.revealSaveProblem();
  }

  private revealSaveProblem(): void {
    const nodeId = this.saveProblem?.issue?.nodeId;
    if (!nodeId) return;
    this.selectedId = nodeId;
    this.canvas?.revealNode(nodeId);
  }

  private askConflict(name: string): Promise<ConflictChoice> {
    return new Promise((resolve) => {
      this.conflict = { name, resolve };
    });
  }

  private closeConflict(choice: ConflictChoice): void {
    const conflict = this.conflict;
    this.conflict = null;
    conflict?.resolve(choice);
  }

  /**
   * Changes the tab `tabId` — live while it's active, else its parked copy
   * (the user switched tabs meanwhile). `true` when it's the active one.
   */
  private updateTab(
    tabId: string | null,
    update: (flow: OpenFlow, saveState: SaveState) => { flow: OpenFlow; saveState: SaveState }
  ): boolean {
    if (tabId === this.activeTabId) {
      if (!this.flow) return false;
      const next = update(this.flow, this.saveState);
      this.flow = next.flow;
      this.saveState = next.saveState;
      return true;
    }
    this.tabs = this.tabs.map((tab) =>
      tab.id === tabId ? { ...tab, ...update(tab.flow, tab.saveState) } : tab
    );
    return false;
  }

  /** A new automation's entity only exists after the first save; then area/category/labels follow. */
  private async afterSave(saved: OpenFlow): Promise<SaveResult['saved']> {
    const entityId =
      saved.item.entityId ||
      (await waitForAutomationEntity(() => this.hass, saved.item.kind, saved.item.configId)) ||
      '';
    const hass = this.hass;
    if (hass && entityId && saved.registryUpdate)
      await applyRegistryUpdate(hass, saved.item.kind, entityId, saved.registryUpdate);
    const registryEntry = hass && entityId ? await getRegistryEntry(hass, entityId) : null;
    // What HA stored now is the version later saves compare against.
    const stored = hass
      ? await loadFlowConfig(hass, saved.item.kind, saved.item.configId).catch(() => null)
      : null;
    return {
      configId: saved.item.configId,
      entityId,
      registryEntry,
      ...(stored ? { haVersion: configFingerprint(stored) } : {}),
    };
  }

  /** HA's own "run": the version saved in HA (fields → HA's dialog to fill them in). */
  private async runSavedScript(): Promise<void> {
    const hass = this.hass;
    const flow = this.flow;
    const host = this.renderRoot.querySelector('.dialog-host');
    if (!hass || !flow || flow.isNew || !(host instanceof HTMLElement)) return;
    await this.withHaDialog(() =>
      runScript(hass, host, {
        entityId: flow.item.entityId,
        configId: flow.item.configId,
        name: flow.graph.name,
      })
    );
  }

  /** Runs one of HA's dialogs; FLODE's shortcuts stay off while it's open. */
  private async withHaDialog<T>(open: () => Promise<T>): Promise<T> {
    this.haDialogs++;
    try {
      return await open();
    } finally {
      this.haDialogs--;
    }
  }

  // ---- automation settings (HA's rename + mode dialogs) ------------------------

  private startNew(
    kind: FlowKind = this.flow?.item.kind ?? (this.homeKind === 'script' ? 'script' : 'automation')
  ): void {
    const name = newFlowName(this.language, kind);
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
        ...(this.verticalDefault ? { direction: 'down' as const } : {}),
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
      message: this.message,
      saveProblem: this.saveProblem,
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
    this.multiIds = [];
    this.message = tab.message ?? null;
    this.saveProblem = tab.saveProblem ?? null;
    this.inspectorError = null;
    this.addOpen = false;
    this.showHome = false;
    const viewport = tab.viewport;
    if (viewport) void this.updateComplete.then(() => this.canvas?.setViewport(viewport));
    this.lastEdit = null;
    // Unchanged tabs show what HA has now (changed there meanwhile, remembered from before a reload).
    void this.refreshFromHa(tab.id);
  }

  /** Opens a flow in a new tab — or in the active one if that's still an empty new automation. */
  private openTab(flow: OpenFlow): void {
    const active = this.tabs.find((tab) => tab.id === this.activeTabId);
    const activeIsBlank =
      active !== undefined && this.flow?.isNew === true && this.flow.graph.nodes.length === 0;
    const tab: EditorTab = {
      id: activeIsBlank && active ? active.id : randomId(),
      flow: flow.isNew ? flow : { ...flow, savedGraph: flow.graph },
      past: [],
      future: [],
      saveState: flow.isNew ? 'unsaved' : 'saved',
      selectedId: null,
    };
    this.knownTabIds.add(tab.id);
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
    // A save still running decides whether there's anything left to ask about.
    await this.saves.idle();
    const tab = this.tabs.find((candidate) => candidate.id === id);
    const hass = this.hass;
    if (!tab || !hass) return;
    if (this.tabSaveState(tab) !== 'saved') {
      this.switchTab(id);
      await this.updateComplete;
      const flow = this.flow;
      const host = this.renderRoot.querySelector('.dialog-host');
      if (!flow || !(host instanceof HTMLElement)) return;
      const proceed = await this.withHaDialog(() =>
        confirmUnsavedChanges(hass, host, {
          flowKind: flow.item.kind,
          configId: flow.isNew ? undefined : flow.item.configId,
          settings: this.settingsOf(flow),
          registry: { entry: flow.registryEntry, update: flow.registryUpdate },
          save: async (settings, registryUpdate) => {
            this.applySettings(settings, registryUpdate);
            await this.save(true);
            return this.saveState === 'saved';
          },
        })
      );
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
      // opens as "save" (see `prefillSaveDialog` for a name it already has).
      alias: flow.isNew ? '' : flow.graph.name,
      description: flow.graph.description ?? '',
      mode: metadata?.mode ?? 'single',
      max: metadata?.max,
      max_exceeded: metadata?.max_exceeded,
      icon: metadata?.icon,
    };
  }

  /** Still the "New automation" / "New script" a new flow starts with (any UI language). */
  private isPlaceholderName(flow: OpenFlow): boolean {
    const name = flow.graph.name.trim();
    return (
      !name ||
      ['en', 'de', this.language].some((lang) => newFlowName(lang, flow.item.kind) === name)
    );
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
    const result = await this.withHaDialog(() =>
      promptAutomationDialog(
        hass,
        host,
        target,
        kind,
        this.settingsOf(flow),
        { entry: flow.registryEntry, update: flow.registryUpdate },
        // A new flow named in the title bar, by the AI, an import … (#25)
        flow.isNew && !this.isPlaceholderName(flow) ? flow.graph.name : undefined
      )
    );
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

  /**
   * One undo step — or part of the last one: `editKey` names what was edited
   * (a card's form), so typing in HA's editor isn't an undo step per key.
   */
  private commit(next: FlowGraph, editKey?: string): void {
    const flow = this.flow;
    // A script always begins somewhere (its start node is hidden, see flow-model).
    const graph = ensureScriptEntry(next);
    if (!flow || graph === flow.graph) return;
    // A blueprint flow is only shown, so it can't be changed either.
    if (flow.blueprint !== undefined && !flow.isNew) {
      this.notify(t(this.language, 'blueprintNoSave'));
      return;
    }
    const now = Date.now();
    if (!continuesStep(this.lastEdit, editKey, now)) this.past = withHistory(this.past, flow.graph);
    this.lastEdit = editKey === undefined ? null : { key: editKey, at: now };
    this.future = [];
    this.flow = { ...flow, graph };
    this.saveState = 'unsaved';
  }

  private undo(): void {
    const flow = this.flow;
    const previous = this.past.at(-1);
    if (!flow || !previous) return;
    this.lastEdit = null;
    this.past = this.past.slice(0, -1);
    this.future = [flow.graph, ...this.future];
    this.flow = { ...flow, graph: previous };
    this.saveState = historySaveState(flow, previous);
  }

  private redo(): void {
    const flow = this.flow;
    const [next, ...rest] = this.future;
    if (!flow || !next) return;
    this.lastEdit = null;
    this.future = rest;
    this.past = withHistory(this.past, flow.graph);
    this.flow = { ...flow, graph: next };
    this.saveState = historySaveState(flow, next);
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
    const last: unknown = Array.isArray(event.detail.value) ? event.detail.value.at(-1) : undefined;
    if (!flow || !isPlainObject(last)) return;
    const added = completeNewStep(last);
    const at = this.pendingAdd;
    this.pendingAdd = null;
    // "+" on a branch of a choose / if: the step goes into that branch.
    const branch = at?.source
      ? branchInsertAt(cachedBranchView(flow.graph), at.source, at.sourceHandle)
      : null;
    if (branch) {
      const inserted = insertBranchStep(flow.graph, branch, added);
      this.commit(inserted.graph);
      this.selectNewCard(inserted.id);
      return;
    }
    const { type, data } = stepToNode(kind, added);
    const source = at?.source ? flow.graph.nodes.find((n) => n.id === at.source) : undefined;
    // From the toolbar: a condition / action goes beside the selected card, not below it.
    const beside =
      source ??
      (!at && kind !== 'trigger'
        ? flow.graph.nodes.find((n) => n.id === this.selectedId)
        : undefined);
    // Where it was asked for (right-click, dropped connection); after a card one step
    // further along the flow; otherwise where the user is looking.
    const wanted =
      at?.position ??
      (beside
        ? nextPosition(flow.graph, beside.position)
        : (this.canvas?.visibleCenter() ?? { x: 0, y: 0 }));
    const { graph, id } = addNode(
      flow.graph,
      type,
      freePosition(flow.graph, wanted),
      undefined,
      data
    );
    if (at?.between && source) {
      this.commit(insertBetween(graph, source.id, at.sourceHandle ?? null, id));
      this.selectNewCard(id);
      return;
    }
    const connected =
      at?.source && source
        ? connect(graph, { source: at.source, sourceHandle: at.sourceHandle ?? null, target: id })
        : graph;
    // A card after an expanded block is drawn further right — store it so it appears where it was dropped.
    const placed = at?.position
      ? storedPosition(cachedBranchView(connected), id, at.position)
      : undefined;
    this.commit(placed ? moveNode(connected, id, placed.x, placed.y) : connected);
    this.selectNewCard(id);
  }

  private addMenuButtons(): HTMLButtonElement[] {
    return [...this.renderRoot.querySelectorAll<HTMLButtonElement>('.add .menu button')];
  }

  private onAddMenuKey = (event: KeyboardEvent): void => {
    const buttons = this.addMenuButtons();
    const index = buttons.findIndex((button) => button.matches(':focus'));
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (event.key === 'Escape') this.addOpen = false;
    else if (step !== 0) buttons[(index + step + buttons.length) % buttons.length]?.focus();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  /** A new card is selected and panned into sight (phones: `updated` reveals it above the sheet). */
  private selectNewCard(id: string): void {
    this.selectedId = id;
    if (!isNarrow()) void this.updateComplete.then(() => this.canvas?.bringIntoView(id));
  }

  private onStepChange(event: CustomEvent<StepEdit>): void {
    this.applyEdits([], event.detail, cardEditKey(event.detail.id));
  }

  private onDataChange(event: CustomEvent<NodeDataEdit>): void {
    const node = this.selectedBranchNode();
    // A branch card's fallback editor edits its card data — written back as its HA step.
    if (node && node.id === event.detail.id) {
      const edited = NodeSchema.safeParse({ ...node, data: event.detail.data });
      if (edited.success) {
        this.applyEdits(
          [],
          { id: node.id, kind: 'action', step: nodeToStep(edited.data) },
          cardEditKey(node.id)
        );
      }
      return;
    }
    this.applyEdits([event.detail], undefined, cardEditKey(event.detail.id));
  }

  /** The branch card `id` stands for (a step inside a choose / if), if it is one. */
  private branchCard(id: string | null) {
    const flow = this.flow;
    return flow && id ? cachedBranchView(flow.graph).cards.get(id) : undefined;
  }

  private selectedBranchNode(): FlowNode | undefined {
    const flow = this.flow;
    if (!flow || !this.branchCard(this.selectedId)) return undefined;
    return cachedBranchView(flow.graph).graph.nodes.find((n) => n.id === this.selectedId);
  }

  /** "Auswählen › Option 1 · Schritt 2" — where an open branch card sits. */
  private branchContext(view: BranchView, id: string | null): string | undefined {
    const card = id ? view.cards.get(id) : undefined;
    const block = card ? view.graph.nodes.find((n) => n.id === card.parentId) : undefined;
    if (!card || !block) return undefined;
    return t(this.language, 'branchContext')
      .replace('{block}', nodeTitle(block, this.hass))
      .replace('{branch}', branchLabelText(this.language, card.branch.label))
      .replace('{n}', String(card.index + 1));
  }

  /** Card data edits plus the open card's HA step, committed as one undo step (see `commit`). */
  private applyEdits(data: readonly NodeDataEdit[], step?: StepEdit, editKey?: string): void {
    const flow = this.flow;
    if (!flow) return;
    let graph = flow.graph;
    let error: string | null = null;
    for (const edit of data) {
      const result = updateNodeData(graph, edit.id, edit.data);
      graph = result.graph;
      error ??= result.error;
    }
    const card = step ? this.branchCard(step.id) : undefined;
    if (step && card && !error) {
      // HA's step goes into its branch as it is — the block keeps HA's format.
      const result = setBranchStep(graph, card, step.step);
      graph = result.graph;
      error = result.error;
    } else if (step && !error) {
      const previous = graph.nodes.find((n) => n.id === step.id);
      const { type, data: stepData } = stepToNode(step.kind, step.step, previous);
      const result = setNodeStep(graph, step.id, type, stepData);
      graph = result.graph;
      error = result.error;
    }
    this.inspectorError = error ? `${t(this.language, 'invalid')}: ${error}` : null;
    if (!error) this.commit(graph, editKey);
  }

  private onDelete(event: CustomEvent<{ id: string }>): void {
    this.removeCard(event.detail.id);
  }

  /** Removes a card of the flow or a step from its branch. */
  private removeCard(id: string): void {
    const flow = this.flow;
    if (!flow) return;
    const card = this.branchCard(id);
    this.commit(card ? removeBranchStep(flow.graph, card) : removeNode(flow.graph, id));
    this.selectedId = null;
  }

  /** FLODE's shortcuts (shortcuts.ts) — captured before HA's own single-key shortcuts. */
  private onWindowKeyDown = (event: KeyboardEvent): void => {
    if (!this.isConnected) return;
    const shortcut = matchShortcut(event);
    if (event.key === 'Escape' && this.canvasMenu) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.canvasMenu = null;
      return;
    }
    if (!shortcut) {
      this.closeSideOnEscape(event);
      return;
    }
    // A dialog is open (FLODE's or HA's): ⌘Z, ⌘V, ⌘S … must not act on the editor behind it.
    if (this.dialogOpen() || isInDialog(event.composedPath())) return;
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

  /** Esc closes the runs view or the assistant (not while a dialog or a field has the keys). */
  private closeSideOnEscape(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || this.showHome || !(this.debugOpen || this.assistOpen)) return;
    if (this.dialogOpen() || isInDialog(event.composedPath()) || isTyping(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.closeSheet();
  }

  private dialogOpen(): boolean {
    return (
      this.haDialogs > 0 ||
      this.saves.pending ||
      this.conflict !== null ||
      this.paletteOpen ||
      this.yamlViewOpen ||
      this.shortcutsOpen ||
      this.yamlImportOpen ||
      this.templatesOpen ||
      this.aiOpen ||
      this.runFromId !== null ||
      this.welcome !== null ||
      haDialogShowing()
    );
  }

  private shortcutAction(id: ShortcutId): (() => void) | null {
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
      case 'copy': {
        if (this.multiIds.length > 1 && !window.getSelection()?.toString())
          return () => this.selectionAction('copy');
        // A text selection on the page keeps the browser's own copy.
        const card = this.selectedAnyCard();
        if (!card || window.getSelection()?.toString()) return null;
        return () => {
          this.copiedSelection = null;
          this.copiedNode = structuredClone(card);
          this.notify(
            t(this.language, 'cardCopied').replace('{keys}', shortcutKeys('paste') ?? '')
          );
        };
      }
      case 'paste': {
        const group = this.copiedSelection;
        if (group) return () => this.pasteSelection(group);
        const copied = this.copiedNode;
        if (!copied) return null;
        return () => this.pasteCard(copied);
      }
      case 'duplicate': {
        if (this.multiIds.length > 1) return () => this.selectionAction('duplicate');
        const card = this.selectedAnyCard();
        return card ? () => this.duplicateCard(card) : null;
      }
      case 'toggleEnabled': {
        if (this.multiIds.length > 1) return () => this.selectionAction('toggle');
        const card = this.selectedAnyCard();
        return card ? () => this.toggleCard(card) : null;
      }
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
  private renderBlueprintNote(flow: OpenFlow) {
    if (flow.blueprint === undefined || flow.isNew) return nothing;
    const language = this.language;
    const { kind, configId } = flow.item;
    return html`<ha-alert
      class="import-warnings"
      alert-type="info"
      .title=${t(language, 'blueprintReadOnlyTitle')}
    >
      ${t(language, 'blueprintReadOnlyText')}
      <code>${flow.blueprint}</code>
      <ha-button
        slot="action"
        appearance="plain"
        @click=${() => navigateInHa(`/config/${kind}/edit/${encodeURIComponent(configId)}`)}
      >
        ${t(language, 'openInHa')}
      </ha-button>
    </ha-alert>`;
  }

  private renderImportWarnings(flow: OpenFlow) {
    const warnings = flow.importWarnings;
    if (!warnings?.length) return nothing;
    const heading = flow.importWarningsHeading ?? {
      title: 'importWarnTitle',
      text: 'importWarnText',
    };
    return html`<ha-alert
      class="import-warnings"
      alert-type="warning"
      .title=${t(this.language, heading.title)}
      dismissable
      @alert-dismissed-clicked=${() => {
        if (this.flow) {
          this.flow = { ...this.flow, importWarnings: undefined, importWarningsHeading: undefined };
        }
      }}
    >
      ${t(this.language, heading.text)}
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

  private toggleHaCardText(): void {
    this.haCardText = !this.haCardText;
    writeFlag(HA_CARD_TEXT_KEY, this.haCardText);
  }

  private toggleAutoSide(): void {
    this.autoSide = !this.autoSide;
    writeFlag(AUTO_SIDE_KEY, this.autoSide);
  }

  private toggleVerticalDefault(): void {
    this.verticalDefault = !this.verticalDefault;
    writeFlag(VERTICAL_KEY, this.verticalDefault);
  }

  /**
   * A flow as it opens: one without a saved direction is laid out top to
   * bottom when that is the default (#29) — left to right it stays as saved.
   */
  private async inDefaultDirection(graph: FlowGraph): Promise<FlowGraph> {
    if (graph.direction || !this.verticalDefault) return graph;
    if (visibleGraph(graph).nodes.length === 0) return { ...graph, direction: 'down' };
    return layoutGraph(graph, 'down');
  }

  /** Carries out what the bar over a selection (or its shortcut) asks for. */
  private selectionAction(action: SelectionAction): void {
    const flow = this.flow;
    if (!flow) return;
    const ids = this.multiIds;
    switch (action) {
      case 'clear':
        this.multiIds = [];
        return;
      case 'copy':
        this.copiedNode = null;
        this.copiedSelection = snapshotSelection(flow.graph, ids);
        this.notify(t(this.language, 'selectionCopied'));
        return;
      case 'duplicate': {
        const box = selectionBox(flow.graph, ids);
        if (!box) return;
        // The copy lands below the selection, connections among the copies kept.
        this.pasteSelection(snapshotSelection(flow.graph, ids), {
          x: box.x,
          y: box.y + box.height + 40,
        });
        return;
      }
      case 'toggle':
        this.commit(toggleSelectionEnabled(flow.graph, ids));
        return;
      case 'frame': {
        const framed = addFrameAround(flow.graph, ids);
        if (!framed) return;
        this.commit(framed[0]);
        this.multiIds = [];
        this.selectedId = null;
        // The title is waiting to be typed.
        this.canvas?.selectAnnotation(framed[1], true);
        return;
      }
      case 'delete':
        this.commit(removeSelection(flow.graph, ids));
        this.multiIds = [];
        this.selectedId = null;
        return;
    }
  }

  /** Copied cards and notes added to the flow at `at`, or beside where they were; the copies are the new selection. */
  private pasteSelection(snapshot: SelectionSnapshot, at?: { x: number; y: number }): void {
    const flow = this.flow;
    if (!flow) return;
    const home = selectionBox({ ...flow.graph, nodes: snapshot.nodes, notes: snapshot.notes }, [
      ...snapshot.nodes.map((n) => n.id),
      ...snapshot.notes.map((n) => n.id),
    ]);
    if (!home) return;
    const pasted = pasteSnapshot(flow.graph, snapshot, at ?? { x: home.x + 40, y: home.y + 40 });
    if (!pasted) return;
    // A trigger has no place in a script (saving would drop it).
    if (
      flow.item.kind === 'script' &&
      snapshot.nodes.some((n) => !stepKindsFor('script').includes(stepKind(n.type)))
    ) {
      this.notify(t(this.language, 'pasteNoTriggerInScript'));
      return;
    }
    this.commit(pasted.graph);
    this.selectedId = null;
    this.multiIds = pasted.ids;
  }

  /** The selected card — never the hidden script start. */
  private selectedCard(): FlowNode | null {
    const node = this.flow?.graph.nodes.find((n) => n.id === this.selectedId);
    return node && !isScriptStart(node.data) ? node : null;
  }

  /** The selected card as drawn — a flow card or a step in a choose / if branch. */
  private selectedAnyCard(): FlowNode | null {
    return this.selectedCard() ?? this.selectedBranchNode() ?? null;
  }

  /**
   * ⌘D: the copy goes right after the card — into its branch, or connected
   * behind it in the flow, below everything the card draws (a block's branches).
   */
  private duplicateCard(node: FlowNode): void {
    const flow = this.flow;
    if (!flow) return;
    const view = cachedBranchView(flow.graph);
    const card = view.cards.get(node.id);
    if (card) {
      this.insertAfterBranchCard(card, node);
      return;
    }
    // The copy draws the same branches: its box starts below the original's.
    const box = drawnBox(view, node.id);
    const { axis } = view;
    const drawn = freePosition(
      view.graph,
      axis.at(axis.main(box), box.crossEnd + 40 + axis.cross(box) - box.crossStart)
    );
    const { graph, id } = duplicateNode(flow.graph, node, drawn);
    if (graph === flow.graph) return;
    const placed = storedPosition(cachedBranchView(graph), id, drawn);
    this.commit(moveNode(graph, id, placed.x, placed.y));
    this.selectNewCard(id);
  }

  /**
   * ⌘V: after the selected step of a branch, or as a card of its own (beside
   * the copied one, or at `at` from the right-click menu).
   */
  private pasteCard(node: FlowNode, at?: { x: number; y: number }): void {
    const flow = this.flow;
    if (!flow) return;
    // A trigger card has no place in a script (saving would drop it)
    if (!stepKindsFor(flow.item.kind).includes(stepKind(node.type))) {
      this.notify(t(this.language, 'pasteNoTriggerInScript'));
      return;
    }
    const card = at ? undefined : this.branchCard(this.selectedId);
    if (card && this.insertAfterBranchCard(card, node)) return;
    const { graph, id } = copyNode(flow.graph, node, at);
    if (graph === flow.graph) return;
    this.commit(graph);
    this.selectNewCard(id);
  }

  /** A copy of `node` as the next step of branch card `card` (triggers can't go into a branch). */
  private insertAfterBranchCard(card: BranchCardRef, node: FlowNode): boolean {
    const flow = this.flow;
    if (!flow || node.type === 'trigger') return false;
    const inserted = insertBranchStep(
      flow.graph,
      { blockId: card.blockId, branch: card.branch, index: card.index + 1 },
      nodeToStep(node)
    );
    if (inserted.graph === flow.graph) return false;
    this.commit(inserted.graph);
    this.selectNewCard(inserted.id);
    return true;
  }

  /** Enables / disables a card of the flow or a step in its branch (HA's `enabled: false`). */
  private toggleCard(node: FlowNode): void {
    const flow = this.flow;
    if (!flow) return;
    const card = this.branchCard(node.id);
    if (!card) {
      this.commit(toggleNodeEnabled(flow.graph, node.id));
      return;
    }
    const result = setBranchStep(flow.graph, card, withEnabledToggled(nodeToStep(node)));
    if (!result.error) this.commit(result.graph);
  }

  /**
   * "Aufräumen": re-runs the import layout (ELK, from the transpiler) on the
   * current flow — one undo step, then frames everything. Runs the way the
   * flow does, or turned to `direction` (#29).
   */
  private async tidy(direction?: FlowDirection): Promise<void> {
    const flow = this.flow;
    // Tidying needs two cards; turning the flow works with any.
    if (!flow || (!direction && visibleGraph(flow.graph).nodes.length < 2)) return;
    let tidied: FlowGraph;
    try {
      tidied = await layoutGraph(flow.graph, direction);
    } catch (error) {
      this.notify(`${t(this.language, 'tidy')}: ${errorMessage(error)}`);
      return;
    }
    const current = this.flow;
    if (!current || current.graph !== flow.graph) return;
    this.commit(tidied);
    await this.updateComplete;
    this.canvas?.fitView();
    // HA's own toast (the same event HA's panels use for "Saved" etc.).
    this.notifyUndoable(flow.graph, 'tidiedDone', 'tidied');
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

  private showMenuButton(): boolean {
    const hass = this.hass;
    return hass?.kioskMode !== true && (this.narrow || hass?.dockedSidebar === 'always_hidden');
  }

  private homeTabs(): HomeTab[] {
    const language = this.language;
    return [
      { view: 'automation', label: t(language, 'automations') },
      { view: 'script', label: t(language, 'scripts') },
      { view: 'map', label: mapT(language, 'title') },
    ];
  }

  private homeMenu(): MenuEntry[] {
    return [
      {
        id: 'merge',
        icon: 'mdi:call-merge',
        label: t(this.language, 'mergeStart'),
        run: () => this.startMerge(),
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
      // Also here: on a phone there is no ⌘K, and it decides how flows open (#29).
      'divider',
      this.verticalDefaultEntry(),
    ];
  }

  private startMerge(): void {
    this.homeKind = 'automation';
    this.mergeMode = true;
    this.mergeIds = [];
    // HA's list picks via its own select mode; the merge button sits in its selection bar.
    if (this.haList) void this.updateComplete.then(() => this.haListElement?.startSelection());
  }

  private get haListElement(): FlodeHaList | null {
    return this.renderRoot.querySelector('flode-ha-list');
  }

  private renderCards(
    active: AutomationListItem[],
    inactive: AutomationListItem[],
    view: HomeView
  ) {
    return html`${this.renderItemGroup(active)}
      ${
        inactive.length > 0
          ? html`<h2 class="group-title">${t(this.language, 'disabledGroup')} (${inactive.length})</h2>
              ${this.renderItemGroup(inactive)}`
          : nothing
      }
      ${
        active.length + inactive.length === 0 && view !== 'map'
          ? html`<p class="muted center">${t(this.language, 'empty')}</p>`
          : nothing
      }`;
  }

  /** Rows ticked in HA's table are the automations to merge. */
  private onListSelection(entityIds: string[]): void {
    const hass = this.hass;
    this.mergeIds = hass
      ? listFlows(hass, 'automation')
          .filter((item) => entityIds.includes(item.entityId))
          .map((item) => item.configId)
      : [];
  }

  private renderMapView() {
    return html`<flode-map
        .hass=${this.hass}
        .query=${this.query}
        @open-item=${(event: CustomEvent<AutomationListItem>) => void this.open(event.detail)}
        @clear-query=${() => {
          this.query = '';
        }}
      ></flode-map>`;
  }

  private renderSearch() {
    return html`<label class="search">
      <ha-icon icon="mdi:magnify"></ha-icon>
      <input
        .value=${this.query}
        placeholder=${this.homeKind === 'map' ? mapT(this.language, 'searchPlaceholder') : this.searchPlaceholder()}
        @input=${(e: InputEvent) => {
          if (e.target instanceof HTMLInputElement) this.query = e.target.value;
        }}
        @keydown=${(e: KeyboardEvent) => e.stopPropagation()}
      />
    </label>`;
  }

  private renderHome() {
    if (this.haList === null) return nothing;
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
    // HA's own table (filters, grouping, search) instead of FLODE's cards.
    const haTable = this.haList === true && view !== 'map';
    return html`
      <div class="home-scroll ${haTable ? 'fill' : ''}">
        <header class="home-toolbar">
          ${
            // No sidebar (phones, or hidden by the user) — HA's own menu button opens it, same rule as HA's pages.
            this.showMenuButton()
              ? html`<ha-menu-button .hass=${this.hass} .narrow=${this.narrow}></ha-menu-button>`
              : nothing
          }
          <div class="home-toolbar-title">${t(this.language, 'title')}</div>
        </header>
        <div class="home">
        <header class="home-head">
          <div>
            <h1>${t(this.language, 'title')}</h1>
            <p class="muted">${t(this.language, 'homeHint')}</p>
          </div>
        </header>
        ${this.renderAiSetup()}
        <div class="home-bar">
          <div class="kinds" role="tablist">
            ${this.homeTabs().map(
              (tab) => html`<button
                role="tab"
                class=${tab.view === view ? 'active' : ''}
                aria-selected=${tab.view === view ? 'true' : 'false'}
                @click=${() => {
                  this.homeKind = tab.view;
                }}
              >
                ${tab.label}
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
              <ha-icon icon="mdi:plus"></ha-icon>${newFlowName(this.language, kind)}
            </button>
            ${this.renderMenu(this.homeMenu())}
          </div>
        </div>
        ${haTable ? nothing : this.renderSearch()}
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
                  this.haListElement?.clearSelection();
                }}>${t(this.language, 'cancel')}</ha-button>
                <ha-button .disabled=${this.mergeIds.length < 2} @click=${() => void this.mergeSelected()}>
                  ${t(this.language, 'mergeRun')}
                </ha-button>
              </div>`
            : nothing
        }
        ${view === 'map' ? this.renderMapView() : nothing}
        ${
          haTable
            ? html`<flode-ha-list
                class="ha-table"
                .hass=${this.hass}
                .narrow=${this.narrow}
                .kind=${kind}
                @open-item=${(event: CustomEvent<AutomationListItem>) => void this.open(event.detail)}
                @selection=${(event: CustomEvent<string[]>) => this.onListSelection(event.detail)}
              ></flode-ha-list>`
            : this.renderCards(active, inactive, view)
        }
      </div></div>
    `;
  }

  private renderEditor(flow: OpenFlow) {
    const language = this.language;
    // Branch cards (steps inside a choose / if) can be opened like any card.
    const view = cachedBranchView(flow.graph);
    const selected = view.graph.nodes.find((n) => n.id === this.selectedId) ?? null;
    const sideOpen = this.assistOpen || this.debugOpen || selected !== null;
    // On a phone the side is a sheet that opens anyway; on a wide screen it goes when not needed.
    const sideHidden = this.autoSide && !sideOpen;
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
          <div class="tools" @scroll=${(e: Event) => {
            if (e.currentTarget instanceof HTMLElement) markScrollable(e.currentTarget);
          }}>
            <div class="tool-group">
              <div class="add">
                <ha-icon-button .label=${labelWithHint(t(language, 'add'), 'add')} @click=${() => {
                  this.addOpen = !this.addOpen;
                }}>
                  <ha-icon icon="mdi:plus"></ha-icon>
                </ha-icon-button>
                ${
                  this.addOpen
                    ? html`<div class="menu" role="menu" title=${t(language, 'addHint')} @keydown=${this.onAddMenuKey}>
                      ${(
                        flow.item.kind === 'script'
                          ? (['condition', 'action'] as const)
                          : (['trigger', 'condition', 'action'] as const)
                      ).map(
                        (kind) => html`<button
                          role="menuitem"
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
              ${this.renderDirectionMenu(flow)}
              <ha-icon-button
                class="minimap-toggle ${this.minimapVisible ? 'active' : ''}"
                .label=${labelWithHint(t(language, 'minimap'), 'minimap')}
                @click=${() => this.toggleMinimap()}
              >
                <ha-icon icon="mdi:map-outline"></ha-icon>
              </ha-icon-button>
              <ha-icon-button
                class=${this.haCardText ? 'active' : ''}
                .label=${t(language, 'haCardText')}
                @click=${() => this.toggleHaCardText()}
              >
                <ha-icon icon="mdi:home-assistant"></ha-icon>
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
              // On a phone the toolbar's direction button is out of sight (#29).
              ...(isNarrow()
                ? ['divider' as const, ...this.directionEntries(flowAxis(flow.graph).direction)]
                : []),
            ])}
          </div>
        </header>
        ${this.renderTabs()}
        ${this.renderSaveProblem()}
        ${this.renderBlueprintNote(flow)}
        ${this.renderImportWarnings(flow)}
        <div class="work" @pointerdown=${this.closeCanvasMenuOutside}>
          <flode-canvas
            .graph=${flow.graph}
            .minimap=${this.minimapVisible}
            .haText=${this.haCardText}
            .hass=${this.hass}
            .selectedId=${this.selectedId}
            .multiIds=${this.multiIds}
            .runMarks=${this.debugOpen ? this.runMarks : null}
            .activeRunNode=${this.debugOpen ? this.activeRunNode : null}
            .saveIssue=${this.saveProblem?.issue ?? null}
            @graph-change=${(e: CustomEvent<{ graph: FlowGraph }>) => this.commit(e.detail.graph)}
            @add-next=${this.onAddNext}
            @view-move=${() => {
              this.canvasMenu = null;
            }}
            @canvas-menu=${(e: CustomEvent<CanvasMenuDetail>) => {
              this.canvasMenu = e.detail;
            }}
            @multi-select=${(e: CustomEvent<{ ids: string[] }>) => {
              this.multiIds = e.detail.ids;
              this.selectedId = null;
              this.inspectorError = null;
            }}
            @selection-action=${(e: CustomEvent<SelectionAction>) => this.selectionAction(e.detail)}
            @select=${(e: CustomEvent<{ id: string | null }>) => {
              this.multiIds = [];
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
            class="resizer ${sideHidden ? 'hidden' : ''}"
            title=${t(language, 'resize')}
            @pointerdown=${this.onResizeStart}
            @dblclick=${() => {
              this.inspectorWidth = null;
              storeInspectorWidth(null);
            }}
          ></div>
          <div class="side ${sideOpen ? 'open' : ''} ${sideHidden ? 'hidden' : ''}">
          <div class="sheet-bar">
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
              .context=${this.branchContext(view, this.selectedId)}
              .nodes=${this.flow?.graph.nodes ?? []}
              .flowVariables=${[this.flow?.graph.userVariables, this.flow?.graph.userTriggerVariables]}
              .error=${this.inspectorError}
              @data-change=${this.onDataChange}
              @step-change=${this.onStepChange}
              @nodes-change=${(e: CustomEvent<NodesChange>) =>
                this.applyEdits(
                  e.detail.data,
                  e.detail.step,
                  cardEditKey(e.detail.step?.id ?? e.detail.data[0]?.id ?? '')
                )}
            @run-from=${(e: CustomEvent<{ id: string; scope?: SequenceScope }>) =>
              this.startRun(e.detail.id, e.detail.scope ?? 'from')}
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
      <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px">
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
      <ha-icon icon="mdi:history"></ha-icon><span>${t(this.language, 'lastRun')}: ${when}</span>
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
      <flode-progress .progress=${this.progress}></flode-progress>
      <flode-welcome
        .language=${this.language}
        .mode=${this.welcome}
        @closed=${() => {
          this.welcome = null;
        }}
      ></flode-welcome>
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
        @imported=${(e: CustomEvent<ImportedFlow>) => void this.openImported(e.detail)}
      ></flode-yaml-import>
      <flode-runfrom
        .hass=${this.hass}
        .graph=${this.runGraph()}
        .nodeId=${this.runFromId}
        .scope=${this.runScope}
        .item=${this.flow?.isNew ? undefined : this.flow?.item}
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
      ${this.renderConflictDialog()}
    `;
  }

  /** "Changed in Home Assistant" before saving over it (HA's dialog element, FLODE's texts). */
  private renderConflictDialog() {
    const conflict = this.conflict;
    if (!conflict) return nothing;
    const language = this.language;
    return html`<ha-dialog
      open
      .headerTitle=${t(language, 'conflictTitle')}
      @closed=${() => this.closeConflict('cancel')}
    >
      <p>${t(language, 'conflictText').replace('{name}', conflict.name)}</p>
      <ha-dialog-footer slot="footer">
        <ha-button slot="secondaryAction" appearance="plain" @click=${() => this.closeConflict('cancel')}>
          ${this.hass?.localize('ui.common.cancel') || t(language, 'back')}
        </ha-button>
        <ha-button slot="secondaryAction" appearance="plain" @click=${() => this.closeConflict('reload')}>
          ${t(language, 'conflictReload')}
        </ha-button>
        <ha-button slot="primaryAction" @click=${() => this.closeConflict('overwrite')}>
          ${t(language, 'conflictOverwrite')}
        </ha-button>
      </ha-dialog-footer>
    </ha-dialog>`;
  }

  static styles = css`
    :host {
      display: block;
      /* HA's partial-panel-resolver has no definite height, so 100% collapsed
         the editor to its content — size to the viewport like HA's own panels. */
      height: 100vh;
      height: 100dvh;
      /* No background of its own: since HA 2026.11 the theme's background is painted behind panels. */
      color: var(--primary-text-color);
      font-family: var(--ha-font-family-body, Roboto, sans-serif);
    }
    .muted {
      color: var(--secondary-text-color);
    }
    .center {
      text-align: center;
    }
    /* The whole start screen scrolls at the panel's edge; the content fills
       the available width and the card grid adds columns as it grows. */
    .home-scroll {
      height: 100%;
      overflow-y: auto;
    }
    .home {
      box-sizing: border-box;
      padding: 24px clamp(16px, 3vw, 40px) 64px;
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
    /* With HA's table the page itself stays put; the table scrolls inside. */
    .home-scroll.fill {
      display: flex;
      flex-direction: column;
    }
    .home-scroll.fill .home {
      flex: 1;
      min-height: 0;
      padding-bottom: 16px;
    }
    .ha-table {
      flex: 1;
      min-height: 320px;
      border: 1px solid var(--divider-color);
      border-radius: 12px;
      overflow: hidden;
    }
    /* HA-style app bar, like HA's own pages (and Evenlight). */
    .home-toolbar {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      align-items: center;
      gap: 4px;
      height: var(--header-height, 56px);
      padding: 0 12px;
      box-sizing: border-box;
      background: var(--app-header-background-color, var(--primary-background-color));
      color: var(--app-header-text-color, var(--primary-text-color));
      border-bottom: var(--app-header-border-bottom, 1px solid var(--divider-color));
    }
    .home-toolbar-title {
      margin-inline-start: 8px;
      font-size: 20px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
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
    .save-problem {
      background: color-mix(in srgb, var(--error-color, #db4437) 12%, transparent);
    }
    .save-problem-line {
      display: flex;
      align-items: center;
      gap: 8px;
      justify-content: space-between;
    }
    .save-problem details {
      margin-top: 4px;
      color: var(--secondary-text-color);
      font-size: 12px;
    }
    .save-problem summary {
      cursor: pointer;
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
      /* HA's grey focus ring was barely visible (2.9 : 1) — the theme colour instead. */
      --wa-focus-ring-color: var(--primary-color);
      --wa-focus-ring: solid 2px var(--primary-color);
    }
    .name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      display: flex;
      align-items: baseline;
      gap: 10px;
    }
    .flow-name {
      /* The name keeps its room: when the toolbar gets tight, "Letzter Lauf" gives way first. */
      flex: 0 1 auto;
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
    /* Opens to the right of "+": on the left it ran under HA's sidebar (iPad, toolbar in two rows). */
    .menu {
      position: absolute;
      top: 44px;
      left: 0;
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
    @media (pointer: coarse) {
      .menu button {
        min-height: 44px;
      }
    }
    .last-run {
      display: flex;
      flex: 0 1000 auto;
      /* Squeezed, the text goes first; the icon stays whole (#33). */
      min-width: calc(var(--mdc-icon-size) + 20px);
      overflow: hidden;
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
    .last-run span {
      overflow: hidden;
      text-overflow: ellipsis;
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
    /* Shortcut hints in the menus: clearly an aside, not a second entry (#32). */
    ha-dropdown-item [slot='details'] {
      font-size: 0.8em;
      color: var(--secondary-text-color);
      opacity: 0.8;
      margin-left: 16px;
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
    .side.hidden,
    .resizer.hidden {
      display: none;
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
      /* More buttons past an edge: that edge fades out. */
      .tools.more,
      .tools.less {
        --fade-left: 0px;
        --fade-right: 0px;
        mask-image: linear-gradient(
          to right,
          transparent,
          #000 var(--fade-left),
          #000 calc(100% - var(--fade-right)),
          transparent
        );
      }
      .tools.less {
        --fade-left: 48px;
      }
      .tools.more {
        --fade-right: 48px;
      }
      .tool-label,
      .status,
      .last-run,
      .minimap-toggle {
        /* The minimap itself is hidden on phones (flode-canvas). */
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
    }
  `;
}

defineElement('flode-panel', FlodePanel);
