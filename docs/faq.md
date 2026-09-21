# FAQ and compatibility

## Compatibility

| | Supported |
|---|---|
| n8n | Node descriptions for 2.38.3 ship in the package. It is also the default when no version is pinned |
| Other n8n versions | `workflow-lint node-types install <version>` |
| n8n 1.x workflows | They lint. Install the matching version for exact `typeVersion` findings |
| Node.js | 24 or newer |

## Questions

### Does it change my workflow?

Only when you ask.

| Command | Writes to the file |
|---|---|
| `lint` | No |
| `lint --fix` | Yes, safe fixes only |
| `lint --fix-unsafe` | Yes, including fixes that may change behaviour |
| `fmt` | Yes, node positions and JSON formatting |
| `fmt --check` | No |

### Does it need my n8n instance?

No. Every command is static and works offline. The MCP server can read from one n8n instance if you give it an API key. Nothing else contacts anything.

### Which n8n versions does it support?

Node descriptions for 2.38.3 ship in the package, and `node-types install <version>` fetches others. Pin `settings.n8nVersion`, or findings that depend on the version are withheld.

### Why did a rule fire?

`workflow-lint rules` lists every rule with its level and a one-line reason. Each rule has a page under [Rules](https://workflowtools.dev/workflow-lint/rules) with its options and what `--fix` does. Over MCP, `explain_rule` returns the same page.

### What does it not check?

- The contents of expressions. `{{ $jsn.body.id }}` is not flagged as a typo.
- Code inside Code nodes.
- Whether credentials are valid.
- Anything that needs the workflow to run.

### Why is my `data.json` file suddenly an error?

You named it on the command line. A directory scan skips JSON files that are not workflows, but a file passed by name is always checked, so a hook cannot pass by accident. Point the hook at your workflow folder instead.

### Why does Node.js 20 not work?

workflow-lint parses workflows with n8n's own `n8n-workflow` package. That package depends on a native module that supports Node.js 24 and newer only.

## Alternatives

| Alternative | Use it instead when |
|---|---|
| n8n's own validation | You only need "will it import". It checks parameters and connections in the editor, and needs a running instance |
| n8n-mcp `validate_*` tools | Your AI agent already runs n8n-mcp and you want validation inside that loop |
| [n8nlint](https://github.com/jan-nikolov/n8nlint) | You want a small CLI focused on runtime-bug patterns, such as a Merge inside a batch loop |
| [FlowLint](https://github.com/Replikanti/flowlint-core) | Its rule set or its library API fits your setup better |
| A JSON Schema check | You need nothing more than the shape of the export |
| Hand review | Always, for the judgement calls. workflow-lint covers the mechanical checks so review time goes on design |

## Limitations

- Every finding of a rule has that rule's severity. A rule cannot report one finding as `info` and another as `warn`.
- The CLI cannot load third-party rules from the config file. Run them through the [API](https://workflowtools.dev/workflow-lint/api).
