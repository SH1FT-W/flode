import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { type HomeAssistant, isRecord } from './ha';
import { HaContextProvider } from './ha-context';

/**
 * HA's descriptions of integration triggers and conditions (`motion.detected`,
 * `sun.is_night` …, HA 2026.x): their fields, targets and selectors. HA's
 * editors only show a form for such a step when they get its description —
 * HA's own automation editor subscribes to them (`trigger_platforms/subscribe`)
 * and hands them on as Lit contexts and as the editor's `description`.
 * FLODE does the same for the editors it renders. An HA without these
 * commands simply has no descriptions — its steps keep their own forms.
 */

export type PlatformKind = 'trigger' | 'condition';

export type PlatformDescriptions = Readonly<Record<string, Record<string, unknown>>>;

const SUBSCRIBE: Record<PlatformKind, string> = {
  trigger: 'trigger_platforms/subscribe',
  condition: 'condition_platforms/subscribe',
};

/** The Lit contexts HA's nested rows (conditions in an if block …) read them from. */
const CONTEXT: Record<PlatformKind, string> = {
  trigger: 'triggerDescriptions',
  condition: 'conditionDescriptions',
};

const KINDS: readonly PlatformKind[] = ['trigger', 'condition'];

/** Only the well-formed entries of an update (HA sends added/changed platforms). */
function descriptionsOf(message: unknown): Record<string, Record<string, unknown>> {
  if (!isRecord(message)) return {};
  const out: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of Object.entries(message)) {
    if (isRecord(value)) out[key] = value;
  }
  return out;
}

export class PlatformDescriptionsController implements ReactiveController {
  private providers: Record<PlatformKind, HaContextProvider<PlatformDescriptions>>;
  private unsubscribes: Promise<() => void>[] = [];
  private connection: HomeAssistant['connection'];

  constructor(
    private readonly host: ReactiveControllerHost & HTMLElement,
    private readonly hass: () => HomeAssistant | undefined
  ) {
    this.providers = {
      trigger: new HaContextProvider<PlatformDescriptions>(host, CONTEXT.trigger, {}),
      condition: new HaContextProvider<PlatformDescriptions>(host, CONTEXT.condition, {}),
    };
    host.addController(this);
  }

  /** What HA knows about the integration triggers (or conditions) so far. */
  get(kind: PlatformKind): PlatformDescriptions {
    return this.providers[kind].value;
  }

  hostUpdate(): void {
    const connection = this.hass()?.connection;
    if (!connection || connection === this.connection) return;
    this.stop();
    this.connection = connection;
    this.unsubscribes = KINDS.map((kind) =>
      connection
        .subscribeMessage<unknown>(
          (message) => {
            const provider = this.providers[kind];
            provider.set({ ...provider.value, ...descriptionsOf(message) });
            this.host.requestUpdate();
          },
          { type: SUBSCRIBE[kind] }
        )
        // An HA without the command: no descriptions, nothing else changes.
        .catch(() => () => undefined)
    );
  }

  hostDisconnected(): void {
    this.stop();
    for (const kind of KINDS) this.providers[kind].clear();
  }

  private stop(): void {
    for (const unsubscribe of this.unsubscribes) void unsubscribe.then((stop) => stop());
    this.unsubscribes = [];
    this.connection = undefined;
  }
}
