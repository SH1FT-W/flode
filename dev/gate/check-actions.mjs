// Step "actions": uses the editor like a user, on the gate's scratch flow, in each browser:
// select a card (HA's editor opens), duplicate, undo, redo, disable, tidy, minimap,
// open a branch card, add a step through HA's own dialog, save (HA must store the
// added step), the runs view, the phone layout and the "What's new" sheet.
// The scratch flow is put back afterwards.

import fs from 'node:fs';
import path from 'node:path';
import {
  awaitEntities,
  ENGINES,
  gotoPanel,
  haLabel,
  inPanel,
  label,
  OUT_DIR,
  openBrowser,
  openFlow,
  REPO,
  readCards,
  report,
  rest,
  seededFlows,
} from './lib.mjs';

const result = report('actions');
const template = seededFlows().find((flow) => flow.id.endsWith('scratch'));
if (!template) throw new Error('scratch flow not seeded');

/** Each browser edits its own copy, so the two never see each other's saves. */
async function scratchFor(engine) {
  const id = `${template.id}_${engine}`;
  const name = `${template.name} ${engine}`;
  const config = { ...template.config, id, alias: name };
  await rest('POST', `config/automation/config/${id}`, config);
  const flow = { id, name, config };
  if ((await awaitEntities([flow])).length > 0) throw new Error(`HA has no entity for ${name}`);
  return flow;
}

const slug = (text) => text.replace(/[^a-z0-9]+/gi, '-');

