# reliability/webhook-responds-early

A webhook should answer before doing slow work, or the caller waits for the whole run.

|  |  |
|---|---|
| Department | `reliability` |
| Class | `quality` |
| Recommended | `warn` |
| Fixable | no |

## Messages

| Message ID | Template |
|---|---|
| `heavyBeforeRespond` | Webhook "{{webhook}}" makes the caller wait for "{{heavy}}" before replying; respond first, then do the work. |
