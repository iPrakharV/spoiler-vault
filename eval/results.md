# Spoiler vault evaluation

Run: 2026-11-02T04:21:45.495Z

Mode: OFFLINE HEURISTIC BASELINE. These are not OpenAI model results.

Story: The Orison file. Messages: 150. Errors or low-confidence holds: 0.

| Label | Support | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: |
| normal | 40 | 0.722 | 0.975 | 0.830 |
| past_talk | 35 | 1.000 | 0.829 | 0.906 |
| future_spoiler | 40 | 1.000 | 1.000 | 1.000 |
| backseat | 35 | 0.963 | 0.743 | 0.839 |

## Confusion matrix

Rows are actual labels. Columns are predictions. Pending counts as a false negative.

| Actual / predicted | normal | past_talk | future_spoiler | backseat | pending |
| --- | ---: | ---: | ---: | ---: | ---: |
| normal | 39 | 0 | 0 | 1 | 0 |
| past_talk | 6 | 29 | 0 | 0 | 0 |
| future_spoiler | 0 | 0 | 40 | 0 | 0 |
| backseat | 9 | 0 | 0 | 26 | 0 |

## Latency

Classifier latency p50: 0.01 ms. p95: 0.03 ms.

Nearest-rank percentiles include errors and timeouts. This measures classification only, not Twitch deletion or reply latency.

Correct future-spoiler label AND release target: 40/40.

These are labeled synthetic examples for The Orison file, not Twitch production traffic.
No training split or model tuning was done. Replace and review fixtures when the story changes.
