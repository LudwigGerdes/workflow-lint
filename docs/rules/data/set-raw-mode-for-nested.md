# data/set-raw-mode-for-nested

Building a nested structure field by field is easier to read as one raw JSON payload.

|  |  |
|---|---|
| Department | `data` |
| Class | `quality` |
| Recommended | `info` |
| Fixable | no |

## Messages

| Message ID | Template |
|---|---|
| `useRawMode` | Set node "{{name}}" assigns nested data to "{{field}}"; raw mode with jsonOutput reads better. |
