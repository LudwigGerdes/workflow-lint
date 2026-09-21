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

This reports eleven findings, each with its line, severity and rule. Then apply the safe fixes, which leaves seven:

```bash
npx workflow-lint lint order-sync.json --fix
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
