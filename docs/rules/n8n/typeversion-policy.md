# n8n/typeversion-policy

Nodes should run a typeVersion the target n8n knows, close to current, and not deprecated.

|  |  |
|---|---|
| Department | `n8n` |
| Class | `quality` |
| Recommended | `warn` |
| Fixable | `params` (unsafe) |

## Options

```json
{
  "type": "object",
  "properties": {
    "maxLag": {
      "type": "number"
    },
    "allowDeprecated": {
      "type": "boolean"
    }
  }
}
```

## Messages

| Message ID | Template |
|---|---|
| `outdated` | Node "{{name}}" uses typeVersion {{version}}; the current version is {{defaultVersion}}. |
| `deprecated` | Node "{{name}}" uses deprecated typeVersion {{version}}. |
| `unpinnedNote` | No n8n version is pinned, so version findings were reported as information only; set settings.n8nVersion to enforce them. |
