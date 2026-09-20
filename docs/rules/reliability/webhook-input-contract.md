# reliability/webhook-input-contract

A webhook takes input from outside; validate its shape up front and reject what does not fit.

|  |  |
|---|---|
| Department | `reliability` |
| Class | `quality` |
| Recommended | `info` |
| Fixable | no |

## Messages

| Message ID | Template |
|---|---|
| `noContract` | Webhook "{{name}}" accepts its payload without checking it; validate the required fields and stop on bad input. |
