# Spoiler Vault evaluation

Run: 2026-11-01T19:58:16.685Z

Mode: OFFLINE HEURISTIC BASELINE. These are not OpenAI model results.

Story: The Last Lantern (placeholder). Messages: 150. Errors or low-confidence holds: 0.

| Label | Support | Precision | Recall | F1 |
| --- | ---: | ---: | ---: | ---: |
| normal | 38 | 0.430 | 0.974 | 0.597 |
| past_talk | 38 | 1.000 | 0.184 | 0.311 |
| future_spoiler | 38 | 1.000 | 0.605 | 0.754 |
| backseat | 36 | 0.912 | 0.861 | 0.886 |

## Confusion matrix

Rows are actual labels. Columns are predictions. Pending counts as a false negative.

| Actual / predicted | normal | past_talk | future_spoiler | backseat | pending |
| --- | ---: | ---: | ---: | ---: | ---: |
| normal | 37 | 0 | 0 | 1 | 0 |
| past_talk | 29 | 7 | 0 | 2 | 0 |
| future_spoiler | 15 | 0 | 23 | 0 | 0 |
| backseat | 5 | 0 | 0 | 31 | 0 |

## Latency

Classifier latency p50: 0.01 ms. p95: 0.01 ms.

Nearest-rank percentiles include errors and timeouts. This measures classification only, not Twitch deletion or reply latency.

Correct future-spoiler label AND release target: 23/38.

These are hand-labeled synthetic examples for the placeholder story, not Twitch production traffic.
No training split or model tuning was done. Replace and review fixtures when the story changes.
