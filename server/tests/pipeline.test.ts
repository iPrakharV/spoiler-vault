import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, message, normal, spoiler } from './helpers.js';
import type { Classification } from '../types.js';

test('normal and past talk pass only to dashboard, with no deletion', async t => {
  const env = setup(async text => text === 'past' ? { ...normal, label: 'past_talk', beatId: 'b1' } : normal);
  t.after(() => env.store.close());
  await env.pipeline.process(message('hello')); await env.pipeline.process(message('past'));
  assert.equal(env.deleted.length, 0);
  assert.equal(env.events.length, 2);
  assert(env.events.every(item => item.event.type === 'chat' && item.dashboardOnly));
});
test('spoilers are deleted, persisted, acknowledged and sealed without text in broadcasts', async t => {
  const env = setup(async () => spoiler()); t.after(() => env.store.close());
  const msg = message('The keeper is you.', 'MAYA'); await env.pipeline.process(msg);
  assert.deepEqual(env.deleted, [msg.id]); assert.deepEqual(env.replies, ['@MAYA sealed until the reveal']);
  const held = env.store.db.prepare('SELECT * FROM holds').get() as { text: string; deleted: number; user: string };
  assert.equal(held.text, msg.text); assert.equal(held.deleted, 1); assert.equal(held.user, 'maya');
  assert(!JSON.stringify(env.events).includes(msg.text));
  assert.equal(env.store.counts().vaultCount, 1);
});
test('classifier errors, low confidence and invalid targets are held as pending', async t => {
  for (const classify of [async () => { throw new Error('network'); },
    async () => ({ ...normal, confidence: .4 }), async () => spoiler('missing'), async () => spoiler('b1')]) {
    const env = setup(classify); t.after(() => env.store.close());
    const msg = message('unknown'); await env.pipeline.process(msg);
    assert.deepEqual(env.deleted, [msg.id]); assert.equal(env.store.counts().pendingCount, 1);
    assert.equal(env.replies.length, 0); assert(!env.events.some(item => item.event.type === 'chat'));
  }
});
test('classification stops at 3.5 seconds and deletes as pending', async t => {
  const env = setup(() => new Promise(() => {})); t.after(() => env.store.close());
  const before = performance.now(); await env.pipeline.process(message());
  const elapsed = performance.now() - before;
  assert(elapsed >= 3400 && elapsed < 4500, `timeout took ${elapsed} ms`);
  assert.equal(env.store.counts().pendingCount, 1); assert.equal(env.deleted.length, 1);
});
test('old EventSub messages bypass classification and are held immediately', async t => {
  let calls = 0; const env = setup(async () => { calls++; return normal; }); t.after(() => env.store.close());
  await env.pipeline.process(message('late', 'viewer', { at: new Date(Date.now() - 5000).toISOString() }));
  assert.equal(calls, 0); assert.equal(env.store.counts().pendingCount, 1);
});
test('duplicate message ids and broadcaster or bot echoes are ignored', async t => {
  let calls = 0; const env = setup(async () => { calls++; return normal; }); t.after(() => env.store.close());
  const msg = message(); await env.pipeline.process(msg); await env.pipeline.process(msg);
  await env.pipeline.process(message('hello', 'broadcaster', { broadcaster: true }));
  await env.pipeline.process(message('echo', 'bot', { bot: true }));
  assert.equal(calls, 1);
});
test('delete and reply failures keep holds and report warnings without safe-chat leakage', async t => {
  const env = setup(async () => spoiler()); t.after(() => env.store.close());
  env.transport.deleteMessage = async () => { throw new Error('Helix 403'); };
  env.transport.reply = async () => { throw new Error('Helix 429'); };
  await env.pipeline.process(message('secret'));
  assert.equal(env.store.counts().vaultCount, 1);
  const row = env.store.db.prepare('SELECT deleted FROM holds').get() as { deleted: number };
  assert.equal(row.deleted, 0);
  assert.equal(env.store.warning, 'chat_reply');
  assert(!env.events.some(item => item.event.type === 'chat'));
});
test('hint release uses level then age, releases one, and ignores a viewer command', async t => {
  const classifications: Record<string, Classification> = {
    explicit: { ...normal, label: 'backseat', hintLevel: 5 },
    vague: { ...normal, label: 'backseat', hintLevel: 1 },
    second: { ...normal, label: 'backseat', hintLevel: 1 },
  };
  const env = setup(async text => classifications[text] || normal); t.after(() => env.store.close());
  for (const text of ['explicit', 'vague', 'second']) await env.pipeline.process(message(text));
  await env.pipeline.process(message('!hint')); assert.equal(env.store.counts().jarCount, 3);
  const command = message('!hint', 'broadcaster', { broadcaster: true });
  await env.pipeline.process(command); await env.pipeline.process(command);
  assert.equal(env.store.counts().jarCount, 2);
  assert.equal(env.events.find(item => item.event.type === 'hint')?.event.text, 'vague');
  await env.controls.hint(); await env.controls.hint();
  assert.deepEqual(env.events.filter(item => item.event.type === 'hint').map(item => item.event.text), ['vague', 'second', 'explicit']);
  assert.deepEqual(await env.controls.hint(), { released: false });
});


test('the desk shows the last hint released even when it was inserted earlier', async t => {
  const env = setup(); t.after(() => env.store.close());
  env.store.hold(message('Older explicit hint', 'first'), 'hint', { ...normal, label: 'backseat', hintLevel: 5 });
  env.store.hold(message('Newer vague hint', 'second'), 'hint', { ...normal, label: 'backseat', hintLevel: 1 });
  await env.controls.hint();
  assert.equal((env.store.desk().lastHint as { text: string }).text, 'Newer vague hint');
  await env.controls.hint();
  assert.equal((env.store.desk().lastHint as { text: string }).text, 'Older explicit hint');
});
