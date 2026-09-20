# Rules

Generated from rule metadata by `pnpm docs:rules` — 31 rules.

## data

| Rule | Class | Recommended | Fixable | Description |
|---|---|---|---|---|
| [`data/batch-response-not-split`](./data/batch-response-not-split.md) | `quality` | `warn` | no | Reaching into a response array by index processes one element and drops the rest; split it out instead. |
| [`data/code-node-multi-field`](./data/code-node-multi-field.md) | `quality` | `warn` | no | A Code node that only assembles several unrelated fields is doing a Set node's job, less visibly. |
| [`data/loop-with-single-http-call`](./data/loop-with-single-http-call.md) | `quality` | `info` | no | A loop whose body is one HTTP call is usually a batch endpoint waiting to be used. |
| [`data/set-raw-mode-for-nested`](./data/set-raw-mode-for-nested.md) | `quality` | `info` | no | Building a nested structure field by field is easier to read as one raw JSON payload. |

## hygiene

| Rule | Class | Recommended | Fixable | Description |
|---|---|---|---|---|
| [`hygiene/no-environment-literals`](./hygiene/no-environment-literals.md) | `quality` | `warn` | no | Environment names and hosts baked into a workflow have to be edited by hand to promote it; use $env. |
| [`hygiene/no-inline-secrets`](./hygiene/no-inline-secrets.md) | `quality` | `error` | no | Secrets belong in credentials or $env, never inline in a workflow. |
| [`hygiene/no-placeholder-api-url`](./hygiene/no-placeholder-api-url.md) | `quality` | `warn` | no | Placeholder endpoints and stand-in nodes must not reach a finished workflow. |

## layout

| Rule | Class | Recommended | Fixable | Description |
|---|---|---|---|---|
| [`layout/formatted`](./layout/formatted.md) | `stylistic` | `off` | `layout` (safe) | Node positions should match what `workflow-lint fmt` would produce. |

## n8n

| Rule | Class | Recommended | Fixable | Description |
|---|---|---|---|---|
| [`n8n/typeversion-drift`](./n8n/typeversion-drift.md) | `quality` | `error` | no | A node must not use a typeVersion newer than the target n8n; it imports cleanly and fails at run time. |
| [`n8n/typeversion-policy`](./n8n/typeversion-policy.md) | `quality` | `warn` | `params` (unsafe) | Nodes should run a typeVersion the target n8n knows, close to current, and not deprecated. |
| [`n8n/valid`](./n8n/valid.md) | `quality` | `error` | no | Semantic checks n8n itself would make: unknown types, parameter issues, wiring and agent configuration. |

## naming

| Rule | Class | Recommended | Fixable | Description |
|---|---|---|---|---|
| [`naming/agent-tool-snake-case`](./naming/agent-tool-snake-case.md) | `quality` | `warn` | `params` (safe) | Tool names are passed to the model as identifiers, so they must be snake_case. |
| [`naming/decision-node-question-mark`](./naming/decision-node-question-mark.md) | `stylistic` | `warn` | `connections` (safe) | IF and Filter nodes should be named as the question they answer, ending in "?". |
| [`naming/external-node-name-format`](./naming/external-node-name-format.md) | `stylistic` | `warn` | no | Nodes that call an external service should be named "<VERB> <Resource> - <Purpose>". |
| [`naming/no-default-node-name`](./naming/no-default-node-name.md) | `stylistic` | `warn` | no | Every node must have a descriptive name, not the type default (Set, Code, HTTP Request, …). |
| [`naming/no-type-prefix-in-name`](./naming/no-type-prefix-in-name.md) | `stylistic` | `warn` | `connections` (safe) | Node names should describe intent, not restate the node type; Switch branches need output keys. |

## reliability

| Rule | Class | Recommended | Fixable | Description |
|---|---|---|---|---|
| [`reliability/continue-on-fail-only-terminal`](./reliability/continue-on-fail-only-terminal.md) | `quality` | `warn` | no | Swallowing a failure is only safe at the end of a path; mid-flow it feeds bad data downstream. |
| [`reliability/error-output-wired`](./reliability/error-output-wired.md) | `quality` | `warn` | no | A node routing failures to its error output must have that output connected, or failures vanish. |
| [`reliability/error-path-has-alert`](./reliability/error-path-has-alert.md) | `quality` | `warn` | no | An error path must reach someone: a notification, a log, or Stop and Error, before it rejoins the main flow. |
| [`reliability/error-workflow-configured`](./reliability/error-workflow-configured.md) | `quality` | `off` | no | A production workflow needs an error workflow, or a failed run notifies nobody. |
| [`reliability/http-retry-config`](./reliability/http-retry-config.md) | `quality` | `warn` | `params` (safe) | Calls that cross the network should retry, with a real gap between attempts. |
| [`reliability/retry-respects-retry-after`](./reliability/retry-respects-retry-after.md) | `quality` | `info` | no | A retrying call should honour the API's Retry-After header rather than guessing a fixed delay. |
| [`reliability/webhook-input-contract`](./reliability/webhook-input-contract.md) | `quality` | `info` | no | A webhook takes input from outside; validate its shape up front and reject what does not fit. |
| [`reliability/webhook-responds-early`](./reliability/webhook-responds-early.md) | `quality` | `warn` | no | A webhook should answer before doing slow work, or the caller waits for the whole run. |

## structure

| Rule | Class | Recommended | Fixable | Description |
|---|---|---|---|---|
| [`structure/branch-entry-pass-through`](./structure/branch-entry-pass-through.md) | `quality` | `warn` | no | Each branch of an IF, Switch or loop should open with a named pass-through, so the branch is labelled and its data shape is explicit. |
| [`structure/cyclic-requires-execution-order-v1`](./structure/cyclic-requires-execution-order-v1.md) | `quality` | `error` | `params` (safe) | A workflow containing a loop must run under executionOrder v1. |
| [`structure/if-in-loop-reconverges`](./structure/if-in-loop-reconverges.md) | `quality` | `error` | no | A branch inside a loop must reconverge through a Merge before returning to the loop node, or iterations are lost. |
| [`structure/loop-iteration-guard`](./structure/loop-iteration-guard.md) | `quality` | `warn` | no | Every loop needs a bound: an item-driven SplitInBatches, or a decision node testing an attempt counter. |
| [`structure/merge-for-reconvergence`](./structure/merge-for-reconvergence.md) | `quality` | `error` | no | Two branches feeding one input of a non-Merge node run it twice; reconverge through a Merge instead. |
| [`structure/no-dangling-node`](./structure/no-dangling-node.md) | `quality` | `warn` | no | A path that stops short while the workflow carries on elsewhere is abandoned work. |
| [`structure/set-pass-through-include-other-fields`](./structure/set-pass-through-include-other-fields.md) | `quality` | `error` | `params` (safe) | A Set node that assigns nothing is a pass-through, and must set includeOtherFields or it emits empty items. |
