# naming/no-default-node-name

Every node must have a descriptive name, not the type default (Set, Code, HTTP Request, …).

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
    "allowTriggers": {
      "type": "boolean"
    }
  }
}
```

## Messages

| Message ID | Template |
|---|---|
| `defaultName` | Node "{{name}}" still has its default name; rename it to describe what it does. |
