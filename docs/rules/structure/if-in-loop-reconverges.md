# structure/if-in-loop-reconverges

A branch inside a loop must reconverge through a Merge before returning to the loop node, or iterations are lost.

|  |  |
|---|---|
| Department | `structure` |
| Class | `quality` |
| Recommended | `error` |
| Fixable | no |

## Messages

| Message ID | Template |
|---|---|
| `missingMerge` | Branches inside loop "{{loop}}" return to it separately (from {{sources}}); reconverge them through a Merge first. |
