// Waits until the test HA has finished starting and serves FLODE's panel.
//   node dev/gate/ready.mjs [seconds]
import { ws } from './lib.mjs';

const limit = Date.now() + Number(process.argv[2] ?? 120) * 1000;
let last = '';
while (Date.now() < limit) {
  try {
    const config = await ws({ type: 'get_config' });
    if (config.state === 'RUNNING') {
      const panels = await ws({ type: 'get_panels' });
      if (panels.flode) {
        console.log(`✓ ready: HA ${config.version}`);
        process.exit(0);
      }
      last = 'FLODE panel not registered';
    } else last = `HA state ${config.state}`;
  } catch (error) {
    last = error.message;
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
console.log(`✗ not ready: ${last}`);
process.exit(1);
