# Working on workflow-lint

workflow-lint is a semantic linter and layout formatter for n8n workflow JSON,
shaped like ESLint (rules, plugins, selectors, fixer, config) plus Prettier
(`fmt` owns layout) plus RuboCop (departments, baseline). It does not
reimplement n8n: parsing and node semantics come from the published
`n8n-workflow` package and a bundle of n8n's own node descriptions.

## Package layout

pnpm monorepo. **Exactly one package is published: `packages/cli`, as
`workflow-lint`.** Every other package is `"private": true` and is bundled into
it. Build order follows the dependency chain:

| Package | Holds |
|---|---|
| `packages/node-types` (`workflow-lint-node-types`) | Bundled `nodes.json` per n8n version, an `INodeTypes` registry, offline version resolution, `node-types install` fetch, the structural `diff` |
| `packages/core` | Parse + SourceMap, `LintGraph`, selectors, fixer, `RuleContext`, config, disables, baseline, `RuleTester` |
| `packages/plugin-n8n` | `n8n/valid`, `n8n/typeversion-policy`, `n8n/typeversion-drift` |
| `packages/plugin-standards` | The 27 `naming`, `structure`, `reliability`, `data` and `hygiene` rules |
| `packages/fmt` | Structure classification and layout; `format()`; `layout/formatted` |
| `packages/mcp` | stdio MCP server exposing lint/fix/format/list/explain (source only; shipped as the `workflow-lint-mcp` bin of `packages/cli`) |
| `packages/cli` (`workflow-lint`, **the published package**) | `workflow-lint lint \| fmt \| init \| rules \| node-types \| fleet`, reporters (`--format stylish \| json \| sarif \| junit \| github-actions \| canvas-overlay`); `build.mjs` produces the bundle |
| `conformance/` | Executable contract tests for the node-types and SourceMap APIs |

Root: `action.yml` (composite GitHub Action), `lefthook.yml` (pre-commit
recipe), `scripts/gen-rule-docs.ts` (generates `docs/rules/`), `scripts/demo.mjs`
(lints `docs/demo/order-sync.json`, a workflow that is wrong on purpose — keep
it that way; `lefthook.yml` excludes it), `docs/demo/quickstart.tape` (VHS
source for the README GIF).

## The published bundle

`packages/cli/build.mjs` runs after every library's `tsc` build:

- **Code:** one esbuild invocation (`platform: node`, `format: esm`,
  `target: node20`, sourcemaps, `splitting: true`) with five entry points —
  `bin` (CLI), `mcp` (MCP server bin, from `packages/mcp/src/bin.ts`), `index`,
  `core` and `rule-tester` — into `packages/cli/dist/`, shared code in
  `dist/chunks/`. One invocation with splitting is what makes the CLI, the MCP
  server and the `workflow-lint/core` export share a SINGLE module instance of
  core; never build an entry separately. Internal `workflow-lint-*` imports
  resolve to TypeScript source through the `development` export condition and
  are inlined; every third-party import stays external.
