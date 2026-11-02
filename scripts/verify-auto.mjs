import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url))),
  out = join(root, 'docs/screenshots');
const child = spawn(
  process.execPath,
  ['--import', 'tsx', 'server/replay.ts', '--offline', '--auto', '--speed=4'],
  { cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] },
);
let output = '',
  browser;
child.stdout.on('data', (chunk) => {
  output += chunk;
});
child.stderr.on('data', (chunk) => {
  output += chunk;
});
async function until(check, ms = 15000) {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) throw new Error('Automatic replay timed out: ' + output.slice(-600));
    await new Promise((r) => setTimeout(r, 50));
  }
}
try {
  await until(() => /http:\/\/localhost:\d+\/dashboard/.test(output));
  const base = output.match(/http:\/\/localhost:\d+/)[0];
  const folder = readdirSync(join(root, 'work/browsers')).find((name) =>
    name.startsWith('chromium_headless_shell-'),
  );
  browser = await chromium.launch({
    executablePath: join(
      root,
      'work/browsers',
      folder,
      'chrome-headless-shell-mac-arm64/chrome-headless-shell',
    ),
    args: ['--single-process', '--in-process-gpu', '--disable-gpu', '--disable-crashpad-for-testing'],
  });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } }),
    page = await context.newPage(),
    events = [],
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('websocket', (socket) =>
    socket.on('framereceived', (frame) => events.push(JSON.parse(String(frame.payload)))),
  );
  await page.goto(base + '/overlay/');
  const checker =
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><path fill="#24272c" d="M0 0h48v48H0z"/><path fill="#1a1c20" d="M0 0h24v24H0zm24 24h24v24H24z"/></svg>';
  await page.addStyleTag({
    content: `body { background-image:url("data:image/svg+xml,${encodeURIComponent(checker)}"); }`,
  });
  await page.waitForFunction(
    () => document.getElementById('reveal-text').textContent === 'The first safe crossing is at 18:20.',
    {},
    { timeout: 20000 },
  );
  await page.locator('#first-call').waitFor({ state: 'visible' });
  await page.screenshot({ path: join(out, 'overlay-auto-reveal.png') });
  await until(async () => (await (await fetch(base + '/api/status')).json()).currentBeat === 'b6', 35000);
  await until(() => output.includes('Replay complete.'));
  const dashboard = await context.newPage();
  await dashboard.setViewportSize({ width: 1440, height: 900 });
  await dashboard.goto(base + '/dashboard/');
  await dashboard.waitForFunction(() => document.getElementById('beat-number').textContent === 'Beat 6 of 6');
  await dashboard.evaluate(() => document.fonts.ready);
  assert.equal(await dashboard.locator('#vault-count').textContent(), '0');
  await dashboard.screenshot({ path: join(out, 'dashboard-auto.png') });
  await page.locator('#leaderboard:visible').waitFor({ timeout: 65000 });
  assert.match(await page.locator('#leaders').innerText(), /moss[\s\S]*8/);
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(out, 'overlay-auto-leaderboard.png') });
  const counts = events.filter((e) => e.type === 'status').map((e) => e.vaultCount);
  assert(counts.some((n, i) => i > 0 && n < counts[i - 1]));
  assert.deepEqual(
    [...new Set(events.filter((e) => e.type === 'reveal').map((e) => e.beatId))],
    ['b2', 'b3', 'b4', 'b5', 'b6'],
  );
  assert(events.some((e) => e.type === 'leaderboard' && e.entries.some((e) => e.points > 0)));
  assert.deepEqual(errors, []);
  writeFileSync(
    join(out, 'auto-verification.json'),
    JSON.stringify(
      {
        status: 'passed',
        reveals: events.filter((e) => e.type === 'reveal').map((e) => e.beatId),
        vaultCounts: counts,
        leaderboard: events.filter((e) => e.type === 'leaderboard').at(-1).entries,
        browser: await browser.version(),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'Automatic replay: five real reveal events, vault count drops, awarded points, overlay reveal and leaderboard verified.',
  );
} finally {
  writeFileSync(join(root, 'work/verify-auto.log'), output);
  if (browser) await browser.close();
  child.kill('SIGINT');
}
