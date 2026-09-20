# Conformance tests

workflow-lint exposes two small APIs that other tools may build on: the node-type
bundle and the SourceMap adapter. The tests in `conformance/` are the
executable definition of those contracts: a consumer copies them **verbatim**
into its own repo and runs them against the version it resolves. A failure
there means the two sides disagree about the contract, which is exactly what
the tests exist to catch.

Run them with the rest of the suite (`pnpm test`) or on their own:

```bash
pnpm --filter workflow-lint-conformance test
```

| Test | Contract | Asserts |
|---|---|---|
| `conformance/node-types.test.ts` | node-type bundle (`workflow-lint-node-types`) | `bundledVersions`, `resolveVersion` exact and inexact, `set@3.4` defaults name "Edit Fields", `versionsOf('n8n-nodes-base.set')` exact list, `airtable@1` deprecated and `@2.1` not, unknown type → `undefined` / throws, langchain nodes under full names, `loadEntries` raw entries |
| `conformance/sourcemap.test.ts` | SourceMap adapter (`workflow-lint-core`) | `createSourceMapAdapter().nodeLine()` returns known line/column for a fixture, `undefined` for an absent node, and `undefined` rather than a throw for an unreadable file or malformed JSON |

## Changing a contract

A contract may have consumers outside this repo, so a change is not a local
edit: change the code and this test together, and call the change out in the
pull request. Copying a consumer's expectation back into this repo to make a
build pass defeats the point.

## For consumers

Copy the test file and the fixture beside it into your repo, import
`workflow-lint-node-types` or `workflow-lint-core`, and run it in your CI.
