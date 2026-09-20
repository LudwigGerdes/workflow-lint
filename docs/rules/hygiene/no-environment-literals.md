# hygiene/no-environment-literals

Environment names and hosts baked into a workflow have to be edited by hand to promote it; use $env.

|  |  |
|---|---|
| Department | `hygiene` |
| Class | `quality` |
| Recommended | `warn` |
| Fixable | no |

## Options

```json
{
  "type": "object",
  "properties": {
    "patterns": {
      "type": "array"
    },
    "urlHosts": {
      "type": "boolean"
    }
  }
}
```

## Messages

| Message ID | Template |
|---|---|
| `envLiteral` | Node "{{name}}" names an environment in "{{parameter}}" ("{{match}}"); read it from $env instead. |
| `hardcodedHost` | Node "{{name}}" hardcodes host "{{host}}", which is parameterised elsewhere in this workflow; use $env here too. |
