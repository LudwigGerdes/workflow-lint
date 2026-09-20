# structure/loop-iteration-guard

Every loop needs a bound: an item-driven SplitInBatches, or a decision node testing an attempt counter.

|  |  |
|---|---|
| Department | `structure` |
| Class | `quality` |
| Recommended | `warn` |
| Fixable | no |

## Messages

| Message ID | Template |
|---|---|
| `unbounded` | Loop ({{cycle}}) has no iteration guard, so it can run forever; bound it with a counter check or SplitInBatches. |
