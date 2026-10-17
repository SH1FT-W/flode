// Step "visual": screenshots of a few typical automations (both browsers, both card
// texts) compared with the screenshots of the last release's green gate.
// Differences don't fail the gate: they are put side by side in
// .gate/visual/report.html for a person to look at.
//   node dev/gate/check-visual.mjs            compare with the newest baseline
//   node dev/gate/check-visual.mjs --baseline  store these screenshots as the baseline (after a release)
import fs from 'node:fs';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import {
  ENGINES,
  gotoPanel,
  label,
  OUT_DIR,
  openBrowser,
  openFlow,
  readCards,
  report,
  seededFlows,
} from './lib.mjs';

/**
 * Covers the card kinds: triggers/conditions/delays, a choose with branches, templates,
 * targets, an or in the middle of a flow, parallel with conditions, a script's start card.
 */
const SHOTS = [
  'card_text',
  '04_choose_with_default',
  '09_templates',
  '05_delays_and_waits',
  '38_target_mixed',
  'or_mid_flow',
  'parallel_with_conditions',
  'script_with_fields',
];
const VISUAL_DIR = path.join(OUT_DIR, 'visual');
const BASELINE_DIR = path.join(VISUAL_DIR, 'baseline');
const CURRENT_DIR = path.join(VISUAL_DIR, 'current');
/** Share of pixels that may differ (anti-aliasing) before a picture counts as changed. */
const TOLERANCE = 0.002;

const result = report('visual');
const makeBaseline = process.argv.includes('--baseline');
const flows = seededFlows().filter((flow) => SHOTS.some((name) => flow.id.endsWith(name)));

/** Everything the cards cover, plus a margin — the canvas around them is just dots. */
async function cardsClip(page) {
  const boxes = (await readCards(page)).map((card) => card.box);
  if (boxes.length === 0) return undefined;
  const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - 24);
  const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - 32);
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x + 24,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y + 24,
  };
}

async function shoot(engine) {
  const { browser, page, errors } = await openBrowser(engine, {
    width: 2200,
    height: 1000,
    scale: 2,
  });
  const files = [];
  try {
    await gotoPanel(page);
    for (const flow of flows) {
      await openFlow(page, flow.name);
      for (const mode of ['flode', 'ha']) {
        if (mode === 'ha') {
          await page.getByRole('button', { name: await label(page, 'haCardText') }).click();
          await page.waitForTimeout(1500);
        }
        const file = `${flow.id.replace(/^flode_gate_/, '')}-${engine}-${mode}.png`;
        const clip = await cardsClip(page);
        // No cards = not a picture of FLODE (e.g. HA's loading screen) — never compare or keep it.
        if (!clip) {
          result.fail(`${engine} · ${flow.name} [${mode}]: no cards to photograph`);
          continue;
        }
        await page.screenshot({ path: path.join(CURRENT_DIR, file), clip });
        files.push(file);
      }
      await page.getByRole('button', { name: await label(page, 'haCardText') }).click();
    }
    for (const error of errors) result.fail(`${engine}: ${error}`);
  } finally {
    await browser.close();
  }
  return files;
}

function compare(file) {
  const baseline = path.join(BASELINE_DIR, file);
  if (!fs.existsSync(baseline)) return { file, status: 'new' };
  const a = PNG.sync.read(fs.readFileSync(baseline));
  const b = PNG.sync.read(fs.readFileSync(path.join(CURRENT_DIR, file)));
  if (a.width !== b.width || a.height !== b.height) return { file, status: 'changed', share: 1 };
  const diff = new PNG({ width: a.width, height: a.height });
  const pixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
  const share = pixels / (a.width * a.height);
  if (share <= TOLERANCE) return { file, status: 'same', share };
  fs.writeFileSync(path.join(VISUAL_DIR, `diff-${file}`), PNG.sync.write(diff));
  return { file, status: 'changed', share };
}

