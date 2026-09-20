# Contributing to workflow-lint

Thanks for looking. This is a one-maintainer project, so small, focused pull
requests with tests land fastest. `AGENTS.md` is the detailed guide to the
codebase (layout, conventions, fixtures); this page is the short version.

## Prerequisites

- Node >= 24 (CI runs 24 and 26)
- pnpm 10 (`corepack enable` picks up the pinned version from `package.json`)

## The dev loop

```bash
pnpm install
pnpm verify        # build → typecheck → test; what CI runs
```

`build` must run before `typecheck`: the packages resolve each other's types
through their built `.d.ts`. Tests need no build — a `development` export
condition points them at source — so the inner loop is just `pnpm test`.

Build order follows the dependency chain: `node-types` → `core` →
`plugin-n8n`, `fmt` → `plugin-standards` → `mcp`, then `cli` last. `pnpm build`
handles it.

Only `packages/cli` is published, as `workflow-lint`; every other package is
`private` and is bundled into it by `packages/cli/build.mjs` (esbuild, one
invocation with code splitting so the CLI, the MCP server and the
`workflow-lint/core` / `workflow-lint/rule-tester` exports share one copy of
core). A new third-party import must be added to `packages/cli/package.json`
`dependencies` — `packages/cli/test/dist-deps.test.ts` fails otherwise.

`pnpm smoke` is the install-level acceptance test (`scripts/smoke.sh
[clone|npm|all]`): it clones the committed state and builds it, packs the
tarball, installs it into an empty project and runs what the README promises.
Run it before any change to packaging, entry points, data files or
dependencies. It tests the COMMITTED state on the clone path, so commit first.
Never make it pass by asserting less.

One package: `pnpm --filter workflow-lint-core test`. One file:
`pnpm --filter workflow-lint test cli.test`.

Run the CLI you just built: `node packages/cli/dist/bin.js lint <path>`.
`pnpm demo` is a narrated end-to-end tour on a deliberately flawed workflow.

## Adding a rule

1. Write the failing test first: `packages/plugin-standards/test/<department>/<rule>.test.ts`
   using `RuleTester` from `workflow-lint-core/rule-tester`. A case with `output`
   must both produce that document under `--fix` and lint clean afterwards.
2. Implement `packages/plugin-standards/src/<department>/<rule>.ts` (`meta` +
   `create(ctx)` returning selector handlers); register it in the plugin's
   `rules` array and, if it belongs in a preset, in `packages/core/src/presets.ts`.
3. `pnpm docs:rules` and commit the generated page under `docs/rules/`. CI
   fails if it drifts. Never edit `docs/rules/` by hand.

Rules that are purely about n8n's own validity go in `plugin-n8n`.

## Fixtures

Workflow fixtures are hand-written and synthetic: no `id`, `meta.instanceId`,
`versionId`, `webhookId`, credential references or real hostnames. Shared
ones live in `packages/core/test/fixtures/` and
`packages/plugin-standards/test/fixtures/`; the CLI's synthetic node-type
bundles are in `packages/cli/test/fixtures/workflow-lint-home/`.

The three `corpus.*` test files calibrate rules against a private set of
reference workflows and skip unless `WORKFLOW_LINT_CORPUS` is set. Contributors can
ignore them; never regenerate `corpus-baseline.yaml` to make a gate pass.

## Pull requests

- Tests for every behaviour change; `pnpm verify` green.
- Strict TypeScript: no `any`, prefer type guards over `as`.
- No network in tests; anything that fetches takes an injected `fetch`.
- Conventional commits (`fix(cli): …`, `feat(rules): …`, `docs: …`).
- Fill in the pull request template. Note anything a user would see in
  `CHANGELOG.md` under *Unreleased*.

By contributing you agree your work is released under the MIT license.
