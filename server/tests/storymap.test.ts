import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRuntime } from '../runtime.js';
import { root } from '../config.js';
import { loadStory } from '../story.js';
import { message, normal, spoiler } from './helpers.js';
import type { Story } from '../types.js';

const generated: Story = { game: 'A test game', beats: Array.from({ length: 10 }, (_, i) => ({
  id: `b${i + 1}`, order: i + 1, chapter: `PRIVATE CHAPTER ${i + 1}`,
  summary: `PRIVATE SUMMARY ${i + 1}`, secrets: [`PRIVATE SECRET ${i + 1}`, 'Another private fact'],
})) };
function assertSafe(data: unknown) {
  const text = JSON.stringify(data);
  assert(!/summary|secrets|PRIVATE/.test(text), text);
}
test('generated maps use structured output, reset holds and never send story content to the browser', async t => {
  const directory = mkdtempSync(join(root, 'work/storymap-test-'));
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input) !== 'https://api.openai.com/v1/responses') return originalFetch(input, init);
    calls++;
    const request = JSON.parse(String(init?.body));
    assert.equal(request.text.format.strict, true);
    assert.equal(request.text.format.schema.properties.story.properties.beats.minItems, 8);
    assert.match(request.input[1].content, /chapter 4/);
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [
      { type: 'output_text', text: JSON.stringify({ story: generated, currentBeat: 'b4' }) },
    ] }] });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const runtime = createRuntime({ story: loadStory(), file: ':memory:', mode: 'replay', classifierReady: true,
    classify: async () => normal, transport: { deleteMessage: async () => {}, reply: async () => {} },
    storyMaps: { key: 'mock-only', directory } });
  const base = `http://127.0.0.1:${await runtime.listen(0)}`;
  t.after(() => runtime.close());
  const post = async (path: string, body: unknown) => originalFetch(base + path, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  runtime.store.hold(message('secret'), 'vault', spoiler());
  runtime.store.hold(message('advice'), 'hint', { ...normal, label: 'backseat', hintLevel: 2 });
  const res = await post('/api/storymap/generate', { game: 'A test game', howFar: 'chapter 4' });
  assert.equal(res.status, 200);
  const data = await res.json() as { currentBeat: string; beatCount: number };
  assertSafe(data); assert.equal(data.currentBeat, 'b4'); assert.equal(data.beatCount, 10);
  assert.equal(calls, 1); assert.equal(runtime.store.currentBeat, 'b4');
  assert.deepEqual(runtime.store.counts(), { vaultCount: 0, jarCount: 0, pendingCount: 0 });
  assert.deepEqual(runtime.store.leaderboard(), []);
  assert.deepEqual(JSON.parse(readFileSync(join(directory, 'a-test-game.json'), 'utf8')), generated);
  for (const path of ['/api/storymap', '/api/session', '/api/game', '/api/desk'])
    assertSafe(await (await originalFetch(base + path)).json());
  assert.equal((await originalFetch(base + '/story/generated/a-test-game.json')).status, 404);
  assert.deepEqual(await (await post('/api/progress', { beatId: 'b5' })).json(), { currentBeat: 'b5' });
  const demo = await (await post('/api/storymap/select', { map: 'demo' })).json() as { demo: boolean };
  assert(demo.demo); assert.equal(runtime.store.currentBeat, 'b1'); assert.equal(runtime.pipeline.story.beats.length, 6);
});
test('setup disables generation without a key', async t => {
  const runtime = createRuntime({ story: loadStory(), file: ':memory:', mode: 'replay', classifierReady: true,
    classify: async () => normal, transport: { deleteMessage: async () => {}, reply: async () => {} }, storyMaps: { key: '' } });
  const base = `http://127.0.0.1:${await runtime.listen(0)}`; t.after(() => runtime.close());
  const state = await (await fetch(base + '/api/storymap')).json() as { canGenerate: boolean };
  assert.equal(state.canGenerate, false);
  assert.equal((await fetch(base + '/setup/')).status, 200);
  const res = await fetch(base + '/api/storymap/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"game":"test"}' });
  assert.equal(res.status, 503); assert.equal(runtime.store.currentBeat, 'b1');
});
test('switching maps discards classification that was still in flight', async t => {
  let finish!: (value: typeof normal) => void;
  const runtime = createRuntime({ story: loadStory(), file: ':memory:', mode: 'replay', classifierReady: true,
    classify: () => new Promise(resolve => { finish = resolve; }), transport: { deleteMessage: async () => {}, reply: async () => {} } });
  t.after(() => runtime.store.close());
  const work = runtime.pipeline.process(message('old map message'));
  runtime.pipeline.activateStory(structuredClone(generated), 'b4');
  finish(normal); await work;
  assert.deepEqual(runtime.store.desk().feed, []); assert.equal(runtime.store.desk().stats.processed, 0);
});

test('invalid model maps leave the active map and holds unchanged', async t => {
  const directory = mkdtempSync(join(root, 'work/storymap-invalid-'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => String(input) === 'https://api.openai.com/v1/responses'
    ? Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text',
      text: JSON.stringify({ story: { ...generated, beats: generated.beats.slice(0, 3) }, currentBeat: 'b1' }) }] }] })
    : originalFetch(input, init);
  t.after(() => { globalThis.fetch = originalFetch; });
  const runtime = createRuntime({ story: loadStory(), file: ':memory:', mode: 'replay', classifierReady: true,
    classify: async () => normal, transport: { deleteMessage: async () => {}, reply: async () => {} },
    storyMaps: { key: 'mock-only', directory } });
  const base = `http://127.0.0.1:${await runtime.listen(0)}`; t.after(() => runtime.close());
  runtime.store.hold(message('keep me'), 'vault', spoiler());
  const res = await originalFetch(base + '/api/storymap/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game: 'test' }) });
  assert.equal(res.status, 502); assert.equal(runtime.store.counts().vaultCount, 1);
  assert.equal(runtime.pipeline.story.beats.length, 6); assert.equal(runtime.store.currentBeat, 'b1');
});
