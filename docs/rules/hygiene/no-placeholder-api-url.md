# hygiene/no-placeholder-api-url

Placeholder endpoints and stand-in nodes must not reach a finished workflow.

|  |  |
|---|---|
| Department | `hygiene` |
| Class | `quality` |
| Recommended | `warn` |
| Fixable | no |

## Messages

| Message ID | Template |
|---|---|
| `placeholderUrl` | Node "{{name}}" still points at the placeholder URL "{{url}}". |
| `setAsApiPlaceholder` | Set node "{{name}}" is named like an API call; it is standing in for a request that was never built. |
