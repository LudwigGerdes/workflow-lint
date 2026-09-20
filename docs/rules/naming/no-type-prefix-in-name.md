# naming/no-type-prefix-in-name

Node names should describe intent, not restate the node type; Switch branches need output keys.

|  |  |
|---|---|
| Department | `naming` |
| Class | `stylistic` (advisory; needs `--fail-on-stylistic` to fail a run) |
| Recommended | `warn` |
| Fixable | `connections` (safe) |

## Options

```json
{
  "type": "object",
  "properties": {
    "requireSwitchOutputKeys": {
      "type": "boolean"
    }
  }
}
```

## Messages

| Message ID | Template |
|---|---|
| `prefix` | Node "{{name}}" restates its type; drop the "{{prefix}}" prefix. |
| `switchOutputKey` | Switch "{{name}}" branch {{index}} has no output key, so its branch is unnamed. |
