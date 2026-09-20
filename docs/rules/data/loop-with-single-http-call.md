# data/loop-with-single-http-call

A loop whose body is one HTTP call is usually a batch endpoint waiting to be used.

|  |  |
|---|---|
| Department | `data` |
| Class | `quality` |
| Recommended | `info` |
| Fixable | no |

## Messages

| Message ID | Template |
|---|---|
| `batchCandidate` | Loop "{{loop}}" exists only to call "{{http}}" once per item; check whether the API takes a batch. |
