# structure/set-pass-through-include-other-fields

A Set node that assigns nothing is a pass-through, and must set includeOtherFields or it emits empty items.

|  |  |
|---|---|
| Department | `structure` |
| Class | `quality` |
| Recommended | `error` |
| Fixable | `params` (safe) |

## Messages

| Message ID | Template |
|---|---|
| `missingIncludeOtherFields` | Pass-through Set "{{name}}" assigns nothing and does not set includeOtherFields, so it emits empty items. |
| `nestedIncludeOtherFields` | Set "{{name}}" sets includeOtherFields inside options, where n8n ignores it; it belongs at the top level. |
