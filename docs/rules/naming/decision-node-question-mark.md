# naming/decision-node-question-mark

IF and Filter nodes should be named as the question they answer, ending in "?".

|  |  |
|---|---|
| Department | `naming` |
| Class | `stylistic` (advisory; needs `--fail-on-stylistic` to fail a run) |
| Recommended | `warn` |
| Fixable | `connections` (safe) |

## Messages

| Message ID | Template |
|---|---|
| `questionMark` | Decision node "{{name}}" should be phrased as a question ending in "?". |