/** Runs one check; a thrown error counts as its failure (with a screenshot in .gate/shots). */
async function step(where, name, fn, page) {
  try {
    await fn();
  } catch (error) {
    const shot = path.join(OUT_DIR, 'shots', `${slug(`${where}-${name}`)}.png`);
    fs.mkdirSync(path.dirname(shot), { recursive: true });
    await page?.screenshot({ path: shot }).catch(() => undefined);
    result.fail(
      `${where}: ${name}: ${error.message.split('\n')[0]}${page ? ` (${path.relative(REPO, shot)})` : ''}`
    );
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const cardCount = async (page) => (await readCards(page)).length;

async function palette(page, key) {
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  const input = page.locator('flode-palette input');
  await input.waitFor({ timeout: 5000 });
  await input.fill(await label(page, key));
  await page.waitForTimeout(150);
  await input.press('Enter');
  await page.waitForTimeout(300);
}

/** Waits until the canvas stopped moving (fit/tidy animate the view). */
async function settled(page) {
  let last = '';
  for (let i = 0; i < 20; i++) {
    const now = JSON.stringify((await readCards(page)).map((card) => card.box));
    if (now === last) return;
    last = now;
    await page.waitForTimeout(150);
  }
}

/** Selects a card (a click on the selected card would unselect it). */
async function clickCard(page, card) {
  if ((await inPanel(page, (panel) => panel.selectedId)) === card.id) return;
  await settled(page);
  const box = (await readCards(page)).find((c) => c.id === card.id)?.box ?? card.box;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(400);
  const selected = await inPanel(page, (panel) => panel.selectedId);
  if (selected !== card.id) throw new Error(`clicking card ${card.id} selected ${selected}`);
}

async function run(engine) {
  const where = `${engine}`;
  const scratch = await scratchFor(engine);
  // HA creates the automation's entity a moment after saving it.
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const { browser, page, errors } = await openBrowser(engine);
  try {
    await gotoPanel(page);
    await openFlow(page, scratch.name);
    const start = await readCards(page);
    const n = start.length;

    await step(
      where,
      'branch cards of "Choose"',
      async () => {
        expect(
          start.filter((card) => card.id.includes('::')).length >= 2,
          'the choose block shows no branch cards'
        );
      },
      page
    );

    await step(
      where,
      'select a card → HA editor in the sidebar',
      async () => {
        await clickCard(page, start[1]);
        const selected = await inPanel(page, (panel) => panel.selectedId);
        expect(selected === start[1].id, `selected ${selected}`);
        await page
          .locator('flode-inspector ha-automation-action-editor')
          .first()
          .waitFor({ timeout: 8000 });
      },
      page
    );

    await step(
      where,
      'duplicate / undo / redo / undo',
      async () => {
        await palette(page, 'duplicateCard');
        expect((await cardCount(page)) === n + 1, 'duplicate did not add a card');
        await page
          .getByRole('button', { name: await label(page, 'undo') })
          .first()
          .click();
        expect((await cardCount(page)) === n, 'undo did not remove the copy');
        await page
          .getByRole('button', { name: await label(page, 'redo') })
          .first()
          .click();
        expect((await cardCount(page)) === n + 1, 'redo did not bring the copy back');
        await page
          .getByRole('button', { name: await label(page, 'undo') })
          .first()
          .click();
        expect((await cardCount(page)) === n, 'second undo failed');
      },
      page
    );

    await step(
      where,
      'disable a card and undo',
      async () => {
        const card = (await readCards(page)).find((c) => c.id === start[1].id);
        await clickCard(page, card);
        expect((await inPanel(page, (panel) => panel.selectedId)) === card.id, 'card not selected');
        // Its shortcut (⌘E / Ctrl+E), with the focus on the canvas like after a click.
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+e' : 'Control+e');
        await page
          .locator(`[data-node-id="${card.id}"].off`)
          .waitFor({ timeout: 2000 })
          .catch(() => {
            throw new Error('card not shown as disabled');
          });
        await page
          .getByRole('button', { name: await label(page, 'undo') })
          .first()
          .click();
        await page.waitForTimeout(300);
        expect(
          (await page.locator(`[data-node-id="${start[1].id}"].off`).count()) === 0,
          'undo did not enable the card again'
        );
      },
      page
    );

    await step(
      where,
      'tidy up and minimap',
      async () => {
        await page
          .getByRole('button', { name: await label(page, 'tidy') })
          .first()
          .click();
        await page.waitForTimeout(500);
        const after = await readCards(page);
        expect(
          after.length === n,
          `tidy changed the cards: ${start.map((c) => c.title).join(', ')} → ${after.map((c) => c.title).join(', ')}`
        );
        await page
          .getByRole('button', { name: await label(page, 'minimap') })
          .first()
          .click();
        await page.locator('flode-canvas .minimap').first().waitFor({ timeout: 3000 });
        await page
          .getByRole('button', { name: await label(page, 'minimap') })
          .first()
          .click();
      },
      page
    );

    await step(
      where,
      'open a branch card → HA editor with its place',
      async () => {
        const branch = (await readCards(page)).find((card) => card.id.includes('::'));
        expect(branch, 'no branch card');
        await clickCard(page, branch);
        await page
          .locator('flode-inspector ha-automation-action-editor')
          .first()
          .waitFor({ timeout: 8000 });
      },
      page
    );

    await step(
      where,
      "add a step through HA's dialog and save",
      async () => {
        // The flow's last card: "+" there appends (on a card with a next step it would start a parallel branch).
        const lastId = await inPanel(page, (panel) => {
          const { nodes, edges } = panel.flow.graph;
          return nodes.find(
            (node) => node.type !== 'trigger' && !edges.some((edge) => edge.source === node.id)
          )?.id;
        });
        const last = (await readCards(page)).find((card) => card.id === lastId);
        expect(last, 'no last card');
        await page.mouse.move(last.box.x + 40, last.box.y + 40);
        await page.locator(`[data-node-id="${last.id}"] .add-next`).first().click();
        const dialog = page.locator('add-automation-element-dialog');
        // "Stop" is valid without any input (a new delay is empty until a time is set, like in HA).
        const stop = await haLabel(
          page,
          'ui.panel.config.automation.editor.actions.type.stop.label'
        );
        await dialog.locator('input').first().fill(stop);
        await dialog.getByText(stop, { exact: true }).first().click();
        await page.waitForTimeout(800);
        expect((await cardCount(page)) === n + 1, 'no card added');
        await page.getByRole('button', { name: await label(page, 'save') }).click();
        await page.waitForTimeout(1500);
        const saved = await rest('GET', `config/automation/config/${scratch.id}`);
        expect(
          saved.actions?.at(-1) && 'stop' in saved.actions.at(-1),
          'HA did not store the added step at the end'
        );
      },
      page
    );

    await step(
      where,
      'runs view',
      async () => {
        await rest('POST', 'services/automation/trigger', {
          entity_id: (await inPanel(page, (panel) => panel.flow?.item?.entityId)) ?? '',
          skip_condition: true,
        });
        await page.waitForTimeout(1500);
        await palette(page, 'showRuns');
        await page.locator('flode-debug').first().waitFor({ timeout: 8000 });
      },
      page
    );

    for (const error of errors) result.fail(`${where}: ${error}`);
  } finally {
    await browser.close();
    await rest('DELETE', `config/automation/config/${scratch.id}`);
  }
}

async function phone(engine) {
  const where = `${engine} phone`;
  const { browser, page, errors } = await openBrowser(engine, {
    width: 390,
    height: 844,
    scale: 2,
  });
  try {
    await gotoPanel(page);
    await step(
      where,
      'open a flow on a phone',
      async () => {
        await openFlow(page, template.name);
        const cards = await readCards(page);
        expect(cards.length > 0, 'no cards');
        expect(
          cards.some((card) => card.box.x >= 0 && card.box.x < 390),
          'no card in view'
        );
      },
      page
    );
    for (const error of errors) result.fail(`${where}: ${error}`);
  } finally {
    await browser.close();
  }
}

async function whatsNew(engine) {
  const where = `${engine} what's new`;
  // Someone who last saw an older version.
  const { browser, page, errors, version } = await openBrowser(engine, { seen: '0.0.1' });
  try {
    await gotoPanel(page);
    await step(
      where,
      `sheet shows ${version}`,
      async () => {
        await page.locator('flode-welcome').getByText(version).first().waitFor({ timeout: 8000 });
      },
      page
    );
    for (const error of errors) result.fail(`${where}: ${error}`);
  } finally {
    await browser.close();
  }
}

await Promise.all(ENGINES.flatMap((engine) => [run(engine), phone(engine), whatsNew(engine)]));
result.finish();
