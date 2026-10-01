import { getRawStep, isPlainObject, toList } from '@flode/shared';
import { collectReferences, collectServices } from './dependency-map';

/**
 * What makes a step fail before it even runs: it calls a service Home
 * Assistant doesn't have, or uses an entity that doesn't exist (anymore).
 * Templates are left out — what they read is only known at run time — and
 * so are disabled steps, which never run.
 */
export type StepIssue =
  | { kind: 'unknownService'; service: string }
  | { kind: 'missingEntity'; entityId: string };

export interface StepIssueEnv {
  hasService: (service: string) => boolean;
  hasEntity: (entityId: string) => boolean;
}

const SECTIONS: Partial<Record<string, 'triggers' | 'conditions'>> = {
  trigger: 'triggers',
  condition: 'conditions',
};

/** Services that create an entity while the flow runs — `scene_id: vorher` → `scene.vorher`. */
const CREATING_SERVICES: Record<string, { field: string; domain: string }> = {
  'scene.create': { field: 'scene_id', domain: 'scene' },
  'group.set': { field: 'object_id', domain: 'group' },
};

/**
 * Entities a flow creates itself (`scene.create`, `group.set`): they only
 * exist once it has run, so a step using them is not an error.
 */
export function createdEntityIds(steps: readonly unknown[]): Set<string> {
  const created = new Set<string>();
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!isPlainObject(node)) return;
    const service = node.action ?? node.service;
    const creates = typeof service === 'string' ? CREATING_SERVICES[service] : undefined;
    const data = isPlainObject(node.data) ? node.data : {};
    for (const id of toList(creates ? data[creates.field] : undefined)) {
      if (creates && typeof id === 'string') created.add(`${creates.domain}.${id}`);
    }
    Object.values(node).forEach(walk);
  };
  walk(steps);
  return created;
}

/** Issues of one flow node (`trigger` / `condition` / any action-like node). */
export function stepIssues(
  nodeType: string,
  data: Record<string, unknown>,
  env: StepIssueEnv
): StepIssue[] {
  if (data.enabled === false) return [];
  const step = getRawStep(data) ?? data;
  const section = SECTIONS[nodeType] ?? 'actions';
  const unknownServices = (section === 'actions' ? collectServices(step) : []).filter(
    (service) => !env.hasService(service)
  );
  // A missing script is one problem — reported as the action, not again as its entity.
  const reported = new Set(unknownServices);
  const missing = new Set(
    collectReferences({ [section]: [step] })
      .filter((ref) => ref.role !== 'template' && !reported.has(ref.entityId))
      .filter((ref) => !env.hasEntity(ref.entityId))
      .map((ref) => ref.entityId)
  );
  return [
    ...unknownServices.map((service): StepIssue => ({ kind: 'unknownService', service })),
    ...[...missing].map((entityId): StepIssue => ({ kind: 'missingEntity', entityId })),
  ];
}
