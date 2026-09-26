import type { TemplateConnection } from '@flode/ui-core';
import { SUMMARY_TRANSLATION_CATEGORIES } from '@flode/ui-core';
import type { HaTrace } from './trace';
/**
 * The slice of Home Assistant's frontend objects FLODE 3 uses. HA passes
 * `hass` into the panel element; everything else (ha-selector, ha-icon,
 * ha-button …) is HA's own web components from the same document.
 */

export interface HassEntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
}

export interface HomeAssistant {
  states: Record<string, HassEntityState>;
  language: string;
  themes: { darkMode: boolean };
  localize: (key: string, ...args: unknown[]) => string;
  callApi: <T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown) => Promise<T>;
  callWS: <T>(message: Record<string, unknown> & { type: string }) => Promise<T>;
  services?: Record<string, Record<string, { name?: string }>>;
  devices?: Record<string, { name?: string | null; name_by_user?: string | null }>;
  areas?: Record<string, { name: string }>;
  entities?: Record<string, { area_id?: string | null; device_id?: string | null }>;
  config?: { components: string[]; time_zone?: string };
  /** HA's websocket connection (live subscriptions such as `render_template`). */
  connection?: TemplateConnection;
  /** Loads an HA backend translation category (`services`, `title` …) into `localize`. */
  loadBackendTranslation?: (category: string) => Promise<unknown>;
  /** Sidebar setting: `always_hidden` when the user hid it (long-press on "Home Assistant"). */
  dockedSidebar?: 'docked' | 'always_hidden' | 'auto';
  kioskMode?: boolean;
  /** Loads a panel's UI strings into `localize` (HA does this per panel). */
  loadFragmentTranslation?: (fragment: string) => Promise<unknown>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function friendlyName(hass: HomeAssistant | undefined, entityId: string): string {
  const name = hass?.states[entityId]?.attributes.friendly_name;
  return typeof name === 'string' ? name : entityId;
}

export type FlowKind = 'automation' | 'script';

export interface AutomationListItem {
  /** Automation or script — they have separate config APIs and ids. */
  kind: FlowKind;
  entityId: string;
  /** Config id (`id:` in automations.yaml) — what the config API takes. */
  configId: string;
  name: string;
  enabled: boolean;
  lastTriggered: string | null;
}

