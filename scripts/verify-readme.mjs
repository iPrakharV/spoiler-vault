import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import assert from 'node:assert/strict';
const root = process.cwd(),
  output = join(root, 'work/readme-checks');
mkdirSync(output, { recursive: true });
process.env.PLAYWRIGHT_BROWSERS_PATH = join(root, 'work/browsers');
const { chromium } = await import('playwright');
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const html = readFileSync(join(root, 'work/readme-rendered.html'), 'utf8');
const badges = [
  ...new Set(
    [...readme.matchAll(/https:\/\/img\.shields\.io\/[^"\s]+/g)].map((match) =>
      match[0].replaceAll('&amp;', '&'),
    ),
  ),
];
const badgeFiles = new Map();
for (const [index, url] of badges.entries()) {
  const response = await fetch(url);
  assert(response.ok, `Badge request failed: ${url}`);
  const svg = await response.text();
  assert(svg.includes('<svg') && !svg.includes('badge not found'));
  const file = join(output, `badge-${index}.svg`);
  writeFileSync(file, svg);
  badgeFiles.set(url, file);
}
const mime = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
};
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/') {
    const dark = new URL(req.url, 'http://localhost').searchParams.get('theme') === 'dark';
    res.setHeader('Content-Type', 'text/html');
    res.end(
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/vendor/github-markdown.css"><style>body{margin:0;background:${dark ? '#0d1117' : '#ffffff'};color:${dark ? '#e6edf3' : '#1f2328'}}.markdown-body{box-sizing:border-box;max-width:1012px;min-width:200px;margin:24px auto;padding:32px;border:1px solid ${dark ? '#30363d' : '#d1d9e0'};border-radius:6px}.mermaid{display:flex;justify-content:center;overflow:auto}.mermaid svg{max-width:100%}table img{display:block}p[align=center] img{vertical-align:middle}</style></head><body><article class="markdown-body">${html}</article><script type="module">import mermaid from '/vendor/mermaid/mermaid.esm.min.mjs';const source=document.querySelector('pre[lang="mermaid"]');if(!source)throw new Error('Missing Mermaid source');const graph=document.createElement('div');graph.className='mermaid';graph.textContent=source.textContent;source.closest('section').replaceWith(graph);mermaid.initialize({startOnLoad:false,theme:'${dark ? 'dark' : 'default'}',securityLevel:'strict'});await mermaid.run({nodes:[graph]});window.diagramReady=true;</script></body></html>`,
    );
    return;
  }
  let file;
  if (path.startsWith('/docs/media/')) file = join(root, path);
  else if (path === '/vendor/github-markdown.css')
    file = join(root, 'work/media-tools/node_modules/github-markdown-css/github-markdown.css');
  else if (path.startsWith('/vendor/mermaid/'))
    file = join(root, 'work/media-tools/node_modules/mermaid/dist', path.slice('/vendor/mermaid/'.length));
  if (!file || path.includes('..') || !existsSync(file)) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
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
  const context = await browser.newContext({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Use the same public badge bytes already fetched above. The README keeps shields.io URLs.
  await page.route('https://camo.githubusercontent.com/**', async (route) => {
    const encoded = route.request().url().split('/').at(-1);
    const canonical = Buffer.from(encoded, 'hex').toString('utf8');
    const file = badgeFiles.get(canonical);
    if (file) await route.fulfill({ path: file, contentType: 'image/svg+xml' });
    else await route.continue();
  });
  const report = [];
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(`http://127.0.0.1:${server.address().port}/?theme=${theme}`);
    await page.waitForFunction(() => window.diagramReady === true);
    await page.waitForFunction(() =>
      [...document.querySelectorAll('article img')].every((img) => img.complete && img.naturalWidth > 0),
    );
    await page.waitForTimeout(200);
    const state = await page.evaluate(() => ({
      images: [...document.querySelectorAll('article img')].map((img) => ({
        src: img.getAttribute('data-canonical-src') || img.getAttribute('src'),
        width: img.naturalWidth,
        height: img.naturalHeight,
      })),
      headings: [...document.querySelectorAll('h2')].map((el) => el.textContent.trim()),
      diagram: document.querySelectorAll('.mermaid svg').length,
      nodes: document.querySelectorAll('.mermaid .node').length,
      scrollWidth: document.documentElement.scrollWidth,
      width: innerWidth,
      badgeRows: [
        ...new Set(
          [...document.querySelectorAll('p[align=center] img')]
            .slice(1)
            .map((el) => Math.round(el.getBoundingClientRect().top)),
        ),
      ],
      gridRows: document.querySelector('article table').rows.length,
    }));
    assert.equal(state.images.length, 12);
    assert.equal(state.diagram, 1);
    assert(state.nodes >= 12);
    assert.equal(state.scrollWidth, state.width);
    assert.equal(state.badgeRows.length, 1);
    assert.equal(state.gridRows, 2);
    assert.deepEqual(state.headings, [
      'What it does',
      'Try it in 60 seconds',
      'Use it with any game',
      'Run it live on Twitch',
      'Reveal clips',
      'How it works',
      'Accuracy',
      'How we used Codex',
      'Project layout',
      'Known limits',
      'Team',
    ]);
    // Paint the whole page before capture, including off-screen SVG paths.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: 1200, height });
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(output, `readme-${theme}.png`) });
    await page.setViewportSize({ width: 1200, height: 1000 });
    await page.screenshot({ path: join(output, `readme-${theme}-top.png`) });
    await page.locator('.mermaid').screenshot({ path: join(output, `readme-${theme}-diagram.png`) });
    report.push({ theme, ...state });
    console.log(`${theme}: all 12 images, six badges in one row, Mermaid and section order passed.`);
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    join(output, 'report.json'),
    JSON.stringify({ status: 'passed', themes: report, browser: await browser.version() }, null, 2) + '\n',
  );
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
