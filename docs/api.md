# Writing your own rules

The package has three entry points. All are ESM and ship their own types.

| Import | Use it for |
|---|---|
| `workflow-lint/core` | Writing rules and building tools: `lint`, `resolveConfig`, `parseWorkflow`, `LintGraph`, `Fixer`, and the `Rule`, `RuleContext` and `Finding` types |
| `workflow-lint/rule-tester` | `RuleTester`, a fixture runner for rules. It needs `vitest`, which is an optional peer dependency |
| `workflow-lint` | `buildProgram()` and the reporters, for embedding the CLI |

## A rule

A rule is a `meta` block and a `create` function that returns handlers for selectors.

```js
const rule = {
  meta: {
    id: 'acme/no-http-request',
    type: 'problem',
    class: 'quality',
    fixable: null,
    docs: { description: 'Acme forbids raw HTTP Request nodes.', recommended: 'error' },
    messages: { found: 'HTTP Request node "{{name}}" is not allowed.' },
  },
  create: (ctx) => ({
    'Node[type="n8n-nodes-base.httpRequest"]': (node) =>
      ctx.report({ node, messageId: 'found', data: { name: node.name } }),
  }),
};
```

## Selectors

| Selector | Fires for |
|---|---|
| `Workflow` | The workflow, before its nodes |
| `Workflow:exit` | The workflow, after everything else |
| `Node` | Every node |
| `Connection` | Every connection |
| `StickyNote` | Every sticky note |

Filter by attribute with a string or a regular expression:

```text
Node[type="n8n-nodes-base.if"]
Node[type=/Trigger$/]
```

## Running it

The CLI does not load third-party rules from the config file yet. Run them through the API:

```js
import { readFileSync } from 'node:fs';
import { lint, resolveConfig } from 'workflow-lint/core';

const config = resolveConfig(
  { settings: { n8nVersion: '2.38.3' }, rules: { [rule.meta.id]: 'error' } },
  new Map([[rule.meta.id, rule]]),
);

const path = 'workflow.json';
const { findings } = await lint({ text: readFileSync(path, 'utf8'), path }, config);
```

## Testing it

```js
import { RuleTester } from 'workflow-lint/rule-tester';

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [{ workflow: workflowWithoutHttpNodes }],
  invalid: [{ workflow: workflowWithHttpNode, errors: [{ messageId: 'found' }] }],
});
```

`workflow` is a workflow object or a path to a JSON file. A case that supplies `output` must produce that document under `--fix` and lint clean afterwards.
