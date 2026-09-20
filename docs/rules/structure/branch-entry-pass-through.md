# structure/branch-entry-pass-through

Each branch of an IF, Switch or loop should open with a named pass-through, so the branch is labelled and its data shape is explicit.

|  |  |
|---|---|
| Department | `structure` |
| Class | `quality` |
| Recommended | `warn` |
| Fixable | no |

## Messages

| Message ID | Template |
|---|---|
| `missingPassThrough` | Branch {{output}} of "{{source}}" goes straight into "{{name}}"; open it with a NoOp or a pass-through Set. |
| `setWithoutInclude` | Pass-through Set "{{name}}" on branch {{output}} of "{{source}}" does not set includeOtherFields, so it drops the incoming data. |
