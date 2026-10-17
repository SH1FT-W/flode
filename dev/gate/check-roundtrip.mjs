// Step "roundtrip": FLODE must save an automation exactly as it was. For every
// seeded automation: open it, move one card (a layout-only change), save, and
// compare what HA now stores with the original — apart from FLODE's layout
// metadata and HA's own legacy-key migration (platform → trigger, service → action …).
// What "the same" means is defined once, in packages/transpiler/src/ha-equal.ts (the
// unit tests use the same definition). The original is put back afterwards.
import fs from 'node:fs';
import {
  firstDifference,
  internalKeysIn,
  normalizeHaConfig,
} from '../../packages/transpiler/src/ha-equal.ts';
import {
  closeFlow,
  gotoPanel,
  inPanel,
  label,
  openBrowser,
  openFlow,
  readCards,
  report,
  rest,
  seededFlows,
  waitForPanel,
} from './lib.mjs';

const result = report('roundtrip');
/** Differences that are accepted (with the reason), from known.json — reported as notes, not failures. */
const KNOWN = JSON.parse(
  fs.readFileSync(new URL('./known.json', import.meta.url), 'utf8')
).roundtrip;
const flows = seededFlows();

const { browser, page, errors } = await openBrowser('chromium');
try {
  await gotoPanel(page);
  const saveLabel = await label(page, 'save');
  for (const flow of flows) {
    const where = `roundtrip · ${flow.name}`;
    errors.length = 0;
    const before = await rest('GET', `config/automation/config/${flow.id}`);
    try {
      await openFlow(page, flow.name);
      // Move a card a little — a layout-only change. Some cards don't move (a block's lane), so try a few.
      let dirty = 'saved';
      for (const card of (await readCards(page)).slice(0, 4)) {
        const x = card.box.x + card.box.width / 2;
        const y = card.box.y + card.box.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 30, y + 40, { steps: 5 });
        await page.mouse.up();
        dirty = await inPanel(page, (panel) => panel.saveState);
        if (dirty === 'unsaved') break;
      }
      if (dirty !== 'unsaved') {
        result.fail(`${where}: moving a card did not mark the flow as changed (${dirty})`);
        continue;
      }
      await page.getByRole('button', { name: saveLabel }).click();
      await waitForPanel(page, (panel) => panel.saveState === 'saved').catch(() =>
        result.fail(`${where}: save did not finish`)
      );
      const after = await rest('GET', `config/automation/config/${flow.id}`);
      if (!after.variables?._flode_metadata) result.fail(`${where}: saved without FLODE's layout`);
      for (const key of internalKeysIn(after))
        result.fail(`${where}: FLODE-internal key saved at ${key}`);
      const diff = firstDifference(normalizeHaConfig(before), normalizeHaConfig(after));
      if (diff && KNOWN[flow.id]) result.note(`${where}: known difference (${KNOWN[flow.id]})`);
      else if (diff) result.fail(`${where}: changed on save at ${diff}`);
      else if (KNOWN[flow.id])
        result.fail(`${where}: listed in known.json but saves unchanged now — remove it there`);
      for (const error of errors) result.fail(`${where}: ${error}`);
      await closeFlow(page);
    } catch (error) {
      result.fail(`${where}: ${error.message.split('\n')[0]}`);
      await gotoPanel(page, { reload: true });
    } finally {
      await rest('POST', `config/automation/config/${flow.id}`, before);
    }
  }
} finally {
  await browser.close();
}
result.finish();
