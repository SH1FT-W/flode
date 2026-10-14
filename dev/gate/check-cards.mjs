// Step "cards": opens every seeded automation in each browser like a user and
// checks what the canvas shows, with FLODE's card text and with HA's.
//   - no console or page errors while opening
//   - FLODE read the whole automation (no "parts not recognised" warning)
//   - every card has a title, none shows a code leftover ("undefined", "[object Object]", HA's describe error)
//   - with "Card text like Home Assistant", HA's text arrives and no card is left empty
import {
  closeFlow,
  ENGINES,
  gotoPanel,
  inPanel,
  label,
  openBrowser,
  openFlow,
  readCards,
  report,
  seededFlows,
} from './lib.mjs';

const BROKEN = /undefined|\[object Object\]|NaN|Error in describing/;
const flows = seededFlows();
const result = report('cards');

function checkTitles(cards, where) {
  if (cards.length === 0) result.fail(`${where}: no cards on the canvas`);
  for (const card of cards) {
    if (!card.title) result.fail(`${where}: card ${card.id} has no title`);
    if (BROKEN.test(`${card.type} ${card.title} ${card.detail}`))
      result.fail(`${where}: card ${card.id} shows "${card.title} | ${card.detail}"`);
    if (card.overflow) result.fail(`${where}: card ${card.id} text runs out of the card`);
  }
}

async function toggleCardText(page) {
  await page.getByRole('button', { name: await label(page, 'haCardText') }).click();
}

async function run(engine) {
  const { browser, page, errors } = await openBrowser(engine);
  try {
    await gotoPanel(page);
    for (const flow of flows) {
      const where = `${engine} · ${flow.name}`;
      errors.length = 0;
      try {
        await openFlow(page, flow.name);
      } catch (error) {
        result.fail(`${where}: could not open (${error.message.split('\n')[0]})`);
        await gotoPanel(page, { reload: true });
        continue;
      }
      try {
        const warnings = await inPanel(page, (panel) => panel.flow?.importWarnings ?? []);
        for (const warning of warnings) result.fail(`${where}: import warning "${warning}"`);
        const own = await readCards(page);
        checkTitles(own, `${where} [FLODE]`);

        await toggleCardText(page);
        let ha = own;
        for (let i = 0; i < 20; i++) {
          await page.waitForTimeout(150);
          ha = await readCards(page);
          if (ha.some((card, index) => card.title !== own[index]?.title)) break;
        }
        checkTitles(ha, `${where} [HA]`);
        if (own.length > 0 && ha.every((card, index) => card.title === own[index]?.title))
          result.fail(`${where} [HA]: no card got Home Assistant's text`);
        await toggleCardText(page);
        await closeFlow(page);
      } catch (error) {
        result.fail(`${where}: ${error.message.split('\n')[0]}`);
        await gotoPanel(page, { reload: true });
      }
      for (const error of errors) result.fail(`${where}: ${error}`);
    }
  } finally {
    await browser.close();
  }
}

const started = Date.now();
await Promise.all(ENGINES.map(run));
result.note(
  `${flows.length} automations × ${ENGINES.join(' + ')} in ${Math.round((Date.now() - started) / 1000)} s`
);
result.finish();
