// Removes everything the gate put into the test HA (automations starting with flode_gate_).
import { GATE_PREFIX, rest, ws } from './lib.mjs';

let removed = 0;
for (const entry of await ws({ type: 'config/entity_registry/list' })) {
  if (entry.platform !== 'automation' || !entry.unique_id?.startsWith(GATE_PREFIX)) continue;
  await rest('DELETE', `config/automation/config/${entry.unique_id}`).catch(() => undefined);
  removed += 1;
}
console.log(`✓ removed ${removed} gate automations`);
