# layout/formatted

Node positions should match what `workflow-lint fmt` would produce.

|  |  |
|---|---|
| Department | `layout` |
| Class | `stylistic` (advisory; needs `--fail-on-stylistic` to fail a run) |
| Recommended | off |
| Fixable | `layout` (safe) |

## Messages

| Message ID | Template |
|---|---|
| `spacing` | {{count}} node{{plural}} sit{{verb}} at the wrong horizontal gap from what it follows; run `workflow-lint fmt`. |
| `symmetry` | {{count}} branch arm{{plural}} {{isare}} not symmetric about the decision node; run `workflow-lint fmt`. |
| `alignment` | {{count}} node{{plural}} {{isare}} off its row, so parallel stages no longer line up; run `workflow-lint fmt`. |
| `subnode` | {{count}} sub-node{{plural}} {{isare}} not positioned under the node it feeds; run `workflow-lint fmt`. |
