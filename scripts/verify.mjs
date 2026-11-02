import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = join(root, 'docs/screenshots');
mkdirSync(out, { recursive: true });
let node20 = process.execPath;
if (!process.version.startsWith('v20.')) {
  const cache = join(root, 'work/npm-cache/_npx');
  node20 = existsSync(cache)
    ? readdirSync(cache)
        .map((dir) => join(cache, dir, 'node_modules/node/bin/node'))
        .find(existsSync)
    : undefined;
  if (!node20) throw new Error('Run verification with Node 20.');
}
const port = Number(process.env.VERIFY_PORT || 3000),
  base = `http://localhost:${port}`;
const server = spawn(
  node20,
  ['--import', 'tsx', 'server/replay.ts', '--offline', '--manual', '--speed=1000'],
  {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let output = '';
server.stdout.on('data', (data) => {
  output += data;
});
server.stderr.on('data', (data) => {
  output += data;
});
const checks = [],
  errors = [];
const record = (name, details = '') => {
  checks.push({ name, status: 'passed', details });
  console.log(`passed: ${name}`);
};
async function until(fn, ms = 15_000) {
  const end = Date.now() + ms;
  while (true) {
    try {
      if (await fn()) return;
    } catch {}
    if (Date.now() > end) throw new Error('Wait timed out. ' + output.slice(-600));
    await new Promise((r) => setTimeout(r, 50));
  }
}
let browser;
try {
  await until(async () => {
    const desk = await (await fetch(`${base}/api/desk`)).json();
    return desk.stats.processed >= 20 && output.includes('Replay complete.');
  });
  const desk = await (await fetch(`${base}/api/desk`)).json();
  assert(desk.feed.length >= 20);
  for (const kind of ['vault', 'hint', 'pending']) assert(desk.feed.some((row) => row.kind === kind));
  record(
    'offline replay has at least 20 messages and every caught row type',
    `${desk.stats.processed} processed`,
  );
  const localBrowsers = join(root, 'work/browsers');
  if (existsSync(localBrowsers)) process.env.PLAYWRIGHT_BROWSERS_PATH = localBrowsers;
  const folder = existsSync(localBrowsers)
    ? readdirSync(localBrowsers).find((name) => name.startsWith('chromium_headless_shell-'))
    : undefined;
  const localShell = folder
    ? join(localBrowsers, folder, 'chrome-headless-shell-mac-arm64/chrome-headless-shell')
    : undefined;
  browser = await chromium.launch({
    ...(localShell && existsSync(localShell) ? { executablePath: localShell } : {}),
    args: ['--single-process', '--in-process-gpu', '--disable-gpu', '--disable-crashpad-for-testing'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/game/`);
  await page.getByRole('button', { name: 'Read the tide ledger' }).click();
  await page.getByRole('button', { name: '17:40' }).click();
  await page.getByRole('status').filter({ hasText: 'shallower' }).waitFor();
  assert.equal((await (await fetch(`${base}/api/status`)).json()).currentBeat, 'b2');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(out, 'game.png') });
  record('game puzzle 2 rejects a wrong answer and stays at the same beat');
  await page.getByRole('button', { name: '18:20' }).click();
  await page.getByRole('heading', { name: 'The disused quay' }).waitFor();
  record('game puzzle 2 accepts the correct answer and posts progress');
  await page.goto(`${base}/dashboard/`);
  await page.waitForFunction(() => Number(document.getElementById('processed').textContent) >= 20);
  await page.evaluate(() => document.fonts.ready);
  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    const layout = await page.evaluate(() => {
      const $ = (selector) => document.querySelector(selector),
        css = (selector) => getComputedStyle($(selector));
      const rect = (selector) => {
        const r = $(selector).getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right };
      };
      const chat = $('#chat');
      chat.scrollTop = chat.scrollHeight;
      return {
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        header: rect('.topbar'),
        side: rect('.side-panels'),
        font: css('body').fontFamily,
        size: css('body').fontSize,
        line: css('body').lineHeight,
        rows: chat.querySelectorAll('.chat-row').length,
        types: ['vault', 'hint', 'pending'].map((kind) => !!chat.querySelector(`.${kind}`)),
        future: [...document.querySelectorAll('.stepper .future')].map((el) => el.textContent.trim()),
        buttons: ['#next', '#release'].map((selector) => {
          const el = $(selector),
            r = el.getBoundingClientRect(),
            panel = el.closest('.panel').getBoundingClientRect();
          return r.top >= panel.top && r.bottom <= panel.bottom;
        }),
        leaks: document.body.textContent.includes('Mara is the captain of Orison.'),
        tokens: Object.fromEntries(
          ['bg', 'surface', 'surface-2', 'line', 'text', 'muted', 'seal', 'hint', 'ok'].map((k) => [
            k,
            getComputedStyle(document.documentElement)
              .getPropertyValue('--' + k)
              .trim().toUpperCase(),
          ]),
        ),
      };
    });
    assert.equal(layout.scrollWidth, width);
    assert.equal(layout.header.height, 56);
    assert.equal(layout.side.width, 380);
    assert.equal(layout.size, '15px');
    assert(Math.abs(parseFloat(layout.line) - 21.75) < 0.1);
    assert(layout.font.includes('IBM Plex Sans'));
    assert(layout.rows >= 20 && layout.types.every(Boolean));
    assert(layout.buttons.every(Boolean), 'A control is clipped');
    assert(!layout.leaks);
    assert(layout.future.every((text) => /^\d+Beat \d+$/.test(text)));
    const expected = {
      bg: '#0E0F11',
      surface: '#16181C',
      'surface-2': '#1E2126',
      line: '#2A2E35',
      text: '#E8E6E1',
      muted: '#8B8F98',
      seal: '#E5484D',
      hint: '#F5A524',
      ok: '#3DD68C',
    };
    assert.deepEqual(layout.tokens, expected);
    await page.locator('.past-tag').last().waitFor({ state: 'visible' });
    await page.screenshot({ path: join(out, `dashboard-${width}.png`) });
    record(
      `dashboard ${width}x${height}: dimensions, fonts, tokens, redaction, future steps and row types`,
      JSON.stringify(layout),
    );
  }
  await page.locator('#chat').evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.locator('#jump').waitFor({ state: 'visible' });
  await page.waitForTimeout(900);
  assert.equal(await page.locator('#chat').evaluate((el) => el.scrollTop), 0);
  await page.locator('#jump').click();
  await page.locator('#jump').waitFor({ state: 'hidden' });
  record('chat respects scroll position and Jump to latest restores following');
  const before = (await (await fetch(`${base}/api/desk`)).json()).jarCount;
  await page.keyboard.press('h');
  await until(async () => (await (await fetch(`${base}/api/desk`)).json()).jarCount === before - 1);
  await page.waitForFunction(() => document.getElementById('latest-hint').textContent === '@owen: Read the times on the ledger.');
  record('H releases one hint and renders its text');
  await page.keyboard.press('n');
  await page.waitForFunction(() => document.getElementById('beat-number').textContent === 'Beat 4 of 6');
  record('N advances exactly one beat');
  await page.goto(`${base}/game/`);
  await page.getByRole('button', { name: 'Return to harbor' }).click();
  await page.getByRole('status').filter({ hasText: 'three marks' }).waitFor();
  assert.equal((await (await fetch(`${base}/api/status`)).json()).currentBeat, 'b4');
  await page.getByRole('button', { name: 'Inner cove' }).click();
  await page.getByRole('heading', { name: 'The second signature' }).waitFor();
  await page.getByRole('button', { name: 'Send the clear channel signal' }).click();
  await page.getByRole('heading', { name: 'The answering light' }).waitFor();
  record('puzzle 4, twist at beat 5 and the ending work');
  await page.setViewportSize({ width: 1920, height: 1080 });
  const checker =
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><path fill="#24272c" d="M0 0h48v48H0z"/><path fill="#1a1c20" d="M0 0h24v24H0zm24 24h24v24H24z"/></svg>';
  for (const scene of ['reveal', 'hint', 'toast', 'leaderboard']) {
    await page.goto(`${base}/overlay/?demo=1&scene=${scene}`);
    assert.equal(
      await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
      'rgba(0, 0, 0, 0)',
    );
    await page.addStyleTag({
      content: `body { background-image:url("data:image/svg+xml,${encodeURIComponent(checker)}"); }`,
    });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForSelector(`#${scene}:visible`);
    if (scene === 'reveal')
      await page.waitForFunction(() => document.getElementById('reveal-text').textContent.endsWith('safe.'));
    else await page.waitForTimeout(300);
    const rect = await page.locator('#' + scene).boundingBox();
    if (scene === 'reveal') {
      assert.equal(rect.width, 1824);
      assert.equal(rect.height, 260);
      assert.equal(rect.x, 48);
      await page.locator('#first-call').waitFor({ state: 'visible' });
    }
    if (scene === 'hint') {
      assert.equal(rect.width, 520);
      assert.equal(rect.x, 48);
    }
    if (scene === 'toast') {
      assert.equal(rect.width, 420);
      assert.equal(1920 - rect.x - rect.width, 48);
    }
    await page.screenshot({ path: join(out, `overlay-${scene}.png`), omitBackground: true });
    record(`overlay ${scene}: transparent canvas, safe margins, required size and content`);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${base}/overlay/?demo=1&scene=toast`);
  await page.waitForSelector('#toast:visible');
  assert.equal(await page.locator('#toast').evaluate((el) => getComputedStyle(el).animationName), 'fade-in');
  record('reduced motion replaces the toast slide with a fade');
  const motion = await context.newPage();
  motion.on('pageerror', (error) => errors.push(error.message));
  await motion.addInitScript(() => {
    window.WebSocket = class {
      constructor() {
        window.testSocket = this;
      }
    };
  });
  await motion.goto(`${base}/overlay/`);
  await motion.waitForFunction(() => typeof window.testSocket?.onmessage === 'function');
  const send = (data) =>
    motion.evaluate((data) => window.testSocket.onmessage({ data: JSON.stringify(data) }), data);
  await send({ type: 'status', currentBeat: 'b5', vaultCount: 3, jarCount: 2 });
  assert.equal(
    await motion.locator('#sealed-count').evaluate((el) => getComputedStyle(el).animationDuration),
    '0.15s',
  );
  await send({ type: 'sealed', user: 'first', beatId: 'b5', at: new Date().toISOString() });
  await motion.locator('#toast:visible').waitFor();
  assert.equal(
    await motion.locator('#toast').evaluate((el) => getComputedStyle(el).animationDuration),
    '0.22s',
  );
  const toastStart = Date.now();
  await send({ type: 'sealed', user: 'second', beatId: 'b5', at: new Date().toISOString() });
  await motion.waitForFunction(() =>
    document.getElementById('toast-title').textContent.startsWith('@second'),
  );
  const toastTime = Date.now() - toastStart;
  assert(toastTime >= 3400 && toastTime < 4400, `queued toast changed at ${toastTime}ms`);
  assert.equal(await motion.locator('#toast:visible').count(), 1);
  record(
    'seal toasts queue one at a time, stay 3.5 seconds, and use a 220ms slide',
    `${toastTime}ms until next toast`,
  );
  await send({ type: 'hint', user: 'nell', text: 'Read the code card.', level: 2 });
  const hintStart = Date.now();
  await motion.locator('#hint').waitFor({ state: 'hidden', timeout: 9000 });
  const hintTime = Date.now() - hintStart;
  assert(hintTime >= 7900 && hintTime < 9000);
  record('hint stays for eight seconds', `${hintTime}ms including exit fade`);
  await send({ type: 'leaderboard', entries: [{ user: 'first', points: 4 }] });
  await send({
    type: 'reveal',
    beatId: 'b5',
    items: [
      { user: 'first', text: 'A held prediction.', sealedAt: new Date(Date.now() - 60000).toISOString() },
    ],
  });
  await motion.locator('#reveal:visible').waitFor();
  const revealStart = Date.now();
  assert.equal(
    await motion.locator('.seal-half.left').evaluate((el) => getComputedStyle(el).animationDuration),
    '0.5s',
  );
  await motion.locator('#leaderboard:visible').waitFor({ timeout: 6500 });
  const revealTime = Date.now() - revealStart;
  assert(revealTime >= 4900 && revealTime < 6000);
  const boardStart = Date.now();
  await motion.locator('#leaderboard').waitFor({ state: 'hidden', timeout: 7000 });
  const boardTime = Date.now() - boardStart;
  assert(boardTime >= 5900 && boardTime < 7000);
  record(
    'reveal items last five seconds, crack for 500ms, then show the leaderboard for six seconds',
    `${revealTime}ms reveal; ${boardTime}ms board`,
  );
  await send({
    type: 'reveal',
    beatId: 'b5',
    items: Array.from({ length: 7 }, (_, i) => ({
      user: `caller${i + 1}`,
      text: `prediction ${i + 1}`,
      sealedAt: new Date().toISOString(),
    })),
  });
  await motion.locator('#more').waitFor({ state: 'visible', timeout: 29_000 });
  assert.equal(await motion.locator('#more').textContent(), '+2 more in the vault log');
  assert.equal(await motion.locator('#reveal-text').textContent(), 'prediction 5');
  record('a reveal shows at most five items and then the remaining count');
  await motion.close();
  assert.deepEqual(errors, []);
  record('no browser JavaScript errors');
  writeFileSync(
    join(out, 'verification.json'),
    JSON.stringify({ status: 'passed', checks, browser: await browser.version(), date: new Date().toISOString() }, null, 2) +
      '\n',
  );
} catch (error) {
  writeFileSync(join(out, 'verification.json'), JSON.stringify({ status: 'failed', error: error.message, checks }, null, 2) + '\n');
  throw error;
} finally {
  writeFileSync(join(root, 'work/verify-replay.log'), output);
  if (browser) await browser.close();
  server.kill('SIGINT');
}
