// Step "roundtrip": FLODE must save an automation exactly as it was. For every
// seeded automation: open it, move one card (a layout-only change), save, and
// compare what HA now stores with the original — apart from FLODE's layout
// metadata and HA's own legacy-key migration (platform → trigger, service → action …).
// The original is put back afterwards.
import fs from 'node:fs';
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

const PLURAL = { trigger: 'triggers', condition: 'conditions', action: 'actions' };

/** HA's own migration of old keys, so "platform: state" and "trigger: state" compare equal. */
function migrate(value, top = false) {
  if (Array.isArray(value)) return value.map((item) => migrate(item));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    let name = key;
    if (top && PLURAL[key]) name = PLURAL[key];
    else if (key === 'platform' && !('trigger' in value)) name = 'trigger';
    else if (key === 'service' && !('action' in value) && typeof item === 'string') name = 'action';
    const migrated = migrate(item);
    // An empty list means the same as none ("conditions: []"), and so does empty service data.
    if (Array.isArray(migrated) && migrated.length === 0) continue;
    if (
      name === 'data' &&
      migrated &&
      typeof migrated === 'object' &&
      Object.keys(migrated).length === 0
    )
      continue;
    out[name] = migrated;
  }
  if (top) {
    for (const key of Object.values(PLURAL)) {
      if (out[key] !== undefined && !Array.isArray(out[key])) out[key] = [out[key]];
    }
  }
  return out;
}

/** What has to survive a save: everything except name, id, FLODE's layout and HA's defaults. */
function essence(config) {
  const { id: _id, alias: _alias, description, mode, variables, ...rest } = migrate(config, true);
  // `_cafe_metadata`: the layout under its old (C.A.F.E.) name, which FLODE reads and renames.
  const { _flode_metadata: _meta, _cafe_metadata: _legacy, ...ownVariables } = variables ?? {};
  return {
    ...rest,
    ...(description ? { description } : {}),
    ...(mode && mode !== 'single' ? { mode } : {}),
    ...(Object.keys(ownVariables).length > 0 ? { variables: ownVariables } : {}),
  };
}

/** First place two values differ, as a path ("actions[1].data.brightness"), or null. */
function firstDifference(a, b, where = '') {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b))
      return `${where}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`;
    if (a.length !== b.length) return `${where}: ${a.length} items ≠ ${b.length} items`;
    for (let i = 0; i < a.length; i++) {
      const diff = firstDifference(a[i], b[i], `${where}[${i}]`);
      if (diff) return diff;
    }
    return null;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const diff = firstDifference(a[key], b[key], where ? `${where}.${key}` : key);
      if (diff) return diff;
    }
    return null;
  }
  return Object.is(a, b) ? null : `${where}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`;
}

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
      const diff = firstDifference(essence(before), essence(after));
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
