# structure/merge-for-reconvergence

Two branches feeding one input of a non-Merge node run it twice; reconverge through a Merge instead.

|  |  |
|---|---|
| Department | `structure` |
| Class | `quality` |
| Recommended | `error` |
| Fixable | no |

## Messages

| Message ID | Template |
|---|---|
| `multipleSources` | Node "{{name}}" receives input {{input}} from {{count}} branches ({{sources}}); reconverge them through a Merge. |
