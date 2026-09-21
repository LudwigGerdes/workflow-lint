# Command line

| Command | What it does |
|---|---|
| `workflow-lint lint [paths...]` | Lint workflow JSON files. Defaults to `.`; `-` reads stdin |
| `workflow-lint fmt [paths...]` | Format the canvas layout |
| `workflow-lint init` | Write a starter `workflow-lint.config.yaml` |
| `workflow-lint rules [--json]` | List every rule |
| `workflow-lint node-types list [--json]` | List bundled and installed n8n versions |
| `workflow-lint node-types install <version>` | Install the node descriptions of another n8n version |
| `workflow-lint node-types diff <a> <b>` | Compare two installed n8n versions |
| `workflow-lint fleet <manifest> [--full]` | Build per-directory n8n version settings from a manifest |
| `workflow-lint --version` | Print the version |

A bare path is treated as `lint`, so `workflow-lint workflows/` lints that folder. Every command has `--help`.

## `lint`

```bash
workflow-lint lint                           # every workflow under the current directory
workflow-lint lint workflows/ orders.json
workflow-lint lint --fix                     # apply safe fixes in place
workflow-lint lint --format json
curl -s "$N8N/api/v1/workflows/42" | workflow-lint lint -
```

An n8n API response (`{ "data": { … } }`) is accepted wherever a workflow export is.

### Options

| Option | Meaning |
|---|---|
| `--config <path>` | Use this config file instead of the discovered `workflow-lint.config.yaml` |
| `--n8n-version <v>` | n8n version to lint against. Overrides `settings.n8nVersion` |
| `--format <f>` | `stylish` (default), `json`, `sarif`, `junit`, `github-actions`, `canvas-overlay` |
| `--fail-on <level>` | Lowest severity that fails the run: `info`, `warn` or `error` (default) |
| `--max-warnings <n>` | Fail when warnings exceed this count |
| `--quiet` | Report errors only |
| `--fix` | Apply safe fixes |
| `--fix-unsafe` | Also apply fixes that may change behaviour |
| `--fix-type <types>` | Limit fixes to `params`, `layout` or `connections` (comma-separated) |
| `--require-fixable-clean` | Fail when a finding remains that `--fix` could resolve |
| `--rule <id>` | Run only this rule. Repeatable |
| `--class <class>` | Run only `stylistic` or `quality` rules |
| `--fail-on-stylistic` | Let stylistic findings fail the run. By default they never do |
| `--gen-baseline` | Record current findings as the accepted baseline |
| `--ignore-baseline` | Report every finding, baselined or not |
| `--baseline <path>` | Baseline file. Defaults to `.workflow-lint-baseline.yaml` |
| `-l`, `--list-different` | Print only the paths of files that fail |
| `--no-ignore` | Also lint files ignored by the config or `.gitignore` |
| `--no-error-on-unmatched-pattern` | Skip paths that do not exist instead of failing |
| `--log-level <level>` | `silent`, `error`, `warn`, `log` (default) or `debug` |

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Clean |
| `1` | Findings at or above `--fail-on`, or more warnings than `--max-warnings` |
| `2` | Usage error, or a file that will not parse |

### What counts as a workflow

- A JSON object with a `nodes` array, or an n8n API response with `data.nodes`.
- A directory scan takes every `*.json` file and skips the ones that are not workflows. It also skips `node_modules`, `package*.json`, `tsconfig*.json`, `*.config.json`, anything in `.gitignore` and anything in the config's `ignore` list.
- A file you name explicitly is never skipped. If it is not a workflow, that is an error, so a hook or CI job cannot pass having checked nothing.

## Fixing

| Flag | Applies |
|---|---|
| `--fix` | Safe fixes: renaming a decision node to end in `?` (connections and expressions follow), setting `includeOtherFields` on a pass-through Set, adding a retry block to an HTTP node |
| `--fix-unsafe` | Also fixes that may change behaviour. Today that is the `typeVersion` bump, applied only when the node validates before and after |

Fixes re-run until the file stops changing.

![Linting a workflow against a pinned n8n version, then the --fix-unsafe diff](https://raw.githubusercontent.com/LudwigGerdes/workflow-lint/main/docs/images/workflow-lint-shot-2.png)

## `fmt`

```bash
workflow-lint fmt                  # lay out every workflow under here
workflow-lint fmt --check          # exit 1 if anything would change; writes nothing
workflow-lint fmt -l               # only the paths that would change
workflow-lint fmt --stickies       # also resize sticky notes around their nodes
```

What it does:

- Keeps every entry node where you put it and lays out everything downstream relative to it.
- Places columns on a 192-pixel grid.
- Spreads the arms of an IF or Switch evenly around the decision.
- Centres converging paths between their inputs.
- Hangs sub-nodes below the node they feed.
- Leaves alone anything it does not recognise, such as loop bodies.
- Rewrites the file as two-space-indented JSON with a trailing newline.

Formatting the same file twice changes nothing. The same diff is available as the lint rule `layout/formatted`, which is off by default.

`fmt` accepts `--n8n-version`, `--log-level`, `--no-ignore` and `--no-error-on-unmatched-pattern`, with the same meaning as in `lint`.

## Reporters

| `--format` | Use it for |
|---|---|
| `stylish` | Reading at a terminal. The default |
| `json` | Scripts. Each finding has `ruleId`, `messageId`, `nodeId`, `loc` and `data` |
| `sarif` | GitHub code scanning. Suggested fixes are included |
| `junit` | GitLab and most CI runners |
| `github-actions` | Inline annotations on a pull request, with no upload step |
| `canvas-overlay` | Per-node badges for a canvas renderer. Reserved; nothing renders it yet |

## Node-type bundles

The node descriptions for n8n 2.38.3 ship in the package. Install others on demand:

```bash
workflow-lint node-types list
workflow-lint node-types install 2.36.8
```

- Installed versions live in `~/.workflow-lint/node-types/<version>/`. Set `WORKFLOW_LINT_HOME` to move that folder.
- `install` downloads from the npm registry and checks each file against the registry's sha512 hash.
- `install` is the only CLI command that uses the network.

Compare two installed versions:

```bash
workflow-lint node-types diff 2.36.8 2.38.3
workflow-lint node-types diff 2.36.8 2.38.3 --format md --only n8n-nodes-base.httpRequest
```

The diff lists nodes added, removed or hidden, new `typeVersion`s, and property changes.
