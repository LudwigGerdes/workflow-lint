# reliability/error-path-has-alert

An error path must reach someone: a notification, a log, or Stop and Error, before it rejoins the main flow.

|  |  |
|---|---|
| Department | `reliability` |
| Class | `quality` |
| Recommended | `warn` |
| Fixable | no |

## Messages

| Message ID | Template |
|---|---|
| `noAlert` | The error path from "{{name}}" rejoins the main flow without notifying anyone or stopping the run. |
