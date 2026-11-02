import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { get } from 'node:http';
import { once } from 'node:events';
import { createRuntime } from '../runtime.js';
import { normal, story, message } from './helpers.js';

async function boot() {
  const runtime = createRuntime({ story, file: ':memory:', mode: 'replay', classifierReady: true,
    classify: async () => normal, transport: { deleteMessage: async () => {}, reply: async () => {} } });
  const port = await runtime.listen(0);
  return { runtime, base: `http://127.0.0.1:${port}`, ws: `ws://127.0.0.1:${port}/ws` };
}
test('HTTP routing serves UI, validates progress and excludes future secrets from session', async t => {
  const { runtime, base } = await boot(); t.after(() => runtime.close());
  assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { ok: true });
  const page = await fetch(`${base}/dashboard/`); assert.equal(page.status, 200); assert.match(page.headers.get('content-type') || '', /text\/html/); assert.match(await page.text(), /id="chat"/);
  const session = await (await fetch(`${base}/api/session`)).json() as { current: { id: string } };
  assert.equal(session.current.id, 'b1'); assert(!JSON.stringify(session).includes('The keeper is you.'));
  const post = (body: unknown) => fetch(`${base}/api/progress`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({})).status, 400); assert.equal((await post({ beatId: 'absent' })).status, 400);
  assert.deepEqual(await (await post({ beatId: 'b3' })).json(), { currentBeat: 'b3' });
  assert.equal((await post({ beatId: 'b2' })).status, 409);
  const malformed = await fetch(`${base}/api/progress`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await (await fetch(`${base}/api/hint`, { method: 'POST' })).json(), { released: false });
});
test('cross-origin writes and unexpected hosts are rejected', async t => {
  const { runtime, base } = await boot(); t.after(() => runtime.close());
  assert.equal((await fetch(`${base}/api/progress`, { method: 'POST', headers: { Origin: 'https://other.example', 'Content-Type': 'application/json' }, body: '{"beatId":"b3"}' })).status, 403);
  const hostStatus = await new Promise<number | undefined>((resolve, reject) => {
    get(`${base}/api/health`, { headers: { Host: 'hostile.example' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(hostStatus, 403);
  assert.equal(runtime.store.currentBeat, 'b1');
});
test('websocket snapshots reconnect cleanly and safe chat reaches dashboard only', async t => {
  const { runtime, ws } = await boot(); t.after(() => runtime.close());
  const overlay = new WebSocket(ws), dashboard = new WebSocket(`${ws}?role=dashboard`);
  const overlayEvents: { type: string }[] = [], dashboardEvents: { type: string; text?: string }[] = [];
  overlay.on('message', raw => overlayEvents.push(JSON.parse(raw.toString())));
  dashboard.on('message', raw => dashboardEvents.push(JSON.parse(raw.toString())));
  await Promise.all([once(overlay, 'open'), once(dashboard, 'open')]);
  const next = once(dashboard, 'message');
  await runtime.pipeline.process(message('<script>hello</script>'));
  await next;
  assert(overlayEvents.some(e => e.type === 'status'));
  assert(!overlayEvents.some(e => e.type === 'chat'));
  assert(dashboardEvents.some(e => e.type === 'chat' && e.text === '<script>hello</script>'));
  runtime.controls.progress('b3');
  overlay.close(); dashboard.close();
  const reconnect = new WebSocket(ws);
  const snapshot = once(reconnect, 'message');
  const [raw] = await snapshot;
  assert.equal(JSON.parse(raw.toString()).currentBeat, 'b3');
  reconnect.close();
});


test('wire events keep exact contract keys and caught text stays out of desk data', async t => {
  const { runtime, base, ws } = await boot(); t.after(() => runtime.close());
  const keys: Record<string, string[]> = { status: ['type','currentBeat','vaultCount','jarCount'], sealed: ['type','user','beatId','at'],
    reveal: ['type','beatId','items'], hint: ['type','text','user','level'], leaderboard: ['type','entries'], chat: ['type','user','text','label'], clip: ['type','beatId','clipId','url'] };
  const socket = new WebSocket(`${ws}?role=dashboard`); const events: Record<string, unknown>[] = [];
  socket.on('message', raw => events.push(JSON.parse(raw.toString()))); await once(socket, 'open');
  runtime.store.hold(message('private text', 'alice'), 'vault', { label:'future_spoiler',beatId:'b3',confidence:1,hintLevel:null });
  runtime.broadcast({ type:'sealed',user:'alice',beatId:'b3',at:new Date().toISOString() });
  runtime.store.hold(message('look around', 'bob'), 'hint', { label:'backseat',beatId:null,confidence:1,hintLevel:2 });
  await runtime.controls.hint(); await runtime.pipeline.process(message('hello')); runtime.controls.progress('b3');
  await new Promise(resolve => setTimeout(resolve, 30));
  for (const event of events) {
    assert.deepEqual(Object.keys(event).sort(), keys[String(event.type)].sort());
    if (event.type === 'reveal') for (const item of event.items as object[]) assert.deepEqual(Object.keys(item).sort(), ['sealedAt','text','user']);
    if (event.type === 'leaderboard') for (const item of event.entries as object[]) assert.deepEqual(Object.keys(item).sort(), ['points','user']);
  }
  assert.deepEqual([...new Set(events.map(e => e.type))].sort(), Object.keys(keys).sort());
  const desk = JSON.stringify(await (await fetch(`${base}/api/desk`)).json()); assert(!desk.includes('private text'));
  socket.close();
});
