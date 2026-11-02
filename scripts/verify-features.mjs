import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const root = process.cwd(), out = join(root, 'docs/verification');
mkdirSync(join(root, 'work/feature-maps'), { recursive: true });
const helper = join(root, 'work/feature-preview.ts');
writeFileSync(helper, `
import { createRuntime } from '../server/runtime.ts';
import { loadStory } from '../server/story.ts';
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url) !== 'https://api.openai.com/v1/responses') return realFetch(url, init);
  const { game } = JSON.parse(JSON.parse(String(init.body)).input[1].content);
  const story = { game, beats: Array.from({length:10}, (_,i) => ({id:'b'+(i+1),order:i+1,
    chapter:'PRIVATE CHAPTER',summary:'PRIVATE SUMMARY',secrets:['PRIVATE SECRET','PRIVATE FACT']})) };
  return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({story,currentBeat:'b4'})}]}]});
};
const runtime = createRuntime({story:loadStory(),file:':memory:',mode:'replay',classifierReady:true,
  classify:async () => ({label:'future_spoiler',beatId:'b3',confidence:1,hintLevel:null}),
  transport:{deleteMessage:async()=>{},reply:async()=>{}},storyMaps:{key:'mock-only',directory:'work/feature-maps'},
  configure:app=>app.post('/verification/seed',async(_req,res)=>{
    await runtime.pipeline.process({id:'preview-held',user:'tali',text:'The bell is at the disused quay.'});
    runtime.store.db.prepare('UPDATE holds SET sealedAt = ?').run(new Date(Date.now()-47*60000).toISOString());
    res.json({ok:true});
  })});
console.log('Preview http://127.0.0.1:'+await runtime.listen(0));
process.on('SIGINT',()=>{void runtime.close().then(()=>process.exit(0));});
`);
const child = spawn(process.execPath, ['--import', 'tsx', helper], { cwd: root, stdio: ['ignore','pipe','pipe'] });
let output = '', browser;
child.stdout.on('data', x => output += x); child.stderr.on('data', x => output += x);
async function until(check) {
  const end = Date.now() + 12000;
  while (!check()) { if (Date.now() > end) throw new Error(output); await new Promise(r => setTimeout(r, 50)); }
}
try {
  await until(() => /Preview http/.test(output));
  const base = output.match(/http:\/\/127\.0\.0\.1:\d+/)[0];
  const folder = readdirSync(join(root,'work/browsers')).find(x=>x.startsWith('chromium_headless_shell-'));
  const launchOptions = {executablePath:join(root,'work/browsers',folder,'chrome-headless-shell-mac-arm64/chrome-headless-shell'),
    args:['--single-process','--in-process-gpu','--disable-gpu','--disable-crashpad-for-testing']};
  browser = await chromium.launch(launchOptions);
  let context = await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});
  let page = await context.newPage(); const errors = [];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/setup/');
  await page.locator('#build:enabled').waitFor();
  await page.locator('#game').fill('Harbor lights');
  await page.locator('#progress').fill('chapter 4');
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:join(out,'setup-before.png')});
  const response = page.waitForResponse(r=>r.url().endsWith('/api/storymap/generate'));
  await page.locator('#build').click();
  const data = await (await response).json();
  assert(!/summary|secrets|PRIVATE/.test(JSON.stringify(data)));
  await page.waitForFunction(()=>document.getElementById('ready').textContent.includes('10 beats'));
  assert.match(await page.locator('#ready').textContent(),/beat 4/);
  assert.equal(await page.locator('#beats li').count(),10);
  assert(!/PRIVATE/.test(await page.locator('body').innerText()));
  await browser.close();
  browser = await chromium.launch(launchOptions);
  context = await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});
  page = await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/setup/');
  await page.waitForFunction(()=>document.getElementById('ready').textContent.includes('10 beats'));
  await page.evaluate(()=>document.fonts.ready);
  await page.setViewportSize({width:1441,height:900});
  await page.setViewportSize({width:1440,height:900});
  await page.waitForTimeout(250);
  await page.screenshot({path:join(out,'setup-after.png')});
  await page.route('**/api/storymap', async route => {
    const response = await route.fetch(); const body = await response.json();
    await route.fulfill({response,json:{...body,canGenerate:false}});
  });
  await page.goto(base+'/setup/');
  await page.locator('#key-note:visible').waitFor();
  assert(await page.locator('#build').isDisabled());
  await page.screenshot({path:join(out,'setup-no-key.png')});
  await page.unroute('**/api/storymap');
  await page.goto(base+'/dashboard/');
  await page.waitForFunction(()=>document.getElementById('beat-number').textContent==='Beat 4 of 10');
  await page.locator('#next').click();
  await page.waitForFunction(()=>document.getElementById('beat-number').textContent==='Beat 5 of 10');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),1440);
  await page.goto(base+'/setup/');
  await page.locator('#map').selectOption('demo');
  await page.waitForFunction(()=>document.getElementById('ready').textContent.includes('6 beats'));
  if (!process.argv.includes('--setup-only')) {
    const overlay = await context.newPage();
    await overlay.setViewportSize({width:1920,height:1080});
    await overlay.goto(base+'/overlay/');
    const checker='<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><path fill="#1E2126" d="M0 0h48v48H0z"/><path fill="#16181C" d="M0 0h24v24H0zm24 24h24v24H24z"/></svg>';
    await overlay.addStyleTag({content:'body{background-image:url("data:image/svg+xml,'+encodeURIComponent(checker)+'")}'});
    await fetch(base+'/verification/seed',{method:'POST'});
    await fetch(base+'/api/progress',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"beatId":"b3"}'});
    await overlay.locator('#clip-note:visible').waitFor({timeout:20000});
    assert.match(await overlay.locator('#clip-copy').textContent(),/Replay clip\. @tali called it 47 min ago\./);
    await overlay.evaluate(()=>document.fonts.ready);
    await overlay.waitForTimeout(200);
    await overlay.screenshot({path:join(out,'overlay-clip.png')});
    await page.goto(base+'/dashboard/');
    await page.locator('#last-clip a').waitFor();
    assert.match(await page.locator('#last-clip').innerText(),/replay clip/);
    assert.match(await page.locator('.chat-row.caught .timing').innerText(),/caught in \d+ ms/);
    await page.screenshot({path:join(out,'dashboard-clip.png')});
  }
  assert.deepEqual(errors,[]);
  console.log('Setup screenshots and safe payloads passed. Generated-map Next beat and demo switch passed.');
  writeFileSync(join(out,'features.json'),JSON.stringify({status:'passed',setupMock:'Server fetch mock of OpenAI Responses API',
    generatedBeatCount:10,currentBeat:'b4',noBrowserStoryContent:true,clips:!process.argv.includes('--setup-only'),browser:await browser.version()},null,2)+'\n');
} finally { if(browser) await browser.close(); child.kill('SIGINT'); }
