import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { once } from 'node:events';
import { createRuntime } from '../runtime.js';
import { Twitch, scopes } from '../twitch.js';
import { root } from '../config.js';
import { loadStory } from '../story.js';
import { message, normal, spoiler } from './helpers.js';
import type { ClipResult } from '../clips.js';
const settle = () => new Promise(resolve => setTimeout(resolve, 25));

test('one Helix clip request per reveal stores the ID and edit URL without duplicate progress calls', async t => {
  assert(scopes.includes('clips:edit'));
  const directory = mkdtempSync(join(root, 'work/clip-test-'));
  writeFileSync(join(directory, 'twitch-tokens.json'), JSON.stringify({ access_token: 'mock-token', refresh_token: 'mock-refresh', expiresAt: Date.now() + 3600000 }));
  const twitch = new Twitch(directory); twitch.broadcasterId = '42';
  const realFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://api.twitch.tv/helix/clips?broadcaster_id=42&has_delay=true');
    assert.equal(init?.method, 'POST'); calls++;
    return Response.json({ data: [{ id: 'test-clip', edit_url: 'https://clips.twitch.tv/test-clip/edit' }] }, { status: 202 });
  };
  t.after(() => { globalThis.fetch = realFetch; });
  const runtime = createRuntime({ story: loadStory(), file: ':memory:', mode: 'live', classifierReady: true,
    connection: () => 'connected', createClip: () => twitch.createClip(), classify: async () => normal,
    transport: { deleteMessage: async () => {}, reply: async () => {} } });
  t.after(() => runtime.store.close());
  runtime.store.hold(message('one', 'alice'), 'vault', spoiler('b3'));
  runtime.store.hold(message('two', 'bob'), 'vault', spoiler('b3'));
  runtime.controls.progress('b3'); runtime.controls.progress('b3');
  await settle(); assert.equal(calls, 1);
  const row = runtime.store.db.prepare('SELECT * FROM reveals').get() as Record<string, unknown>;
  assert.equal(row.clipId, 'test-clip'); assert.equal(row.editUrl, 'https://clips.twitch.tv/test-clip/edit');
  assert.equal(row.url, 'https://clips.twitch.tv/test-clip');
  assert.equal(runtime.store.counts().vaultCount, 0);
});
test('a slow or failed clip request never blocks a reveal or its points, and failures stay off websocket events', async t => {
  let reject!: (error: Error) => void; let calls = 0;
  const runtime = createRuntime({ story: loadStory(), file: ':memory:', mode: 'live', classifierReady: true,
    connection: () => 'connected', createClip: () => { calls++; return new Promise<ClipResult>((_, fail) => { reject = fail; }); },
    classify: async () => normal, transport: { deleteMessage: async () => {}, reply: async () => {} } });
  const port = await runtime.listen(0); t.after(() => runtime.close());
  const { default: WebSocket } = await import('ws');
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`), events: { type: string }[] = [];
  socket.on('message', data => events.push(JSON.parse(String(data)))); await once(socket, 'open');
  runtime.store.hold(message('the prediction', 'alice'), 'vault', spoiler('b3'));
  assert.deepEqual(runtime.controls.progress('b3'), { currentBeat: 'b3' });
  assert.deepEqual(runtime.store.leaderboard(), [{ user: 'alice', points: 4 }]);
  await settle(); assert.equal(calls, 1); assert(events.some(e => e.type === 'reveal'));
  reject(new Error('Twitch POST clips failed (404)')); await settle();
  assert.equal(runtime.store.desk().lastClip && (runtime.store.desk().lastClip as { error: string }).error, 'Clip failed: channel offline');
  assert(!events.some(e => e.type === 'clip' || e.type === 'clip_error'));
  socket.close();
});
test('offline replay creates a labeled placeholder without a Helix call and reports caught timing separately', async t => {
  let calls = 0;
  const runtime = createRuntime({ story: loadStory(), file: ':memory:', mode: 'replay', classifierReady: true,
    createClip: async () => { calls++; throw new Error('No Twitch in replay'); }, classify: async () => spoiler('b3'),
    transport: { deleteMessage: async () => { await new Promise(r => setTimeout(r, 15)); }, reply: async () => {} } });
  t.after(() => runtime.store.close());
  await runtime.pipeline.process(message('the bell is at the quay', 'alice'));
  const desk = runtime.store.desk();
  const feed = desk.feed as { caughtMs: number }[];
  assert(feed[0].caughtMs >= 10); assert(desk.stats.avg < feed[0].caughtMs);
  runtime.controls.progress('b3'); await settle(); assert.equal(calls, 0);
  const clip = runtime.store.desk().lastClip as { clipId: string; url: string; replay: number };
  assert.match(clip.clipId, /^replay-/); assert.match(clip.url, /^https:\/\/example.com\/replay-clip/); assert.equal(clip.replay, 1);
});
