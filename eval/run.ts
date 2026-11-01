import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { config, root } from '../server/config.js';
import { loadStory, findBeat } from '../server/story.js';
import { openAIClassifier } from '../server/classifier.js';
import { labels, type Label } from '../server/types.js';
import { baseline } from './baseline.js';
import { metrics, type Observation, type Prediction } from './metrics.js';

interface Example { text: string; currentBeat: string; label: Label; beatId: string | null }
const offline = process.argv.includes('--offline');
if (!offline && !config.openaiKey) throw new Error('Set OPENAI_API_KEY for model evaluation, or use --offline for the heuristic baseline.');
const story = loadStory();
const examples: Example[] = readFileSync(join(root, 'fixtures/eval.jsonl'), 'utf8').split(/\r?\n/)
  .filter(line => line.trim()).map((line, index) => {
    const row = JSON.parse(line) as Example;
    if (typeof row.text !== 'string' || !row.text || !labels.includes(row.label) ||
      typeof row.currentBeat !== 'string' || !(row.beatId === null || typeof row.beatId === 'string')) {
      throw new Error(`Invalid eval row ${index + 1}`);
    }
    const current = findBeat(story, row.currentBeat);
    const target = row.beatId === null ? null : findBeat(story, row.beatId);
    if (row.label === 'future_spoiler' && (!target || target.order <= current.order)) throw new Error(`Invalid future target on row ${index + 1}`);
    if (row.label === 'past_talk' && (!target || target.order > current.order)) throw new Error(`Invalid past target on row ${index + 1}`);
    return row;
  });
if (!examples.length) throw new Error('Eval fixture is empty');
const classify = offline ? baseline(story) : openAIClassifier(story);
const observations: Observation[] = [];
const details: object[] = [];
let errors = 0, correctTarget = 0;
for (const [index, example] of examples.entries()) {
  const start = performance.now();
  let predicted: Prediction = 'pending', beatId: string | null = null, error = '';
  try {
    const result = await classify(example.text, example.currentBeat, 3500);
    if (result.confidence < .65) throw new Error('Low confidence, held as pending');
    predicted = result.label; beatId = result.beatId;
  } catch (failure) { errors++; error = failure instanceof Error ? failure.message : 'Classifier error'; }
  const ms = performance.now() - start;
  observations.push({ actual: example.label, predicted, ms });
  if (example.label === 'future_spoiler' && predicted === 'future_spoiler' && beatId === example.beatId) correctTarget++;
  details.push({ index: index + 1, actual: example.label, predicted, expectedBeatId: example.beatId, beatId, ms, ...(error ? { error } : {}) });
  if (!offline && (index + 1) % 10 === 0) console.log(`Evaluated ${index + 1}/${examples.length}`);
}
const result = metrics(observations), fmt = (n: number) => n.toFixed(3);
const futureCount = examples.filter(row => row.label === 'future_spoiler').length;
const report = [
  '# Spoiler Vault evaluation', '',
  `Run: ${new Date().toISOString()}`, '',
  offline ? 'Mode: OFFLINE HEURISTIC BASELINE. These are not OpenAI model results.' : `Mode: OpenAI structured outputs. Model: ${config.model}.`, '',
  `Story: ${story.game}. Messages: ${examples.length}. Errors or low-confidence holds: ${errors}.`, '',
  '| Label | Support | Precision | Recall | F1 |', '| --- | ---: | ---: | ---: | ---: |',
  ...result.scores.map(s => `| ${s.label} | ${s.support} | ${fmt(s.precision)} | ${fmt(s.recall)} | ${fmt(s.f1)} |`), '',
  '## Confusion matrix', '', 'Rows are actual labels. Columns are predictions. Pending counts as a false negative.', '',
  `| Actual / predicted | ${result.columns.join(' | ')} |`, `| --- | ${result.columns.map(() => '---:').join(' | ')} |`,
  ...labels.map(label => `| ${label} | ${result.columns.map(col => result.confusion[label][col]).join(' | ')} |`), '',
  '## Latency', '', `Classifier latency p50: ${result.p50.toFixed(2)} ms. p95: ${result.p95.toFixed(2)} ms.`, '',
  'Nearest-rank percentiles include errors and timeouts. This measures classification only, not Twitch deletion or reply latency.', '',
  `Correct future-spoiler label AND release target: ${correctTarget}/${futureCount}.`, '',
  'These are hand-labeled synthetic examples for the placeholder story, not Twitch production traffic.',
  'No training split or model tuning was done. Replace and review fixtures when the story changes.', '',
].join('\n');
writeFileSync(join(root, 'eval/results.md'), report);
writeFileSync(join(root, 'eval/results.json'), JSON.stringify({ mode: offline ? 'baseline' : 'openai', model: offline ? null : config.model, ...result, errors, details }, null, 2) + '\n');
console.log(report);
console.log('Wrote eval/results.md and eval/results.json');
if (errors === examples.length) process.exitCode = 1;
