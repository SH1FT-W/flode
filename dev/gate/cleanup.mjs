// Removes everything the gate put into the test HA (automations and scripts starting with flode_gate_).
import { configRoute, GATE_PREFIX, rest, ws } from './lib.mjs';

let removed = 0;
for (const entry of await ws({ type: 'config/entity_registry/list' })) {
  if (!['automation', 'script'].includes(entry.platform)) continue;
  if (!entry.unique_id?.startsWith(GATE_PREFIX)) continue;
  await rest('DELETE', configRoute({ id: entry.unique_id, kind: entry.platform })).catch(
    () => undefined
  );
  removed += 1;
}
console.log(`✓ removed ${removed} gate flows`);
