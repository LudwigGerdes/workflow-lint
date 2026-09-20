# data/code-node-multi-field

A Code node that only assembles several unrelated fields is doing a Set node's job, less visibly.

|  |  |
|---|---|
| Department | `data` |
| Class | `quality` |
| Recommended | `warn` |
| Fixable | no |

## Options

```json
{
  "type": "object",
  "properties": {
    "maxFields": {
      "type": "number"
    }
  }
}
```

## Messages

| Message ID | Template |
|---|---|
| `independentFields` | Code node "{{name}}" returns {{count}} independent fields; a Set node would make them visible on the canvas. |
