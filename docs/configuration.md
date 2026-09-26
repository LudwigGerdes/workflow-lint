# Configuration

`workflow-lint init` writes `workflow-lint.config.yaml` with every block commented. Without a config file, `lint` uses the `workflow-lint:recommended` preset.

The config is found the way `.gitignore` is: the nearest `workflow-lint.config.yaml`, `.yml` or `.json` at or above the working directory. Run the linter from `flows/billing/` and it uses the repo's config. The nearest file wins; a parent's is not merged in. `--config <path>` names a file instead. The CLI, `fmt`, the GitHub Action and the MCP server all read the same file the same way.

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

## Sharing a config

`extends` takes presets, local files and npm packages, in any mix. Each entry is applied in order and the file's own settings come last.

```yaml
extends:
  - ../shared/workflow-lint.base.yaml   # relative to this file
  - "@acme/workflow-lint-config"        # an npm package
  - workflow-lint:production            # a preset
```

A shareable package is a module whose default export is a config object, or a package whose `main` is a YAML file:

```js
// @acme/workflow-lint-config/index.js
export default {
  plugins: ['@acme/workflow-lint-plugin'],
  departments: { hygiene: 'error' },
};
```

Maps (`settings`, `departments`, `rules`, `fix`) merge key by key; lists (`ignore`, `overrides`, `plugins`) append. Relative paths inside an extended file resolve against that file.

## Plugins

`plugins` loads rules written against the [API](https://workflowtools.dev/workflow-lint/api). An entry is a local module, resolved against the config file, or an npm package. Its rules become available under their own ids.

```yaml
plugins:
  - ./tools/lint-rules/index.mjs
  - "@acme/workflow-lint-plugin"

rules:
  acme/no-http-request: error
```

A plugin module exports `rules` and, optionally, `presets`:

```js
export const rules = [noHttpRequest, approvedCredentialsOnly];
export const presets = {
  'acme:strict': (registry) => ({ rules: { 'acme/no-http-request': 'error' } }),
};
```

`extends: [acme:strict]` then works like a built-in preset, and `workflow-lint rules` lists the plugin's rules with the rest. A rule id that is already registered is an error, not an override.

## Presets

| Preset | What it does |
|---|---|
| `workflow-lint:recommended` | Runs each rule at its own default level |
| `workflow-lint:production` | Raises `n8n/valid`, `hygiene/no-inline-secrets` and `reliability/http-retry-config` to error, raises `reliability/webhook-input-contract` to warn, and turns on `reliability/error-workflow-configured` |
| `workflow-lint:strict` | Raises every rule to error |

## Pin your n8n version

Set `settings.n8nVersion`, or pass `--n8n-version`.

- Without a pinned version, findings that depend on the n8n version are withheld, and `n8n/typeversion-policy` says so on every run.
- If the pinned version is not installed, lint continues against the nearest version it has and names it on stderr. Run `workflow-lint node-types install <version>` for exact results.

## Suppressing a finding

n8n workflows have no comments, so directives go in a node's **Notes** field. They can also be the first line of a sticky note, which then covers every node inside the sticky's bounds.

```text
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
