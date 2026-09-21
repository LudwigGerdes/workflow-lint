# Changelog

All notable changes to workflow-lint are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- `n8n/typeversion-policy`: the note shown when no n8n version is pinned said version findings "were reported as information only". They are withheld; the message now says so, and names `--n8n-version`.
- A mistyped command such as `workflow-lint lnt` reports `unknown command "lnt"` with the list of commands. It used to be treated as a path and answer `no such file or directory`.
- MCP: the `json` argument of the three workflow tools is declared as an object or a string in the tool schema. It had no type, which a strict client could reject.

### Changed

- The GitHub Action runs the published npm package (`npx workflow-lint@<version of the action's checkout>`). It no longer installs pnpm and builds from source.
- The starter config written by `init` links to the rule reference online.
- README cut down to description, installation, getting started and core usage; the reference moved to `docs/` (`cli.md`, `configuration.md`, `integrations.md`, `api.md`, `faq.md`).
- README: the npm quickstart downloads a sample workflow so it runs as pasted, and says how npm users invoke the recipes. `pnpm demo` prints the exact commands it runs, `--n8n-version` included.

## 0.1.0 — 2026-09-20

First public release: 31 rules across seven departments, safe and unsafe
autofixes, stylish / JSON / SARIF / JUnit / GitHub Actions reporters, a
baseline, the `fmt` layout formatter, a pre-commit recipe, a composite GitHub
Action and a stdio MCP server. Bundles n8n 2.38.3 node descriptions.

### Changed
- **Node >= 24 is now required.** The install-level smoke test found that plain
  `npm install` fails on Node 20, because `n8n-workflow` 2.38 pulls in the native
  module `isolated-vm` 7, which supports Node 24 and newer only.

### Changed

- **One npm package.** `workflow-lint` now contains everything: the CLI, the
  MCP server (bin `workflow-lint-mcp`), the internal libraries (bundled with
  esbuild) and the n8n 2.38.3 node descriptions (`versions/`), so it installs
  from its tarball and lints offline straight away. `workflow-lint-core`,
  `-fmt`, `-plugin-n8n`, `-plugin-standards`, `-node-types` and `-mcp` are
  private workspace packages and are not published. Before this, installing
  the packed CLI failed with E404 on those names.
- The checkout path of the MCP server is `packages/cli/dist/mcp.js` (was
  `packages/mcp/dist/bin.js`). `packages/cli/dist/bin.js` is unchanged.
- The published manifest no longer declares `nanoid`, which nothing imported.

### Added

- Subpath exports with types: `workflow-lint/core` (engine and rule types) and
  `workflow-lint/rule-tester` (`RuleTester`; `vitest` is an optional peer).
  They share one module instance with the CLI.
- `scripts/smoke.sh` / `pnpm smoke`: an install-level acceptance test over a
  fresh clone and over the packed tarball installed into an empty project; a
  `smoke` CI job runs it on Linux and macOS, Node 24 and 26, followed by
  `publint` and `@arethetypeswrong/cli`.
- `node-types list --json` reports `dirs`, the directory each version was found
  in. `WORKFLOW_LINT_DATA_DIR` overrides where shipped bundles are looked up.
- `packages/cli/test/dist-deps.test.ts`: the bundle may import only declared
  dependencies, and every declared dependency must be imported.

### Fixed

- `lint` and `fmt` report a file named on the command line (or stdin) that is
  valid JSON but not a workflow, as one `parse-error` finding with exit 2,
  instead of printing nothing and exiting 0. Directory scans still skip such
  files.
- MCP `lint_workflow` returns `isError: true` with the parse error as the
  message for a document that is not a workflow, instead of an all-zero
  summary with the problem in a `parseErrors` array. A `json` argument given
  as a string is parsed first.
- `pnpm demo` pins the shipped n8n version (2.38.3) and diffs the fixture
  bundles, so no section fails on a version that does not ship.

### Added

- `--version` / `-V`, read from `packages/cli/package.json`.
- `docs/demo/order-sync.json`, the workflow the demo lints, so the quickstart
  has a committed file to run on.
- Community files: CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue and pull
  request templates.

### Changed

- README rewritten around a quickstart that works from a checkout.