- **Dependencies:** the workspace libraries are root `devDependencies` (so
  `packages/cli` resolves them by walking up, and the published manifest never
  names them). Every third-party package any library imports is declared in
  `packages/cli/package.json` `dependencies` with the library's range;
  `packages/cli/test/dist-deps.test.ts` fails on an undeclared import and on an
  unused declaration. `n8n-workflow` must stay external (it is loaded with
  `createRequire` in `packages/core/src/n8n.ts` and resolves from the installed
  package's own `node_modules`). `vitest` is an optional peer, imported only by
  `dist/rule-tester.js`.
- **Types:** `rollup-plugin-dts` rolls the libraries' emitted declarations into
  `dist/{index,core,rule-tester}.d.ts` plus a shared chunk, mirroring the code
  split. A type from another library that appears in core's public API must be
  re-exported from `packages/core/src/index.ts` or the rollup fails.
- **Data and path lookups:** anything found on disk goes through
  `packages/node-types/src/package-root.ts`. `packageRoot(import.meta.url)` is
  the nearest `package.json` directory (used for `--version`); `dataRoot()` is
  THE resolver for shipped node-type bundles: `WORKFLOW_LINT_DATA_DIR`, else
  `<package root>/versions` (installed tarball; also the node-types package in
  source/tsc form), else `<package root>/../node-types/versions` (the bundle
  running from a checkout). Never count `..` from `import.meta.url`.
- **Packing:** `scripts/pack-files.mjs` (`prepack`/`postpack` of `packages/cli`)
  stages LICENSE, README.md, THIRD_PARTY_NOTICES.md and
  `packages/node-types/versions/` into `packages/cli/` (gitignored) and removes
  them afterwards. `files` is a whitelist: `dist`, `versions`,
  `THIRD_PARTY_NOTICES.md`. Pack with `pnpm pack`. Never run `npm publish` from
  an agent session.

`pnpm smoke` (`scripts/smoke.sh [clone|npm|all]`) is the install-level
acceptance test and the judge of all of the above: a fresh `git clone` of the
committed state is installed, built and exercised; then the tarball is installed
with npm into an empty project and the same quickstart runs through
`node_modules/.bin`, followed by the single-instance check, a third-party rule
through `workflow-lint/core`, a `tsc` type-check of the subpath exports and a
`RuleTester` run under the consumer's vitest. It uses temp dirs and an isolated
`HOME`/`WORKFLOW_LINT_HOME`. The clone path tests COMMITTED state — commit before
running. Never make it pass by asserting less.

## Prerequisites

- Node >= 24 (CI runs 24 and 26). `n8n-workflow` 2.38 depends, through `@n8n/expression-runtime`, on the native module `isolated-vm` 7, which supports Node 24 and newer only (prebuilt binaries for Node 24 and 26; it cannot build on Node 20). workflow-lint never loads that module, but npm has to install it, so Node 24 is the floor. n8n 2.38 itself needs Node 24 when run from npm, so this matches the platform.
- pnpm 10 (lockfile v9)

## Commands

```bash
pnpm install
pnpm build          # tsc in every package, dependency order
pnpm typecheck      # needs a prior build
pnpm test           # vitest across all packages; needs no build
pnpm verify         # build, then typecheck, then test
pnpm docs:rules     # regenerate docs/rules from rule metadata
pnpm demo           # runnable tour: lint, fix, fmt, reporters, baseline, MCP
pnpm smoke          # install-level acceptance test (needs a build; tests committed state)
```

`build` must precede `typecheck`: workspace packages resolve each other's
types through their built `.d.ts`. Tests bypass that through a `development`
export condition that points at source, so the test loop needs no rebuild.

One package: `pnpm --filter workflow-lint-core test`.

Every command listed by `workflow-lint --help` is public and documented in the
README; there are no hidden commands. `canvas-overlay` is a `--format`, not a
command. `--version` reads `packages/cli/package.json`.

Run the CLI from a checkout (after a build):

```bash
node packages/cli/dist/bin.js lint <path>
node packages/cli/dist/bin.js fmt --check <path>
node packages/cli/dist/bin.js node-types list
```

The MCP server is `node packages/cli/dist/mcp.js` (`action.yml` and
any pre-commit hook that runs the linter from a checkout depend on
`packages/cli/dist/bin.js` existing — keep that path).
The package is published to npm as `workflow-lint`; `pnpm smoke` proves every
build is installable from its tarball before it is released.

## CI

`.github/workflows/ci.yml` has a `smoke` job (Linux and macOS × Node 24 and 26:
build, `pnpm smoke`, then `publint --strict` and `attw --pack --profile
esm-only` on `packages/cli`) and a `verify` job that runs install, build, typecheck and test, then runs
the test suite a second time under `unshare -rn` (no network namespace at
all — the offline guarantee, enforced; Linux-only), and fails if
`pnpm docs:rules` leaves the tree dirty. Change a rule's `meta` and regenerate
the docs in the same commit.

## Conventions

- **Offline-first.** Every command works with no network. One n8n version's
  node descriptions ship in `packages/node-types/versions/`; any other is
  fetched only by the explicit `node-types install`. Tests never reach the
  network: anything that fetches takes an injected `fetch`.
- **Reuse n8n, don't reimplement.** Graph traversal, per-`typeVersion`
  parameter validation, default-name detection and connection typing come from
  `n8n-workflow` and the bundled descriptions. `@n8n/ai-workflow-builder.ee`
  is EE-licensed and not a dependency.
- **Static only.** The linter makes no judgement calls a static check cannot
  make deterministically.
- **Formatting is not linting.** Layout lives in `fmt`; `layout/formatted` only
  reports the diff `fmt` would make.
- Strict TypeScript (`strict`, `noUncheckedIndexedAccess`); no `any`; prefer
  type guards over `as`.
- TDD with vitest. Rules are tested with `RuleTester` from
  `workflow-lint-core/rule-tester` (published as `workflow-lint/rule-tester`) (a separate entry so importing the library never
  drags vitest into a production process).
- Rule IDs are `department/rule-name`. `docs/rules/` is generated from rule
  `meta` — never edit it by hand.
- `n8n-workflow`'s published ESM build does not load in Node (extensionless
  relative imports). All runtime use goes through `packages/core/src/n8n.ts`,
  which loads the CJS build via `createRequire`. Import runtime helpers from
  `workflow-lint-core`, never from `n8n-workflow` directly; `import type` is fine
  anywhere.
