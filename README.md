# workflow-lint

[![CI](https://github.com/LudwigGerdes/workflow-lint/actions/workflows/ci.yml/badge.svg)](https://github.com/LudwigGerdes/workflow-lint/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/workflow-lint.svg)](https://www.npmjs.com/package/workflow-lint)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Catch the mistakes in an n8n workflow before it runs: a node still called "HTTP Request", a placeholder URL, an API call with no retry, a Set node that drops its input. workflow-lint reports each one on the line where it lives and fixes the ones that have a safe fix. It runs from the terminal, a pre-commit hook, CI, or an AI agent over MCP.

![workflow-lint reporting eleven findings on a workflow, then --fix leaving seven](https://raw.githubusercontent.com/LudwigGerdes/workflow-lint/main/docs/demo/quickstart.gif)

## Installation

Requires Node.js 24 or newer.

Run it without installing:

```bash
npx workflow-lint --help
```

Add it to a project:

```bash
npm install --save-dev workflow-lint
```

Build from source:

```bash
git clone https://github.com/LudwigGerdes/workflow-lint.git
cd workflow-lint
pnpm install && pnpm build
```

## Getting started

Download a sample workflow that has several things wrong with it, and lint it:

```bash
curl -LO https://raw.githubusercontent.com/LudwigGerdes/workflow-lint/main/docs/demo/order-sync.json
npx workflow-lint lint order-sync.json
```

**Expected output:**

```text
order-sync.json
  1:1   warn   n8n/typeversion-policy                           No n8n version is pinned, so typeVersion findings were withheld; set settings.n8nVersion or pass --n8n-version to check them.
  4:5   info   reliability/webhook-input-contract               Webhook "Order Received" accepts its payload without checking it; validate the required fields and stop on bad input.
  17:5  warn   naming/decision-node-question-mark               Decision node "Is Valid" should be phrased as a question ending in "?".
  27:5  warn   hygiene/no-placeholder-api-url                   Node "HTTP Request" still points at the placeholder URL "https://api.example.com/orders".
  27:5  warn   naming/external-node-name-format                 Node "HTTP Request" calls an external service; name it to match ^(GET|POST|PUT|PATCH|DELETE|UPSERT) .+ - .+$.
  27:5  warn   naming/no-default-node-name                      Node "HTTP Request" still has its default name; rename it to describe what it does.
  27:5  warn   reliability/http-retry-config                    Node "HTTP Request" calls out over the network but does not retry on failure.
  27:5  warn   structure/branch-entry-pass-through              Branch 0 of "Is Valid" goes straight into "HTTP Request"; open it with a NoOp or a pass-through Set.
  40:5  warn   naming/no-default-node-name                      Node "Edit Fields" still has its default name; rename it to describe what it does.
  40:5  warn   structure/branch-entry-pass-through              Pass-through Set "Edit Fields" on branch 1 of "Is Valid" does not set includeOtherFields, so it drops the incoming data.
  40:5  error  structure/set-pass-through-include-other-fields  Pass-through Set "Edit Fields" assigns nothing and does not set includeOtherFields, so it emits empty items.

x 11 problems (1 error, 9 warnings, 1 info)  3 fixable with --fix
```

Apply the safe fixes:

```bash
npx workflow-lint lint order-sync.json --fix
```

**Expected output:**

```text
order-sync.json
  1:1   warn  n8n/typeversion-policy               No n8n version is pinned, so typeVersion findings were withheld; set settings.n8nVersion or pass --n8n-version to check them.
  4:5   info  reliability/webhook-input-contract   Webhook "Order Received" accepts its payload without checking it; validate the required fields and stop on bad input.
  27:5  warn  hygiene/no-placeholder-api-url       Node "HTTP Request" still points at the placeholder URL "https://api.example.com/orders".
  27:5  warn  naming/external-node-name-format     Node "HTTP Request" calls an external service; name it to match ^(GET|POST|PUT|PATCH|DELETE|UPSERT) .+ - .+$.
  27:5  warn  naming/no-default-node-name          Node "HTTP Request" still has its default name; rename it to describe what it does.
  27:5  warn  structure/branch-entry-pass-through  Branch 0 of "Is Valid?" goes straight into "HTTP Request"; open it with a NoOp or a pass-through Set.
  43:5  warn  naming/no-default-node-name          Node "Edit Fields" still has its default name; rename it to describe what it does.

x 7 problems (0 errors, 6 warnings, 1 info)
```

To use a workflow of your own, open it in n8n and choose **Download** from the `…` menu.

## Usage

Lint every workflow under the current directory:

```bash
workflow-lint lint
```

Fix what can be fixed safely:

```bash
workflow-lint lint --fix
```

Tidy the canvas layout:

```bash
workflow-lint fmt
```

Write a config file, where you pin your n8n version and switch rules on or off:

```bash
workflow-lint init
```

**Expected output:**

```text
Created workflow-lint.config.yaml
```

Adopt it on an existing repository by accepting today's findings and failing only on new ones:

```bash
workflow-lint lint --gen-baseline
```

Report in a format your CI understands:

```bash
workflow-lint lint --format sarif
```

## Documentation

Full documentation is at [workflowtools.dev/workflow-lint](https://workflowtools.dev/workflow-lint/):

- [Command line](https://workflowtools.dev/workflow-lint/cli)
- [Rules](https://workflowtools.dev/workflow-lint/rules)
- [Configuration](https://workflowtools.dev/workflow-lint/configuration)
- [Pre-commit, GitHub Actions and MCP](https://workflowtools.dev/workflow-lint/integrations)
- [Writing your own rules](https://workflowtools.dev/workflow-lint/api)
- [FAQ and compatibility](https://workflowtools.dev/workflow-lint/faq)

## License

[MIT](LICENSE) © Ludwig Gerdes

Bundled n8n node descriptions are covered by [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Not affiliated with n8n GmbH.
