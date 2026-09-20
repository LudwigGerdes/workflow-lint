# hygiene/no-inline-secrets

Secrets belong in credentials or $env, never inline in a workflow.

|  |  |
|---|---|
| Department | `hygiene` |
| Class | `quality` |
| Recommended | `error` |
| Fixable | no |

## Options

```json
{
  "type": "object",
  "properties": {
    "denylist": {
      "type": "array"
    }
  }
}
```

## Messages

| Message ID | Template |
|---|---|
| `secret` | Node "{{name}}" has what looks like a secret in "{{parameter}}"; move it into a credential or $env. |