- MCP: tool logic is plain functions over injected deps in `handlers.ts`;
  `server.ts` only wires them to the SDK. Test the handlers, not the
  transport. Nothing in the MCP process may `console.log` (stdout carries
  protocol frames), and a tool result type must be a `type` alias, not an
  `interface`, or it will not assign to the SDK's result type.
- `action.yml` and `lefthook.yml` both pass `--no-error-on-unmatched-pattern`
  because staged-file lists contain paths deleted in the same commit.

## Adding a rule

1. Create `packages/plugin-standards/src/<department>/<rule-name>.ts` (or
   `plugin-n8n` for rules that are purely about n8n's own validity). A rule is
   `meta` plus `create(ctx)` returning selector handlers. Selectors are
   `Workflow`, `Workflow:exit`, `Node`, `Connection` and `StickyNote`, with
   attribute filters such as `Node[type="n8n-nodes-base.if"]` and
   `Node[type=/Trigger$/]`. Findings go through `ctx.report`; fixes are JSON
   patches built with the `Fixer`, marked safe or unsafe. n8n semantics are on
   `ctx.n8n`: `nodeType`, `parameterIssues`, `isDefaultName`, `isTrigger`,
   `isSubNode`, `isTool`, `versions`.
2. Register it in the plugin's `rules` array and, if it belongs in a preset,
   in the preset tables in `packages/core`.
3. Add `packages/plugin-standards/test/<department>/<rule-name>.test.ts` using
   `RuleTester`. A case supplying `output` must both produce that document
   under `--fix` and lint clean afterwards.
4. `pnpm docs:rules` and commit the generated page.

## Fixtures and goldens

- Rule fixtures are inline in each rule's test; shared workflow fixtures live
  in `packages/core/test/fixtures/` and `packages/plugin-standards/test/fixtures/`.
  They are hand-written: no `id`, `meta.instanceId`, `versionId`, `webhookId`
  or credential references.
- `packages/cli/test/fixtures/workflow-lint-home/` holds two tiny synthetic
  node-type bundles (`1.0.0`, `1.1.0`) used by the `node-types diff` CLI tests
  via `WORKFLOW_LINT_HOME`.
- `packages/cli/test/fixtures/corpus-baseline.yaml` is the golden baseline for
  the corpus tests (`packages/cli/test/corpus.*.test.ts`). The corpus itself is
  a private calibration set that is not in this repository; those suites are
  owner-only and skip unless `WORKFLOW_LINT_CORPUS` points at the corpus root.
  Contributors can ignore the three skipped files. When the corpus is present,
  regenerate the baseline with
  `UPDATE_CORPUS_BASELINE=1 pnpm --filter workflow-lint test corpus.golden`
  and review the diff — never regenerate to make CI green.
- `conformance/fixtures/` backs the conformance tests.

## Node-type bundles

`packages/node-types/versions/<version>/` holds n8n's node descriptions
(`base.json`, `langchain.json`, `meta.json`), extracted verbatim from the
`n8n-nodes-base` and `@n8n/n8n-nodes-langchain` npm packages. One version
ships (see `packages/node-types/versions/README.md` for its provenance and
license). Others are installed on demand into `~/.workflow-lint/node-types/<version>/`
(root overridable with `WORKFLOW_LINT_HOME`); the cache is searched before the
shipped copy. `resolveVersion` picks the exact version, else the nearest
older one, else the shipped one, and its note names the install command.

Tests pin `n8nVersion: '2.38.3'`, the shipped version. To change the shipped
version: delete `packages/node-types/versions/<old>`, run
`pnpm --filter workflow-lint-node-types bundle <new>`, and retarget the test pins
(n8n's defaults do move between versions).

**Without any bundle** (the `versions/` directory removed and nothing
installed) the tool does not crash: `lint` and `fmt` exit 2 with one error
naming `workflow-lint node-types install <version>`, and every other command works.
`packages/node-types/test/no-bundle.test.ts` covers it. Linting with node-type
rules skipped and the rest running is not implemented — the pack backs the
`Workflow` graph and every `ctx.n8n` helper, so that is a larger change.

## Do not

- Commit real n8n instance exports, API keys, instance URLs, or anything under
  `local/`. Fixtures are synthetic.
- Add network calls anywhere except `packages/node-types/src/fetch.ts`
  (`node-types install`) and the MCP server's pinned-instance fetch.
- Edit `docs/rules/` by hand.
- Regenerate `corpus-baseline.yaml` to make a failing gate pass.
- Modify the bundled `nodes.json` files; regenerate them with the bundle script.
- Import from `n8n-workflow` at runtime outside `packages/core/src/n8n.ts`.
