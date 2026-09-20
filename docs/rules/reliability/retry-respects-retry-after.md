# reliability/retry-respects-retry-after

A retrying call should honour the API's Retry-After header rather than guessing a fixed delay.

|  |  |
|---|---|
| Department | `reliability` |
| Class | `quality` |
| Recommended | `info` |
| Fixable | no |

## Messages

| Message ID | Template |
|---|---|
| `ignoresRetryAfter` | Node "{{name}}" retries on a fixed delay and never reads Retry-After, so it may keep hitting a rate limit. |
