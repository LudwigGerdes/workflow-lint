# n8n/typeversion-drift

A node must not use a typeVersion newer than the target n8n; it imports cleanly and fails at run time.

|  |  |
|---|---|
| Department | `n8n` |
| Class | `quality` |
| Recommended | `error` |
| Fixable | no |

## Messages

| Message ID | Template |
|---|---|
| `unknownVersion` | Node "{{name}}" uses typeVersion {{version}}, which the target n8n {{n8nVersion}} does not know. It will import and then fail at run time. |
| `newerThanTarget` | Node "{{name}}" uses typeVersion {{version}}, newer than the default {{defaultVersion}} on the target n8n {{n8nVersion}}. |