function writeReport(rows, baselineInfo) {
  const changed = rows.filter((row) => row.status !== 'same');
  const figure = (row) => `
    <section>
      <h2>${row.file} · ${row.status === 'new' ? 'new (no baseline)' : `${(row.share * 100).toFixed(2)} % changed`}</h2>
      <div class="pair">
        ${row.status === 'new' ? '' : `<figure><figcaption>Baseline</figcaption><img src="baseline/${row.file}"></figure>`}
        <figure><figcaption>Now</figcaption><img src="current/${row.file}"></figure>
        ${row.status === 'changed' && fs.existsSync(path.join(VISUAL_DIR, `diff-${row.file}`)) ? `<figure><figcaption>Difference</figcaption><img src="diff-${row.file}"></figure>` : ''}
      </div>
    </section>`;
  fs.writeFileSync(
    path.join(VISUAL_DIR, 'report.html'),
    `<!doctype html><meta charset="utf-8"><title>FLODE gate · visual</title>
<style>body{background:#111;color:#eee;font:15px -apple-system,sans-serif;margin:24px}h1{font-size:20px}h2{font-size:15px;margin:28px 0 8px}
.pair{display:flex;flex-direction:column;gap:8px}figure{margin:0}figcaption{color:#999;font-size:12px;margin-bottom:4px}img{max-width:100%;border:1px solid #333}</style>
<h1>Visual check: ${changed.length} of ${rows.length} pictures differ from ${baselineInfo}</h1>
${changed.length === 0 ? '<p>Nothing changed.</p>' : changed.map(figure).join('')}`
  );
}

fs.rmSync(CURRENT_DIR, { recursive: true, force: true });
fs.mkdirSync(CURRENT_DIR, { recursive: true });
for (const file of fs.readdirSync(VISUAL_DIR).filter((name) => name.startsWith('diff-')))
  fs.rmSync(path.join(VISUAL_DIR, file));
const files = (await Promise.all(ENGINES.map(shoot))).flat();

if (makeBaseline && result.failed()) {
  result.note('baseline NOT stored: the pictures are not reliable');
  result.finish();
} else if (makeBaseline) {
  fs.rmSync(BASELINE_DIR, { recursive: true, force: true });
  fs.cpSync(CURRENT_DIR, BASELINE_DIR, { recursive: true });
  const version = JSON.parse(
    fs.readFileSync(path.join(OUT_DIR, '../packages/frontend/package.json'), 'utf8')
  ).version;
  fs.writeFileSync(path.join(BASELINE_DIR, 'version.txt'), `${version}\n`);
  for (const file of files) result.test(file, 'ok');
  result.note(`baseline stored: ${files.length} pictures for ${version}`);
  result.finish();
} else {
  const versionFile = path.join(BASELINE_DIR, 'version.txt');
  const baselineInfo = fs.existsSync(versionFile)
    ? `the baseline of ${fs.readFileSync(versionFile, 'utf8').trim()}`
    : 'no baseline yet';
  const rows = files.map(compare);
  writeReport(rows, baselineInfo);
  for (const row of rows) {
    if (row.status === 'same') result.test(row.file, 'ok');
    else if (row.status === 'new')
      result.test(row.file, 'new', [
        'no baseline yet; stored with --baseline after the next release',
      ]);
    else
      result.test(row.file, 'changed', [
        `${(row.share * 100).toFixed(2)} % of the pixels differ — look at .gate/visual/report.html`,
      ]);
  }
  const fresh = rows.filter((row) => row.status === 'new');
  const changed = rows.filter((row) => row.status === 'changed');
  if (fresh.length > 0)
    result.note(
      `${fresh.length} new picture(s) without a baseline yet: ${fresh.map((row) => row.file).join(', ')}`
    );
  result.note(
    changed.length === 0
      ? `${rows.length - fresh.length} pictures as in ${baselineInfo}`
      : `${changed.length} of ${rows.length} pictures differ from ${baselineInfo} — look at .gate/visual/report.html`
  );
  // Differences are for a person to judge, never a failure on their own.
  result.finish({ review: changed.map((row) => row.file) });
}
