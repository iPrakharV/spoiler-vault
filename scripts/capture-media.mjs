import { spawn } from 'node:child_process';
import { writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
const root = process.cwd(),
  media = join(root, 'docs/media');
process.env.PLAYWRIGHT_BROWSERS_PATH = join(root, 'work/browsers');
const { chromium } = await import('playwright');
mkdirSync(join(root, 'work/media-recordings'), { recursive: true });
const child = spawn(process.execPath, ['--import', 'tsx', 'server/replay.ts', '--offline', '--auto'], {
  cwd: root,
  env: { ...process.env, PORT: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '',
  browser,
  videoContext;
child.stdout.on('data', (data) => {
  output += data;
});
child.stderr.on('data', (data) => {
  output += data;
});
const checks = [],
  check = (name) => {
    checks.push(name);
    console.log(name);
  };
async function until(fn, ms = 15000) {
  const end = Date.now() + ms;
  while (!(await fn())) {
    if (Date.now() > end) throw new Error('Capture timed out: ' + output.slice(-400));
    await new Promise((r) => setTimeout(r, 50));
  }
}
const checker =
  '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><path fill="#24272c" d="M0 0h48v48H0z"/><path fill="#1a1c20" d="M0 0h24v24H0zm24 24h24v24H24z"/></svg>';
async function background(page) {
  await page.addStyleTag({
    content: `body { background-image:url("data:image/svg+xml,${encodeURIComponent(checker)}"); }`,
  });
}
try {
  await until(() => /http:\/\/localhost:\d+/.test(output));
  const base = output.match(/http:\/\/localhost:\d+/)[0];
  const folder = readdirSync(join(root, 'work/browsers')).find((n) =>
    n.startsWith('chromium_headless_shell-'),
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
  // One context avoids the single-process browser's multiple-context limit.
  videoContext = await browser.newContext({
    viewport: { width: 1440, height: 810 },
    deviceScaleFactor: 2,
    recordVideo: { dir: join(root, 'work/media-recordings'), size: { width: 1200, height: 675 } },
  });
  const videoPage = await videoContext.newPage(),
    videoStart = Date.now(),
    marks = {};
  const elapsed = () => (Date.now() - videoStart) / 1000;
  await videoPage.goto(base + '/dashboard/');
  await videoPage.evaluate(() => document.fonts.ready);
  await videoPage.waitForFunction(() => Number(document.getElementById('processed').textContent) >= 8);
  marks.catchStart = elapsed();
  await videoPage.waitForFunction(() => Number(document.getElementById('vault-count').textContent) >= 3);
  await videoPage.waitForTimeout(500);
  marks.catchEnd = elapsed();
  check('Recorded the dashboard catching real replay spoilers.');
  await videoPage.goto(base + '/overlay/');
  await videoPage.evaluate(() => {
    const game = document.createElement('iframe');
    game.src = '/game/';
    game.title = 'The Orison file';
    game.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:0';
    document.body.prepend(game);
    document.getElementById('overlay').style.zIndex = '1';
  });
  await videoPage.evaluate(() => document.fonts.ready);
  const hintCapture = (async () => {
    await videoPage.waitForSelector('#hint:visible', { timeout: 20000 });
    // The same viewport is recaptured at 2x in a dedicated CSS-sized page below.
    check('Observed a real hint release.');
  })();
  await videoPage.waitForFunction(
    () =>
      document.getElementById('reveal-beat').textContent === 'beat 3' &&
      !document.getElementById('reveal').hidden,
    {},
    { timeout: 45000 },
  );
  marks.revealStart = elapsed();
  await videoPage.waitForFunction(
    () => document.getElementById('reveal-text').textContent === 'The bell is at the disused quay.',
  );
  await videoPage.locator('#first-call').waitFor({ state: 'visible' });
  await videoPage.locator('#leaderboard:visible').waitFor({ timeout: 10000 });
  marks.revealEnd = elapsed();
  await videoPage.waitForTimeout(220);
  marks.boardStart = elapsed();
  await videoPage.waitForTimeout(2600);
  marks.boardEnd = elapsed();
  await hintCapture;
  const video = videoPage.video();
  await videoPage.close();
  const rawVideo = await video.path();
  check('Recorded the seal crack, typed reveal and awarded leaderboard.');
  // Screenshots use a separate 2x context once the recording is saved.
  const page = await videoContext.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base + '/dashboard/');
  await page.waitForFunction(() => Number(document.getElementById('processed').textContent) >= 20);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(media, 'dashboard.png') });
  await page.goto(base + '/game/');
  await page.locator('#body p').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(media, 'game.png') });
  await page.setViewportSize({ width: 1920, height: 1080 });
  for (const scene of ['reveal', 'hint']) {
    await page.goto(base + `/overlay/?demo=1&scene=${scene}`);
    await background(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForSelector(`#${scene}:visible`);
    if (scene === 'reveal')
      await page.waitForFunction(() => document.getElementById('reveal-text').textContent.endsWith('safe.'));
    else await page.waitForTimeout(250);
    await page.screenshot({ path: join(media, `overlay-${scene}.png`), omitBackground: true });
  }
  await page.close();
  const social = await videoContext.newPage();
  await social.setViewportSize({ width: 1280, height: 640 });
  const cdp = await videoContext.newCDPSession(social);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 640,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await social.goto('file://' + join(root, 'work/social-preview.svg'));
  await social.screenshot({ path: join(media, 'social-preview.png'), scale: 'css' });
  await social.close();
  writeFileSync(
    join(root, 'work/media-recordings/timeline.json'),
    JSON.stringify({ rawVideo, marks, checks }, null, 2) + '\n',
  );
  check('Captured four 2x screenshots and the 1280x640 social card.');
} finally {
  writeFileSync(join(root, 'work/media-recordings/replay.log'), output);
  if (videoContext) await videoContext.close();
  if (browser) await browser.close();
  child.kill('SIGINT');
}
