import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, message, spoiler, normal, story } from './helpers.js';
import { Store } from '../store.js';
import { validateStory } from '../story.js';

test('a progress jump releases earlier beats in sealedAt order and awards first-seal bonuses once', t => {
  const env = setup(); t.after(() => env.store.close());
  const seed = (id: string, beat: string, user: string, at: string) => env.store.hold(message(id, user, { id, at }), 'vault', spoiler(beat));
  seed('one', 'b3', 'Alice', '2026-11-01T12:00:01.000Z');
  seed('two', 'b2', 'BOB', '2026-11-01T12:00:02.000Z');
  seed('three', 'b3', 'charlie', '2026-11-01T12:00:03.000Z');
  seed('four', 'b4', 'alice', '2026-11-01T12:00:04.000Z');
  assert.deepEqual(env.controls.progress('b3'), { currentBeat: 'b3' });
  assert.equal(env.store.counts().vaultCount, 1);
  const items = env.events.find(item => item.event.type === 'reveal')?.event.items as { text: string }[];
  assert.deepEqual(items.map(item => item.text), ['one', 'two', 'three']);
  assert.deepEqual(env.store.leaderboard(), [{ user: 'alice', points: 4 }, { user: 'bob', points: 4 }, { user: 'charlie', points: 1 }]);
  env.controls.progress('b3'); assert.equal(env.events.filter(item => item.event.type === 'reveal').length, 1);
  env.controls.progress('b4'); env.controls.progress('b4');
  assert.deepEqual(env.store.leaderboard(), [{ user: 'alice', points: 8 }, { user: 'bob', points: 4 }, { user: 'charlie', points: 1 }]);
});
test('hints and pending messages never release or earn Prophet points on progress', t => {
  const env = setup(); t.after(() => env.store.close());
  env.store.hold(message('hint'), 'hint', { ...normal, label: 'backseat', hintLevel: 1 });
  env.store.hold(message('pending'), 'pending'); env.controls.progress('b4');
  assert.deepEqual(env.store.counts(), { vaultCount: 0, jarCount: 1, pendingCount: 1 });
  assert.deepEqual(env.store.leaderboard(), []);
});
test('classification completing after progress releases the newly sealed message safely', async t => {
  let complete!: (value: ReturnType<typeof spoiler>) => void;
  const env = setup(() => new Promise(resolve => { complete = resolve; })); t.after(() => env.store.close());
  const processing = env.pipeline.process(message('the keeper is you'));
  env.controls.progress('b3'); complete(spoiler('b3')); await processing;
  assert.equal(env.store.counts().vaultCount, 0);
  assert.equal(env.events.filter(item => item.event.type === 'reveal').length, 1);
  assert.deepEqual(env.store.leaderboard(), [{ user: 'viewer', points: 4 }]);
});
test('invalid or backward progress is rejected without changing state', t => {
  const env = setup(); t.after(() => env.store.close()); env.controls.progress('b3');
  assert.throws(() => env.controls.progress('b0'), /Unknown beatId/);
  assert.throws(() => env.controls.progress('b1'), /cannot move backwards/);
  assert.equal(env.store.currentBeat, 'b3');
});
test('duplicate beat ids or orders are rejected before a session starts', () => {
  assert.throws(() => validateStory({ ...story, beats: [...story.beats, story.beats[0]] }), /Invalid/);
  const store = new Store(':memory:', story); store.close();
});

test('progress and first-seal bonuses survive SQLite reopening', async t => {
  const { mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { root } = await import('../config.js');
  const file = join(mkdtempSync(join(root, 'work/persist-test-')), 'session.sqlite');
  const first = new Store(file, story);
  first.hold(message('first', 'alice'), 'vault', spoiler('b2'));
  assert.equal(first.release('b2', ['b1', 'b2']).length, 1); first.close();
  const reopened = new Store(file, story); t.after(() => reopened.close());
  assert.equal(reopened.currentBeat, 'b2');
  assert.equal(reopened.release('b2', ['b1', 'b2']).length, 0);
  assert.deepEqual(reopened.leaderboard(), [{ user: 'alice', points: 4 }]);
});
