// Step "roundtrip": FLODE must save an automation exactly as it was. For every
// seeded flow: open it and save it twice —
//   1. as it is (nothing touched: the pure parse → transpile path of the real editor),
//   2. after moving one card (a layout-only change, as a user would),
// and after each save compare what HA now stores with the original — apart from
// FLODE's layout metadata and HA's own legacy-key migration (platform → trigger,
// service → action …). What "the same" means is defined once, in
// packages/transpiler/src/ha-equal.ts (the unit tests use the same definition).
// The original is put back afterwards.
import fs from 'node:fs';
import {
  firstDifference,
  internalKeysIn,
  normalizeHaConfig,
} from '../../packages/transpiler/src/ha-equal.ts';
import {
  closeFlow,
  configBody,
  configRoute,
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

/** Moves one card a little — a layout-only change. Some cards don't move (a block's lane), so try a few. */
async function moveACard(page) {
  for (const card of (await readCards(page)).slice(0, 4)) {
    const x = card.box.x + card.box.width / 2;
    const y = card.box.y + card.box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 30, y + 40, { steps: 5 });
    await page.mouse.up();
    if ((await inPanel(page, (panel) => panel.saveState)) === 'unsaved') return;
  }
}

/** Marks the open flow as changed without touching it: saving then writes the graph as it was read. */
async function touchNothing(page) {
  await inPanel(page, (panel) => {
    panel.saveState = 'unsaved';
  });
}

/**
 * Makes the open flow unsaved with `dirty`, saves it like a user (the Save button) and
 * compares what HA stores with `before`. `where` names the pass in the report.
 */
async function saveAndCompare(page, flow, before, dirty, where) {
  await dirty(page);
  const state = await inPanel(page, (panel) => panel.saveState);
  if (state !== 'unsaved') {
    result.fail(`${where}: the flow is not marked as changed (${state})`);
    return;
  }
  await page.getByRole('button', { name: await label(page, 'save') }).click();
  await waitForPanel(page, (panel) => panel.saveState === 'saved').catch(() =>
    result.fail(`${where}: save did not finish`)
  );
  const after = await rest('GET', configRoute(flow));
  if (!after.variables?._flode_metadata) result.fail(`${where}: saved without FLODE's layout`);
  for (const key of internalKeysIn(after))
    result.fail(`${where}: FLODE-internal key saved at ${key}`);
  const diff = firstDifference(normalizeHaConfig(before), normalizeHaConfig(after));
  if (diff && KNOWN[flow.id]) result.note(`${where}: known difference (${KNOWN[flow.id]})`);
  else if (diff) result.fail(`${where}: changed on save at ${diff}`);
  else if (KNOWN[flow.id])
    result.fail(`${where}: listed in known.json but saves unchanged now — remove it there`);
}

const { browser, page, errors } = await openBrowser('chromium');
try {
  await gotoPanel(page);
  for (const flow of flows) {
    const before = await rest('GET', configRoute(flow));
    const putBack = () => rest('POST', configRoute(flow), configBody(flow, before));
    await result.check(
      `roundtrip · ${flow.name}`,
      async () => {
        errors.length = 0;
        try {
          await openFlow(page, flow.name);
          await saveAndCompare(page, flow, before, touchNothing, `save as is · ${flow.name}`);
          await saveAndCompare(page, flow, before, moveACard, `move and save · ${flow.name}`);
          for (const error of errors) result.fail(`roundtrip · ${flow.name}: ${error}`);
          await closeFlow(page);
        } finally {
          await putBack();
        }
      },
      () => gotoPanel(page, { reload: true })
    );
  }
} finally {
  await browser.close();
}
result.finish();
