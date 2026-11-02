import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { config, root } from './config.js';
import { loadStory, findBeat } from './story.js';
import { openAIClassifier } from './classifier.js';
import { createRuntime } from './runtime.js';
import { labels, type Classification, type Classifier } from './types.js';

type Entry =
  | { progress: string; delayMs?: number }
  | {
      delayMs: number;
      user: string;
      text: string;
      label: Classification['label'];
      beatId: string | null;
      hintLevel: number | null;
      fault?: 'timeout';
    };
const offline = process.argv.includes('--offline');
const auto = process.argv.includes('--auto');
if (auto && process.argv.includes('--manual')) throw new Error('Choose either --auto or --manual');
const exit = process.argv.includes('--exit');
const speed = Number(process.argv.find((arg) => arg.startsWith('--speed='))?.split('=')[1] || 1);
if (!Number.isFinite(speed) || speed <= 0) throw new Error('--speed must be a positive number');
if (!offline && !config.openaiKey) throw new Error('Set OPENAI_API_KEY or run npm run replay -- --offline');
const story = loadStory();
const entries: Entry[] = JSON.parse(readFileSync(join(root, 'fixtures/demo-chat.json'), 'utf8'));
if (!Array.isArray(entries)) throw new Error('demo-chat.json must be an array');
for (const entry of entries) {
  if ('progress' in entry) findBeat(story, entry.progress);
  else if (
    typeof entry.text !== 'string' ||
    typeof entry.user !== 'string' ||
    !labels.includes(entry.label) ||
    !Number.isFinite(entry.delayMs) ||
    entry.delayMs < 0
  )
    throw new Error('Invalid replay message');
}
let expected: Classification;
let fault: string | undefined;
const classify: Classifier = offline
  ? async (_text, currentBeat) => {
      if (fault === 'timeout') throw new Error('Classifier timed out');
      if (
        expected.label === 'future_spoiler' &&
        expected.beatId &&
        findBeat(story, expected.beatId).order <= findBeat(story, currentBeat).order
      ) {
        return { ...expected, label: 'past_talk' };
      }
      if (
        expected.label === 'past_talk' &&
        expected.beatId &&
        findBeat(story, expected.beatId).order > findBeat(story, currentBeat).order
      )
        return { ...expected, label: 'future_spoiler' };
      return expected;
    }
  : openAIClassifier(story);
const runtime = createRuntime({
  story,
  file: ':memory:',
  classify,
  mode: 'replay',
  classifierReady: true,
  transport: {
    deleteMessage: async (id) => {
      console.log(`[replay delete] ${id}`);
    },
    reply: async (text) => {
      console.log(`[replay reply] ${text}`);
    },
  },
});
const port = await runtime.listen(config.port);
console.log(
  `Replay ${offline ? 'OFFLINE (stored labels, no API calls)' : 'with OpenAI'}: http://localhost:${port}/dashboard/`,
);
console.log(`Story progress: ${auto ? 'automatic' : 'manual (N or game choices)'}`);
console.log('Fresh in-memory SQLite session. Press Ctrl+C to stop.');
let stopped = false;
const abort = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    if (stopped) return;
    stopped = true;
    abort.abort();
    void runtime.close().then(() => process.exit(0));
  });
try {
  await pause(2000 / speed, undefined, { signal: abort.signal });
  for (const entry of entries) {
    if ('progress' in entry && !auto) continue;
    await pause((entry.delayMs ?? 1500) / speed, undefined, { signal: abort.signal });
    if ('progress' in entry) {
      if (auto && findBeat(story, entry.progress).order >= findBeat(story, runtime.store.currentBeat).order)
        runtime.controls.progress(entry.progress);
    } else {
      fault = entry.fault;
      expected = { label: entry.label, beatId: entry.beatId, hintLevel: entry.hintLevel, confidence: 1 };
      await runtime.pipeline.process({
        id: randomUUID(),
        user: entry.user,
        text: entry.text,
        broadcaster: entry.user.toLowerCase() === 'broadcaster',
      });
    }
  }
  console.log(`Replay complete. ${JSON.stringify(runtime.pipeline.status())}`);
  console.log(`Prophets: ${JSON.stringify(runtime.store.leaderboard())}`);
  if (exit) {
    stopped = true;
    await runtime.close();
  }
} catch (error) {
  if (!stopped) {
    await runtime.close();
    throw error;
  }
}
