/**
 * Node data as the editors see it (HA step shape plus FLODE extras).
 * Shared by every FLODE UI; `@flode/shared` holds the validating Zod schemas.
 */

export interface TriggerNodeData {
  alias?: string;
  trigger: string;
  entity_id?: string | string[];
  to?: string;
  from?: string;
  event_type?: string;
  [key: string]: unknown;
}

export interface ConditionNodeData {
  alias?: string;
  condition: string;
  entity_id?: string | string[];
  state?: string;
  template?: string;

  // Numeric state conditions
  above?: number;
  below?: number;

  // Time conditions
  after?: string;
  before?: string;
  weekday?: string | string[];

  // Zone conditions
  zone?: string;

  // Sun conditions
  after_offset?: string;
  before_offset?: string;

  // Device conditions
  device_id?: string;
  domain?: string;
  type?: string;
  subtype?: string;

  // Template conditions
  value_template?: string;

  // Generic conditions
  attribute?: string;
  for?: string | { hours?: number; minutes?: number; seconds?: number };

  // Nested conditions for and/or/not group types
  conditions?: ConditionNodeData[];

  [key: string]: unknown;
}

export interface ActionNodeData {
  alias?: string;
  service?: string;
  event?: string;
  event_data?: Record<string, unknown>;
  target?: {
    entity_id?: string | string[];
    area_id?: string | string[];
    device_id?: string | string[];
  };
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DelayNodeData {
  alias?: string;
  delay: string | { hours?: number; minutes?: number; seconds?: number };
  [key: string]: unknown;
}

export interface WaitNodeData {
  alias?: string;
  wait_template?: string;
  wait_for_trigger?: TriggerNodeData[];
  timeout?: string;
  continue_on_timeout?: boolean;
  [key: string]: unknown;
}

export interface SetVariablesNodeData {
  alias?: string;
  variables: Record<string, unknown>;
  [key: string]: unknown;
}

export type FlowNodeData =
  | TriggerNodeData
  | ConditionNodeData
  | ActionNodeData
  | DelayNodeData
  | WaitNodeData
  | SetVariablesNodeData;
