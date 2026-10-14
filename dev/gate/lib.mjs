// Shared helpers for the release gate: test HA access, browsers, the FLODE panel.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { t } from '../../packages/frontend/src/strings.ts';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const HA_URL = process.env.FLODE_GATE_URL ?? 'http://localhost:8123';
/** Folder of the Docker test HA (holds `config/` and the access token file). */
export const TEST_DIR = path.resolve(
  process.env.FLODE_GATE_DIR ?? path.join(REPO, '../flode-test')
);
export const OUT_DIR = path.join(REPO, '.gate');
/** Everything the gate creates in HA starts with this, so it can clean up after itself. */
export const GATE_PREFIX = 'flode_gate_';

export function token() {
  if (process.env.FLODE_GATE_TOKEN) return process.env.FLODE_GATE_TOKEN;
  const file = process.env.FLODE_GATE_TOKEN_FILE ?? path.join(TEST_DIR, '.claude-token');
  return fs.readFileSync(file, 'utf8').trim();
}

export async function rest(method, route, body) {
  const response = await fetch(`${HA_URL}/api/${route}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

/** One WebSocket call (`{ type: ... }`) against the test HA. */
export async function ws(message) {
  const socket = new WebSocket(`${HA_URL.replace(/^http/, 'ws')}/api/websocket`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`ws ${message.type}: timeout`));
    }, 15000);
    socket.onerror = () => reject(new Error(`ws ${message.type}: connection failed`));
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'auth_required')
        socket.send(JSON.stringify({ type: 'auth', access_token: token() }));
      else if (data.type === 'auth_ok') socket.send(JSON.stringify({ id: 1, ...message }));
      else if (data.type === 'auth_invalid') reject(new Error('ws: token rejected'));
      else if (data.id === 1) {
        clearTimeout(timer);
        socket.close();
        if (data.success) resolve(data.result);
        else reject(new Error(`ws ${message.type}: ${data.error?.message}`));
      }
    };
  });
}

/** The automations the gate seeded (`seed.mjs` writes this list). */
export function seededFlows() {
  return JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'seeded.json'), 'utf8'));
}

const BROWSERS = { chromium, webkit };
export const ENGINES = (process.env.FLODE_GATE_ENGINES ?? 'chromium,webkit').split(',');

/** A browser page logged into the test HA, collecting console errors. */
export async function openBrowser(engine, { width = 1500, height = 900, scale = 1, seen } = {}) {
  const browser = await BROWSERS[engine].launch();
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
  });
  const version = JSON.parse(
    fs.readFileSync(path.join(REPO, 'packages/frontend/package.json'), 'utf8')
  ).version;
  await context.addInitScript(
    ([accessToken, url, seen]) => {
      localStorage.setItem(
        'hassTokens',
        JSON.stringify({
          hassUrl: url,
          clientId: null,
          expires: Date.now() + 1e10,
          refresh_token: '',
          access_token: accessToken,
          expires_in: 1e9,
          token_type: 'Bearer',
        })
      );
      // The "What's new" sheet has its own check; everywhere else it would cover the editor.
      if (seen && !localStorage.getItem('flode3.seenVersion'))
        localStorage.setItem('flode3.seenVersion', seen);
      // FLODE lives deep in HA's shadow roots: one place that finds its panel and cards.
      const all = (root, match, found = []) => {
        for (const el of root.querySelectorAll('*')) {
          if (match(el)) found.push(el);
          if (el.shadowRoot) all(el.shadowRoot, match, found);
        }
        return found;
      };
      window.flodeGate = {
        panel: () => all(document, (el) => el.tagName === 'FLODE-PANEL')[0] ?? null,
        cards: () => all(document, (el) => el.classList?.contains('node') && el.dataset.nodeId),
      };
    },
    [token(), HA_URL, seen ?? version]
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // Source maps of HA's own bundles (dev tools only) are never served.
    if (/Failed to load resource/.test(text) && /404/.test(text)) return;
    errors.push(`console: ${text.slice(0, 300)}`);
  });
  // A reload nobody asked for (after the first load) is a failure, with when it happened.
  let loads = 0;
  page.on('load', () => {
    loads += 1;
    if (loads > 1 && !page.gateNavigating)
      errors.push(`page reloaded unexpectedly (${page.url()})`);
  });
  await warmUp(page);
  return { browser, context, page, errors, version };
}

/** FLODE's own UI label for the panel's language. */
export async function label(page, key) {
  return t(await inPanel(page, (panel) => panel.hass?.language ?? 'en'), key);
}

/** One of Home Assistant's own UI texts (`hass.localize`), e.g. a block's name in its add dialog. */
export function haLabel(page, key) {
  return inPanel(page, (panel, k) => panel.hass.localize(k), key);
}

/** Runs `fn(panel, arg)` inside the page with FLODE's panel element. */
export async function inPanel(page, fn, arg) {
  const panel = await page.evaluateHandle(() => window.flodeGate.panel());
  try {
    if (!(await panel.evaluate((el) => el !== null))) throw new Error('FLODE panel not found');
    return await panel.evaluate(fn, arg);
  } finally {
    await panel.dispose();
  }
}

/** Waits until `fn(panel, arg)` is true inside the page. */
export async function waitForPanel(page, fn, arg, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await inPanel(page, fn, arg).catch(() => false)) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`timeout waiting for ${fn.toString().slice(0, 80)}`);
}

/**
 * A fresh browser installs HA's service worker on the first visit, and HA then
 * reloads the page once. That happens here, before any check watches the page.
 */
async function warmUp(page) {
  page.gateNavigating = true;
  await page.goto(`${HA_URL}/flode`);
  await page
    .waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 })
    .catch(() => undefined);
  await page.waitForLoadState('load');
  await page.waitForTimeout(500);
  page.gateNavigating = false;
}

/** FLODE's panel, ready. Loads it only if the page isn't on it (a reload cuts off HA's downloads). */
export async function gotoPanel(page, { reload = false } = {}) {
  if (reload || new URL(page.url()).pathname !== '/flode') {
    page.gateNavigating = true;
    await page.goto(`${HA_URL}/flode`);
    page.gateNavigating = false;
  }
  await waitForPanel(page, (panel) => panel.hass && panel.haList !== null, undefined, 30000);
}

/** Opens a flow by its name through FLODE's command palette (⌘K), like a user would. */
export async function openFlow(page, name) {
  try {
    await openFlowOnce(page, name);
  } catch {
    // One more go (WebKit sometimes misses ⌘K right after a tab closed); a second miss is a failure.
    retries.push(name);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await openFlowOnce(page, name);
  }
}

/** Flows that only opened on the second try — reported, so a pattern shows up. */
export const retries = [];

async function openFlowOnce(page, name) {
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  const palette = page.locator('flode-palette');
  const input = palette.locator('input');
  await input.waitFor({ timeout: 3000 });
  await input.fill(name);
  // Enter takes the first entry — only once the list shows this flow.
  await palette.getByText(name, { exact: true }).first().waitFor({ timeout: 5000 });
  await input.press('Enter');
  await waitForPanel(
    page,
    (panel, alias) => !panel.showHome && panel.flow?.item?.name === alias,
    name,
    20000
  ).catch(() => {
    throw new Error(`could not open "${name}"`);
  });
  await page.waitForTimeout(600);
}

/** Closes the open flow's tab (its × in the tab bar), so tabs don't pile up over a long check. */
export async function closeFlow(page) {
  const close = page.getByRole('button', { name: await label(page, 'closeTab') });
  if ((await close.count()) === 0) return;
  await close.first().click();
  await waitForPanel(
    page,
    (panel) => panel.tabs.length === 0 || panel.showHome,
    undefined,
    5000
  ).catch(() => undefined);
}

/** What every card on the canvas shows: eyebrow, title, detail (and whether it's marked faulty). */
export function readCards(page) {
  return page.evaluate(() => {
    const cards = window.flodeGate.cards();
    const text = (el, selector) =>
      el.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    return cards.map((el) => {
      const box = el.getBoundingClientRect();
      const title = el.querySelector('.title');
      return {
        id: el.dataset.nodeId,
        type: text(el, '.type'),
        title: text(el, '.title'),
        detail: text(el, '.detail'),
        faulty: el.classList.contains('faulty'),
        // Text running out of its card (wider than the card, or below its bottom edge).
        overflow: title ? title.getBoundingClientRect().right > box.right + 1 : false,
        box: { x: box.x, y: box.y, width: box.width, height: box.height },
      };
    });
  });
}

/** Result bookkeeping: each check adds lines; `finish` writes them and sets the exit code. */
export function report(step) {
  const failures = [];
  const notes = [];
  return {
    fail(message) {
      failures.push(message);
      console.log(`  ✗ ${message}`);
    },
    note(message) {
      notes.push(message);
      console.log(`  · ${message}`);
    },
    finish(extra = {}) {
      if (retries.length > 0) this.note(`opened only on the second try: ${retries.join(', ')}`);
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(OUT_DIR, `step-${step}.json`),
        JSON.stringify({ step, ok: failures.length === 0, failures, notes, ...extra }, null, 2)
      );
      console.log(failures.length === 0 ? `✓ ${step}` : `✗ ${step}: ${failures.length} failure(s)`);
      process.exitCode = failures.length === 0 ? 0 : 1;
    },
  };
}
