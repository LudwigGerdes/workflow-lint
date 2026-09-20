# data/batch-response-not-split

Reaching into a response array by index processes one element and drops the rest; split it out instead.

|  |  |
|---|---|
| Department | `data` |
| Class | `quality` |
| Recommended | `warn` |
| Fixable | no |

## Messages

| Message ID | Template |
|---|---|
| `arrayIndexed` | Node "{{consumer}}" reads "{{field}}" from "{{http}}" by index, so only one element is processed; use a Split Out. |
