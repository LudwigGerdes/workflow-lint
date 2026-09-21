# Configuration

`workflow-lint init` writes `workflow-lint.config.yaml` with every block commented. Without a config file, `lint` uses the `workflow-lint:recommended` preset.

```yaml
extends:
  - workflow-lint:recommended

settings:
  n8nVersion: 2.38.3

departments:
  hygiene: error

rules:
  naming/external-node-name-format: off
  naming/no-default-node-name: [error, { allowTriggers: false }]

ignore:
  - "**/*.generated.json"
  - path: "workflows/vendor/**"
    reason: "vendor-shipped, regenerated on upgrade"

overrides:
  - files: ["workflows/legacy/**"]
    reason: "pre-standards, frozen until rewritten"
    departments:
      naming: off
  - workflows:
      tags: [experimental]
    rules:
      hygiene/no-placeholder-api-url: off
```

An explicit rule setting beats its department's setting. Overrides apply last.

## Presets

| Preset | What it does |
|---|---|
| `workflow-lint:recommended` | Runs each rule at its own default level |
| `workflow-lint:production` | Raises `n8n/valid`, `hygiene/no-inline-secrets` and `reliability/http-retry-config` to error, raises `reliability/webhook-input-contract` to warn, and turns on `reliability/error-workflow-configured` |
| `workflow-lint:strict` | Raises every rule to error |

## Pin your n8n version

Set `settings.n8nVersion`, or pass `--n8n-version`.

- Without a pinned version, findings that depend on the n8n version are reported as information only, and `n8n/typeversion-policy` says so on every run.
- If the pinned version is not installed, lint continues against the nearest version it has and names it on stderr. Run `workflow-lint node-types install <version>` for exact results.

## Suppressing a finding

n8n workflows have no comments, so directives go in a node's **Notes** field. They can also be the first line of a sticky note, which then covers every node inside the sticky's bounds.

```
workflow-lint-disable naming/no-default-node-name -- renaming next sprint
workflow-lint-disable naming, structure/merge-for-reconvergence
workflow-lint-disable-file *
```

## Baseline

A baseline lets you adopt the linter on an existing repository without fixing everything first.

```bash
workflow-lint lint --gen-baseline    # accept what is there today
workflow-lint lint                   # from now on, only new findings fail
workflow-lint lint --ignore-baseline # see everything again
```

The baseline stores a count per file, node and rule. A second occurrence of an accepted rule on a new node is still reported.

## Several n8n instances in one repository

When one repository holds the workflows of several instances on different n8n versions, `workflow-lint fleet` turns a manifest into `overrides`, so each directory is linted against the version it runs on.

The manifest:

```json
{
  "n8nVersion": "2.38.3",
  "instances": [
    { "name": "dev", "directory": "dev" },
    { "name": "prod", "directory": "prod", "n8nVersion": "2.36.8" },
    { "name": "sandbox", "directory": "sandbox", "versionPolicy": "floating" }
  ]
}
```

The command:

```bash
workflow-lint fleet instances.json >> workflow-lint.config.yaml
```

What it appends:

```yaml
overrides:
  - files:
      - dev/**
    reason: targets the n8n running on dev
    settings:
      n8nVersion: 2.38.3
  - files:
      - prod/**
    reason: targets the n8n running on prod
    settings:
      n8nVersion: 2.36.8
```

- Extra fields in the manifest are ignored, so an existing deployment manifest can be passed as it is.
- An instance on a floating version is skipped and named on stderr.
- `--full` writes a complete config instead of only the `overrides` block.
