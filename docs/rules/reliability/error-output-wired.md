# reliability/error-output-wired

A node routing failures to its error output must have that output connected, or failures vanish.

|  |  |
|---|---|
| Department | `reliability` |
| Class | `quality` |
| Recommended | `warn` |
| Fixable | no |

## Messages

| Message ID | Template |
|---|---|
| `unwired` | Node "{{name}}" sends failures to its error output, but that output is not connected. |
