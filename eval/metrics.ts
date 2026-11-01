import { labels, type Label } from '../server/types.js';
export type Prediction = Label | 'pending';
export interface Observation { actual: Label; predicted: Prediction; ms: number }
export function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}
export function metrics(rows: Observation[]) {
  const columns: Prediction[] = [...labels, 'pending'];
  const confusion = Object.fromEntries(labels.map(actual => [actual,
    Object.fromEntries(columns.map(predicted => [predicted, rows.filter(r => r.actual === actual && r.predicted === predicted).length])),
  ])) as Record<Label, Record<Prediction, number>>;
  const scores = labels.map(label => {
    const tp = rows.filter(r => r.actual === label && r.predicted === label).length;
    const fp = rows.filter(r => r.actual !== label && r.predicted === label).length;
    const fn = rows.filter(r => r.actual === label && r.predicted !== label).length;
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    return { label, support: tp + fn, precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0 };
  });
  return { columns, confusion, scores, p50: percentile(rows.map(r => r.ms), .5), p95: percentile(rows.map(r => r.ms), .95) };
}
