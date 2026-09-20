# structure/cyclic-requires-execution-order-v1

A workflow containing a loop must run under executionOrder v1.

|  |  |
|---|---|
| Department | `structure` |
| Class | `quality` |
| Recommended | `error` |
| Fixable | `params` (safe) |

## Messages

| Message ID | Template |
|---|---|
| `needsV1` | This workflow loops ({{cycle}}) but does not set executionOrder "v1", so the loop order is undefined. |
