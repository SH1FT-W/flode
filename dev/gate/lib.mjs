// Shared helpers for the release gate: test HA access, browsers, the FLODE panel.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { t } from '../../packages/frontend/src/strings.ts';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const HA_URL = process.env.FLODE_GATE_URL ?? 'http://localhost:8123';
/** Folder of the test HA (tools/ha-venv.sh) (holds `config/` and the access token file). */
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

/**
 * Waits until HA has an entity for each saved flow (`{ id, kind, name, config }`) and returns
 * the ones still missing. HA creates the entities a moment after the config is saved (longer
 * right after a restart). Sometimes HA's reload sometimes catches automations.yaml
 * mid-write and skips one — such an automation is saved again.
 */
export async function awaitEntities(flows) {
  let missing = flows;
  for (let round = 0; round < 3 && missing.length > 0; round++) {
    if (round > 0) {
      for (const flow of missing)
        await rest('POST', configRoute(flow), configBody(flow, flow.config));
    }
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const names = new Set(
        (await rest('GET', 'states')).map((state) => state.attributes.friendly_name)
      );
      missing = flows.filter((flow) => !names.has(flow.name));
      if (missing.length === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  return missing;
}

/** HA's config route of a seeded flow (`{ id, kind }`): automations and scripts live in different places. */
export function configRoute(flow) {
  return `config/${flow.kind ?? 'automation'}/config/${flow.id}`;
}

/** The body HA's config API takes for `flow`: an automation carries its id, a script must not. */
export function configBody(flow, config) {
  return flow.kind === 'script' ? config : { ...config, id: flow.id };
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
      // Controlled by HA's service worker from the start: then HA won't reload this page.
      const controlledAtStart = Boolean(navigator.serviceWorker?.controller);
      window.flodeGate = {
        controlledAtStart,
        panel: () => all(document, (el) => el.tagName === 'FLODE-PANEL')[0] ?? null,
        cards: () => all(document, (el) => el.classList?.contains('node') && el.dataset.nodeId),
      };
    },
    [token(), HA_URL, seen ?? version]
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  const recent = [];
  page.gateRecent = recent;
  page.on('websocket', (socket) => {
    socket.on('framereceived', (frame) => {
      const text = String(frame.payload);
      if (/state_changed|"c":|"a":|"type":"result"/.test(text)) return;
      recent.push(`ws: ${text.slice(0, 140)}`);
      if (recent.length > 4) recent.shift();
    });
    socket.on('close', () => recent.push('ws: closed'));
  });
  page.on('console', (message) => {
    recent.push(`${message.type()}: ${message.text().slice(0, 120)}`);
    if (recent.length > 4) recent.shift();
    if (message.type() !== 'error') return;
    const text = message.text();
    // Source maps of HA's own bundles (dev tools only) are never served.
    if (/Failed to load resource/.test(text) && /404/.test(text)) return;
    errors.push(`console: ${text.slice(0, 300)}`);
  });
  // A reload nobody asked for (after the first load) is a failure, with when it happened.
  page.gateLoads = 0;
  page.on('load', () => {
    page.gateLoads += 1;
    if (!page.gateNavigating)
      errors.push(
        `page reloaded unexpectedly (${page.url()}, ${((Date.now() - (page.gateReadyAt ?? 0)) / 1000).toFixed(1)} s after warm-up; before it: ${recent.join(' | ') || 'nothing in the console'})`
      );
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
  // HA reloads the page as soon as its service worker takes over (`controllerchange`,
  // 1–12 s after the first load). A page that was controlled from its start stays put.
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    const settled = await page
      .evaluate(() => document.readyState === 'complete' && window.flodeGate?.controlledAtStart)
      .catch(() => false);
    if (settled) break;
    await page.waitForTimeout(200);
  }
  page.gateNavigating = false;
  page.gateReadyAt = Date.now();
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

/** File name for a test's log: letters and digits of its name. */
function logName(name) {
  return name
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 100);
}

/**
 * Result bookkeeping for one step. Every check is one test with a status:
 * `ok`, `failed`, `flaky` (red once, green when run again on its own: listed, not red),
 * `new` / `changed` (pictures without a baseline / for a person to look at). A test that
 * is not ok gets its lines in `.gate/logs/<step>/<test>.log`. `finish` writes
 * `.gate/step-<step>.json` for gate.sh and sets the exit code; only `failed` makes it red.
 */
export function report(step) {
  const failures = [];
  const notes = [];
  const tests = [];
  const logDir = path.join(OUT_DIR, 'logs', step);
  fs.rmSync(logDir, { recursive: true, force: true });
  fs.mkdirSync(logDir, { recursive: true });
  const self = {
    fail(message) {
      failures.push(message);
      console.log(`  ✗ ${message}`);
    },
    failed() {
      return failures.length > 0;
    },
    note(message) {
      notes.push(message);
      console.log(`  · ${message}`);
    },
    /** Records one test; `lines` (what went wrong, or what to look at) go to its log. */
    test(name, status, lines = []) {
      const entry = { name, status };
      if (status !== 'ok' && lines.length > 0) {
        const file = path.join(logDir, `${logName(name)}.log`);
        fs.writeFileSync(file, `${name}\n${status}\n\n${lines.join('\n')}\n`);
        entry.log = path.relative(REPO, file);
      }
      tests.push(entry);
    },
    /**
     * Runs `fn` as one test: its `fail` calls and a thrown error are its failures. When it
     * failed and `retry` is given, `retry()` puts things back and `fn` runs once more on
     * its own — green then means `flaky` (listed, not red), red again means `failed`.
     * A flow that opened only on the second try counts as flaky too.
     */
    async check(name, fn, retry) {
      const attempt = async () => {
        const mark = failures.length;
        try {
          await fn();
        } catch (error) {
          self.fail(`${name}: ${error.message.split('\n')[0]}`);
        }
        return failures.splice(mark);
      };
      const opened = retries.length;
      const first = await attempt();
      if (first.length === 0) {
        if (retries.length > opened) self.test(name, 'flaky', ['opened only on the second try']);
        else self.test(name, 'ok');
        return;
      }
      if (retry) {
        await retry().catch(() => undefined);
        const second = await attempt();
        if (second.length === 0) {
          console.log(`  ~ ${name}: green on the second try (flaky)`);
          self.test(name, 'flaky', ['first try:', ...first]);
          return;
        }
        first.push('second try:', ...second);
      }
      failures.push(...first);
      self.test(name, 'failed', first);
    },
    finish(extra = {}) {
      if (retries.length > 0) this.note(`opened only on the second try: ${retries.join(', ')}`);
      const flaky = tests.filter((test) => test.status === 'flaky').map((test) => test.name);
      if (flaky.length > 0)
        this.note(`flaky (green on the second try, not red): ${flaky.join(', ')}`);
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(OUT_DIR, `step-${step}.json`),
        JSON.stringify(
          { step, ok: failures.length === 0, failures, notes, tests, flaky, ...extra },
          null,
          2
        )
      );
      console.log(failures.length === 0 ? `✓ ${step}` : `✗ ${step}: ${failures.length} failure(s)`);
      process.exitCode = failures.length === 0 ? 0 : 1;
    },
  };
  return self;
}