/** Every UI-editable automation HA knows (entities with a config `id`). */
export function listAutomations(hass: HomeAssistant): AutomationListItem[] {
  return Object.values(hass.states)
    .filter((s) => s.entity_id.startsWith('automation.'))
    .flatMap((s) => {
      const id = s.attributes.id;
      if (typeof id !== 'string' && typeof id !== 'number') return [];
      const last = s.attributes.last_triggered;
      return [
        {
          kind: 'automation' as const,
          entityId: s.entity_id,
          configId: String(id),
          name: friendlyName(hass, s.entity_id),
          enabled: s.state === 'on',
          lastTriggered: typeof last === 'string' ? last : null,
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Every script HA knows; its config id is the entity's object id (`script.<id>`). */
export function listScripts(hass: HomeAssistant): AutomationListItem[] {
  return Object.values(hass.states)
    .filter((s) => s.entity_id.startsWith('script.'))
    .map((s) => {
      const last = s.attributes.last_triggered;
      return {
        kind: 'script' as const,
        entityId: s.entity_id,
        configId: s.entity_id.slice('script.'.length),
        name: friendlyName(hass, s.entity_id),
        enabled: true,
        lastTriggered: typeof last === 'string' ? last : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function listFlows(hass: HomeAssistant, kind: FlowKind): AutomationListItem[] {
  return kind === 'script' ? listScripts(hass) : listAutomations(hass);
}

/**
 * Config id for a new script from its name — like HA's script editor
 * (`Flur Licht` → `flur_licht`), unique among the existing scripts.
 */
export function newScriptId(hass: HomeAssistant, alias: string): string {
  const base =
    alias
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ß/g, 'ss')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'script';
  let id = base;
  for (let n = 2; hass.states[`script.${id}`]; n++) id = `${base}_${n}`;
  return id;
}

export async function loadFlowConfig(
  hass: HomeAssistant,
  kind: FlowKind,
  configId: string
): Promise<Record<string, unknown>> {
  const config = await hass.callApi<unknown>('GET', `config/${kind}/config/${configId}`);
  if (!isRecord(config)) throw new Error(`No config for ${kind} ${configId}`);
  return config;
}

export async function saveFlowConfig(
  hass: HomeAssistant,
  kind: FlowKind,
  configId: string,
  config: Record<string, unknown>
): Promise<void> {
  await hass.callApi('POST', `config/${kind}/config/${configId}`, config);
}

export async function loadAutomationConfig(
  hass: HomeAssistant,
  configId: string
): Promise<Record<string, unknown>> {
  const config = await hass.callApi<unknown>('GET', `config/automation/config/${configId}`);
  if (!isRecord(config)) throw new Error(`No config for automation ${configId}`);
  return config;
}

export async function saveAutomationConfig(
  hass: HomeAssistant,
  configId: string,
  config: Record<string, unknown>
): Promise<void> {
  await hass.callApi('POST', `config/automation/config/${configId}`, config);
}

interface CardHelpers {
  createCardElement: (config: { type: string }) => Promise<{
    constructor: { getConfigElement?: () => Promise<unknown> };
  }>;
}

declare global {
  interface Window {
    loadCardHelpers?: () => Promise<CardHelpers>;
  }
}

let selectorLoad: Promise<boolean> | null = null;

async function probeHaSelector(): Promise<boolean> {
  try {
    const helpers = await window.loadCardHelpers?.();
    const card = await helpers?.createCardElement({ type: 'button' });
    await card?.constructor.getConfigElement?.();
  } catch {
    // Falls through to the definition check.
  }
  return customElements.get('ha-selector') !== undefined;
}

/**
 * HA registers `ha-selector` lazily; opening a card editor forces it
 * (same probe the current FLODE uses). Resolves `false` when it can't.
 */
export function ensureHaSelector(): Promise<boolean> {
  if (customElements.get('ha-selector')) return Promise.resolve(true);
  selectorLoad ??= probeHaSelector();
  return selectorLoad;
}

interface RouteLoader {
  routerOptions: { routes: Record<string, { load: () => Promise<unknown> }> };
}

const AUTOMATION_EDITOR_TAGS = [
  'ha-script-editor',
  'ha-script-fields',
  'ha-automation-trigger-editor',
  'ha-automation-condition-editor',
  'ha-automation-action-editor',
  'ha-automation-trigger',
  'ha-automation-condition',
  'ha-automation-action',
];

let editorLoad: Promise<boolean> | null = null;

async function loadAutomationEditors(): Promise<boolean> {
  try {
    // HA only registers its automation editors inside the config panel. Resolve
    // that panel's route loaders the way HA itself does when you open
    // Settings → Automations — nothing gets rendered.
    await customElements.whenDefined('partial-panel-resolver');
    const resolver = document.createElement('partial-panel-resolver') as unknown as {
      _getRoutes: (panels: Record<string, unknown>) => RouteLoader['routerOptions'];
    };
    const routes = resolver._getRoutes({
      flode_config: { url_path: 'flode_config', component_name: 'config' },
    }).routes;
    await routes.flode_config?.load();
    await customElements.whenDefined('ha-panel-config');
    const config = document.createElement('ha-panel-config') as unknown as RouteLoader;
    await config.routerOptions.routes.automation?.load();
    await config.routerOptions.routes.script?.load();
  } catch {
    // Falls through to the definition check — the inspector keeps the YAML editor.
  }
  return AUTOMATION_EDITOR_TAGS.every((tag) => customElements.get(tag) !== undefined);
}

/**
 * HA's own trigger/condition/action editors and add dialogs — the forms of
 * Settings → Automations. Resolves `false` if this HA version can't provide them.
 */
export function ensureAutomationEditors(hass: HomeAssistant | undefined): Promise<boolean> {
  // The editors' labels live in the config panel's translation fragment.
  editorLoad ??= Promise.all([
    AUTOMATION_EDITOR_TAGS.every((tag) => customElements.get(tag))
      ? Promise.resolve(true)
      : loadAutomationEditors(),
    hass?.loadFragmentTranslation?.('config').catch(() => undefined),
  ]).then(([ready]) => ready);
  return editorLoad;
}

const translationsLoaded = new Set<string>();

/** HA's own names for services, triggers, conditions and integrations (once per language). */
export function loadSummaryTranslations(hass: HomeAssistant): void {
  if (translationsLoaded.has(hass.language)) return;
  translationsLoaded.add(hass.language);
  for (const category of SUMMARY_TRANSLATION_CATEGORIES) {
    void hass.loadBackendTranslation?.(category).catch(() => undefined);
  }
}

// ---- automation settings: HA's own rename + mode dialogs --------------------

/** Automation-level settings HA's dialogs edit (alias/description, mode/max). */
export interface AutomationSettings {
  alias: string;
  description: string;
  mode: string;
  max?: number;
  max_exceeded?: string;
  /** Scripts only (HA's rename dialog offers it for scripts). */
  icon?: string;
}

/** Area / category / labels as HA's rename dialog returns them (entity registry, not config). */
export interface RegistryUpdate {
  area?: string | null;
  category?: string | null;
  labels?: string[];
}

export interface RegistryEntry {
  entity_id: string;
  area_id?: string | null;
  labels?: string[];
  categories?: Record<string, string | null>;
}

type DialogKind = 'alias' | 'mode';

/** HA's editor element per flow kind and the names its dialog methods use. */
const EDITOR = {
  automation: {
    tag: 'ha-automation-editor',
    alias: '_promptAutomationAlias',
    mode: '_promptAutomationMode',
    idKey: 'automationId',
    save: '_saveAutomation',
  },
  script: {
    tag: 'ha-script-editor',
    alias: '_promptScriptAlias',
    mode: '_promptScriptMode',
    idKey: 'scriptId',
    save: '_saveScript',
  },
} as const satisfies Record<FlowKind, Record<string, string>>;

/** Editor state HA's dialog methods read: config id and registry entry (scripts look it up by `unique_id`). */
function editorIdentity(
  flowKind: FlowKind,
  configId: string | undefined,
  entry: RegistryEntry | null | undefined
): Record<string, unknown> {
  return {
    [EDITOR[flowKind].idKey]: configId,
    registryEntry: entry ?? undefined,
    entityRegistry: entry && configId ? [{ ...entry, unique_id: configId }] : [],
  };
}

/**
 * Runs one of HA's automation-editor dialog methods (rename, mode, "unsaved
 * changes"). They're methods of HA's own editor that read and write
 * `this.config` etc.; `host` stands in for that editor (it must be in the
 * document so HA's dialog event reaches `home-assistant`). Returns what the
 * method resolved plus the host carrying the edited state.
 */
async function runEditorDialog(
  hass: HomeAssistant,
  host: HTMLElement,
  flowKind: FlowKind,
  method: string,
  state: Record<string, unknown>
): Promise<{ result: unknown; editor: HTMLElement; changed: boolean } | null> {
  if (!(await ensureAutomationEditors(hass))) return null;
  const run: unknown = customElements.get(EDITOR[flowKind].tag)?.prototype[method];
  if (typeof run !== 'function') return null;
  let changed = false;
  const legacy = Object.fromEntries(
    Object.entries(state).flatMap(([key, value]) => {
      const old = LEGACY_EDITOR_FIELDS[key];
      return old ? [[old, value]] : [];
    })
  );
  const editor = Object.assign(
    host,
    state,
    { _dirty: false, ...legacy },
    {
      hass,
      _updateDirtyState: () => {
        changed = true;
      },
      requestUpdate: () => undefined,
    }
  );
  initialEditorState.set(editor, state);
  const wasDirty = Reflect.get(editor, '_dirty') === true;
  const result: unknown = await Reflect.apply(run, editor, []);
  // HA before 2026.9 marks the change with `this._dirty = true` instead of `_updateDirtyState()`.
  if (!wasDirty && Reflect.get(editor, '_dirty') === true) changed = true;
  return { result, editor, changed };
}

/**
 * HA renamed its editors' internal fields in 2026.9 (`_config` → `config` …).
 * The dialogs of both generations read and write their own names, so FLODE
 * sets both and reads back whichever the dialog changed.
 */
const LEGACY_EDITOR_FIELDS: Record<string, string> = {
  config: '_config',
  entityRegistryUpdate: '_entityRegistryUpdate',
  registryEntry: '_registryEntry',
  currentEntityId: '_entityId',
  isDirtyState: '_dirty',
  entityRegCreated: '_entityRegCreated',
};
const initialEditorState = new WeakMap<HTMLElement, Record<string, unknown>>();

function editorField(editor: HTMLElement, name: string): unknown {
  const current: unknown = Reflect.get(editor, name);
  const oldName = LEGACY_EDITOR_FIELDS[name];
  if (!oldName) return current;
  const old: unknown = Reflect.get(editor, oldName);
  const initial = initialEditorState.get(editor)?.[name];
  return old !== undefined && old !== initial ? old : current;
}

function settingsFrom(editor: HTMLElement, fallback: AutomationSettings): AutomationSettings {
  const config = editorField(editor, 'config');
  if (!isRecord(config)) return fallback;
  return {
    alias: typeof config.alias === 'string' ? config.alias : fallback.alias,
    description: typeof config.description === 'string' ? config.description : '',
    mode: typeof config.mode === 'string' ? config.mode : 'single',
    max: typeof config.max === 'number' ? config.max : undefined,
    max_exceeded: typeof config.max_exceeded === 'string' ? config.max_exceeded : undefined,
    icon: typeof config.icon === 'string' && config.icon ? config.icon : undefined,
  };
}

function registryUpdateFrom(editor: HTMLElement): RegistryUpdate | undefined {
  const update = editorField(editor, 'entityRegistryUpdate');
  return isRecord(update) ? update : undefined;
}

/**
 * Opens HA's own "rename" (name, description, area, category, labels) or
 * "mode" dialog — the ones of Settings → Automations. Resolves the edited
 * settings, or `null` when cancelled.
 */
export async function promptAutomationDialog(
  hass: HomeAssistant,
  host: HTMLElement,
  target: { flowKind: FlowKind; configId: string | undefined },
  kind: DialogKind,
  settings: AutomationSettings,
  registry: { entry?: RegistryEntry | null; update?: RegistryUpdate }
): Promise<{ settings: AutomationSettings; registryUpdate?: RegistryUpdate } | null> {
  const run = await runEditorDialog(hass, host, target.flowKind, EDITOR[target.flowKind][kind], {
    ...editorIdentity(target.flowKind, target.configId, registry.entry),
    config: { ...settings },
    entityRegistryUpdate: registry.update,
  });
  if (!run?.changed) return null;
  return {
    settings: settingsFrom(run.editor, settings),
    registryUpdate: registryUpdateFrom(run.editor),
  };
}

/**
 * HA's own "unsaved changes" dialog (Save / Discard / Cancel), as HA's
 * editor shows it when leaving. `save` runs when the user picks Save, with
 * the name etc. entered there. Resolves `true` to go on (saved or
 * discarded), `false` to stay.
 */
export async function confirmUnsavedChanges(
  hass: HomeAssistant,
  host: HTMLElement,
  options: {
    flowKind: FlowKind;
    /** `undefined` for a flow that isn't in HA yet. */
    configId: string | undefined;
    settings: AutomationSettings;
    registry: { entry?: RegistryEntry | null; update?: RegistryUpdate };
    save: (settings: AutomationSettings, registryUpdate?: RegistryUpdate) => Promise<boolean>;
  }
): Promise<boolean> {
  const run = await runEditorDialog(hass, host, options.flowKind, 'confirmUnsavedChanged', {
    ...editorIdentity(options.flowKind, options.configId, options.registry.entry),
    isDirtyState: true,
    config: { ...options.settings },
    entityRegistryUpdate: options.registry.update,
    [EDITOR[options.flowKind].save]: async function (this: HTMLElement) {
      const ok = await options.save(settingsFrom(this, options.settings), registryUpdateFrom(this));
      if (!ok) throw new Error('save failed');
    },
  });
  return run?.result === true;
}

/**
 * HA's own "run script": a script with input fields opens HA's more-info
 * dialog to fill them in, otherwise it starts right away with HA's
 * "triggered" toast. Runs the version saved in HA.
 */
export async function runScript(
  hass: HomeAssistant,
  host: HTMLElement,
  script: { entityId: string; configId: string; name: string }
): Promise<void> {
  await runEditorDialog(hass, host, 'script', '_runScript', {
    currentEntityId: script.entityId,
    scriptId: script.configId,
    config: { alias: script.name },
  });
}

export async function getRegistryEntry(
  hass: HomeAssistant,
  entityId: string
): Promise<RegistryEntry | null> {
  try {
    return await hass.callWS<RegistryEntry>({
      type: 'config/entity_registry/get',
      entity_id: entityId,
    });
  } catch {
    return null;
  }
}

/** Waits for HA to create the entity of a freshly saved automation. */
export async function waitForAutomationEntity(
  getHass: () => HomeAssistant | undefined,
  kind: FlowKind,
  configId: string,
  timeoutMs = 5000
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hass = getHass();
    const found = hass && listFlows(hass, kind).find((a) => a.configId === configId);
    if (found) return found.entityId;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

/** Applies area / category / labels the way HA's automation editor does after saving. */
export async function applyRegistryUpdate(
  hass: HomeAssistant,
  entityId: string,
  update: RegistryUpdate
): Promise<void> {
  await hass.callWS({
    type: 'config/entity_registry/update',
    entity_id: entityId,
    categories: { automation: update.category ?? null },
    labels: update.labels ?? [],
    area_id: update.area ?? null,
  });
}

/** Readable text for errors from `hass.callApi` / `callWS` (HA puts the reason in `body.message`). */
export function errorMessage(error: unknown): string {
  if (isRecord(error)) {
    const body = error.body;
    if (isRecord(body) && typeof body.message === 'string') return body.message;
    if (typeof error.message === 'string') return error.message;
    if (typeof error.error === 'string') return error.error;
  }
  return error instanceof Error ? error.message : String(error);
}

// ---- runs (traces) — HA's own trace viewer elements ----------------------------

export interface TraceListItem {
  run_id: string;
  state: string;
  script_execution?: string | null;
  timestamp: { start: string; finish?: string | null };
  error?: string;
}

export async function listTraces(
  hass: HomeAssistant,
  kind: FlowKind,
  configId: string
): Promise<TraceListItem[]> {
  const runs = await hass.callWS<TraceListItem[]>({
    type: 'trace/list',
    domain: kind,
    item_id: configId,
  });
  // Newest first, like HA's trace page.
  return [...runs].sort((a, b) => b.timestamp.start.localeCompare(a.timestamp.start));
}

export function getTrace(
  hass: HomeAssistant,
  kind: FlowKind,
  configId: string,
  runId: string
): Promise<HaTrace> {
  return hass.callWS({ type: 'trace/get', domain: kind, item_id: configId, run_id: runId });
}

/** Logbook lines caused by a run (what HA's timeline shows between the steps). */
export async function getRunLogbook(
  hass: HomeAssistant,
  start: string,
  contextId: string
): Promise<unknown[]> {
  if (!hass.config?.components.includes('logbook')) return [];
  try {
    return await hass.callWS<unknown[]>({
      type: 'logbook/get_events',
      start_time: start,
      context_id: contextId,
    });
  } catch {
    return [];
  }
}

let traceViewerLoad: Promise<boolean> | null = null;

/** HA's trace timeline and step details live in the automation trace page's chunk. */
export function ensureTraceViewer(hass: HomeAssistant | undefined): Promise<boolean> {
  traceViewerLoad ??= (async () => {
    await ensureAutomationEditors(hass);
    try {
      const automation = document.createElement('ha-config-automation') as unknown as RouteLoader;
      await automation.routerOptions.routes.trace?.load();
    } catch {
      // Falls through to the definition check.
    }
    return ['hat-trace-timeline', 'ha-trace-path-details'].every(
      (tag) => customElements.get(tag) !== undefined
    );
  })();
  return traceViewerLoad;
}

/** Opens another HA page the way HA's own links do (no reload). */
export function navigateInHa(path: string): void {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
}
