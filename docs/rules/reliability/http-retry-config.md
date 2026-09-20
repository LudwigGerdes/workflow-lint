# reliability/http-retry-config

Calls that cross the network should retry, with a real gap between attempts.

|  |  |
|---|---|
| Department | `reliability` |
| Class | `quality` |
| Recommended | `warn` |
| Fixable | `params` (safe) |

## Options

```json
{
  "type": "object",
  "properties": {
    "minTries": {
      "type": "number"
    },
    "minWait": {
      "type": "number"
    }
  }
}
```

## Messages

| Message ID | Template |
|---|---|
| `noRetry` | Node "{{name}}" calls out over the network but does not retry on failure. |
| `tooFewTries` | Node "{{name}}" retries only {{actual}} times; use at least {{minTries}}. |
| `waitTooShort` | Node "{{name}}" waits {{actual}}ms between retries; use at least {{minWait}}ms. |
