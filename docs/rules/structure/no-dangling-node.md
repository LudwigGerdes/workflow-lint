# structure/no-dangling-node

A path that stops short while the workflow carries on elsewhere is abandoned work.

|  |  |
|---|---|
| Department | `structure` |
| Class | `quality` |
| Recommended | `warn` |
| Fixable | no |

## Options

```json
{
  "type": "object",
  "properties": {
    "terminalTypes": {
      "type": "array"
    }
  }
}
```

## Messages

| Message ID | Template |
|---|---|
| `dangling` | Node "{{name}}" stops here while the workflow continues elsewhere; its output goes nowhere. |
