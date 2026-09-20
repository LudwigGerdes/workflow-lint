# naming/external-node-name-format

Nodes that call an external service should be named "<VERB> <Resource> - <Purpose>".

|  |  |
|---|---|
| Department | `naming` |
| Class | `stylistic` (advisory; needs `--fail-on-stylistic` to fail a run) |
| Recommended | `warn` |
| Fixable | no |

## Options

```json
{
  "type": "object",
  "properties": {
    "pattern": {
      "type": "string"
    }
  }
}
```

## Messages

| Message ID | Template |
|---|---|
| `format` | Node "{{name}}" calls an external service; name it to match {{pattern}}. |
