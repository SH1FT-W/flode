import { isPlainObject, isTemplateString } from '@flode/shared';

/**
 * Live template preview on Home Assistant's own renderer (`render_template`
 * subscription) — result, its type and what the template reacts to.
 * Framework-free: a UI passes HA's websocket connection.
 */

export interface TemplateListeners {
  all: boolean;
  entities: string[];
  domains: string[];
  time: boolean;
}

export type TemplatePreview =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; result: unknown; listeners: TemplateListeners | null }
  | { status: 'error'; message: string };

/** The slice of HA's websocket connection the preview needs. */
export interface TemplateConnection {
  subscribeMessage: <T>(
    callback: (message: T) => void,
    message: Record<string, unknown> & { type: string }
  ) => Promise<() => void>;
}

/** Type of a rendered value in words FLODE shows (HA parses results into native types). */
export type TemplateResultType = 'text' | 'number' | 'boolean' | 'list' | 'object' | 'none';

/** Building blocks for the template workshop (appended to the template). */
export const TEMPLATE_SNIPPETS = [
  { key: 'state', code: "{{ states('sensor.x') }}" },
  { key: 'number', code: "{{ states('sensor.x') | float(0) }}" },
  { key: 'isOn', code: "{{ is_state('light.x', 'on') }}" },
  { key: 'attribute', code: "{{ state_attr('light.x', 'brightness') }}" },
  { key: 'since', code: '{{ now() - states.binary_sensor.x.last_changed }}' },
  { key: 'countOn', code: "{{ states.light | selectattr('state', 'eq', 'on') | list | count }}" },
  { key: 'trigger', code: '{{ trigger.to_state.state if trigger is defined else "–" }}' },
  { key: 'time', code: "{{ now().strftime('%H:%M') }}" },
] as const;

export type TemplateSnippetKey = (typeof TEMPLATE_SNIPPETS)[number]['key'];

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export function parseTemplateListeners(value: unknown): TemplateListeners | null {
  if (!isPlainObject(value)) return null;
  return {
    all: value.all === true,
    entities: stringList(value.entities),
    domains: stringList(value.domains),
    time: value.time === true,
  };
}

export function templateResultType(result: unknown): TemplateResultType {
  if (result === null || result === undefined) return 'none';
  if (typeof result === 'number') return 'number';
  if (typeof result === 'boolean') return 'boolean';
  if (Array.isArray(result)) return 'list';
  if (typeof result === 'object') return 'object';
  return 'text';
}

export function formatTemplateResult(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result === undefined) return '';
  return JSON.stringify(result, null, 2);
}

function messageOf(error: unknown): string {
  if (isPlainObject(error) && typeof error.message === 'string') return error.message;
  return error instanceof Error ? error.message : String(error);
}

/**
 * Renders `template` (with `variables`) and keeps the result live. Resolves
 * a stop function; `onUpdate` gets every new result or error.
 */
export function subscribeTemplatePreview(
  connection: TemplateConnection,
  template: string,
  variables: Record<string, unknown> | undefined,
  onUpdate: (preview: TemplatePreview) => void
): () => void {
  if (!isTemplateString(template)) {
    onUpdate({ status: 'idle' });
    return () => undefined;
  }
  onUpdate({ status: 'loading' });
  let stopped = false;
  let unsubscribe: (() => void) | undefined;
  connection
    .subscribeMessage<unknown>(
      (message) => {
        if (stopped || !isPlainObject(message)) return;
        if ('error' in message) {
          onUpdate({ status: 'error', message: messageOf(message.error) });
          return;
        }
        onUpdate({
          status: 'ok',
          result: message.result,
          listeners: parseTemplateListeners(message.listeners),
        });
      },
      {
        type: 'render_template',
        template,
        variables,
        timeout: 3,
        strict: true,
        report_errors: true,
      }
    )
    .then((unsub) => {
      if (stopped) unsub();
      else unsubscribe = unsub;
    })
    .catch((error: unknown) => {
      if (!stopped) onUpdate({ status: 'error', message: messageOf(error) });
    });
  return () => {
    stopped = true;
    unsubscribe?.();
  };
}
