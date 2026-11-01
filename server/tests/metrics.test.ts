import test from 'node:test';
import assert from 'node:assert/strict';
import { metrics, percentile } from '../../eval/metrics.js';

test('metrics count pending as missed gold labels and compute real false positives', () => {
  const result = metrics([
    { actual: 'future_spoiler', predicted: 'future_spoiler', ms: 10 },
    { actual: 'future_spoiler', predicted: 'pending', ms: 3500 },
    { actual: 'normal', predicted: 'future_spoiler', ms: 100 },
    { actual: 'normal', predicted: 'normal', ms: 20 },
  ]);
  const score = result.scores.find(s => s.label === 'future_spoiler')!;
  assert.equal(score.precision, .5); assert.equal(score.recall, .5); assert.equal(score.f1, .5);
  assert.equal(result.confusion.future_spoiler.pending, 1);
  assert.equal(result.p50, 20); assert.equal(result.p95, 3500);
});
test('nearest rank percentiles handle empty and unsorted arrays', () => {
  assert.equal(percentile([], .95), 0); assert.equal(percentile([9, 1, 5], .5), 5);
});
