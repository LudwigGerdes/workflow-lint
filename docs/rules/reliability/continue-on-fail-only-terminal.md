# reliability/continue-on-fail-only-terminal

Swallowing a failure is only safe at the end of a path; mid-flow it feeds bad data downstream.

|  |  |
|---|---|
| Department | `reliability` |
| Class | `quality` |
| Recommended | `warn` |
| Fixable | no |

## Messages

| Message ID | Template |
|---|---|
| `suppressedUpstream` | Node "{{name}}" continues on failure but feeds {{consumers}}, which will run on failed data. |
