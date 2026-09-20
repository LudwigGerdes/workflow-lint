# Bundled n8n node descriptions

Each `<version>/` directory here holds the node descriptions for one n8n
release, used by workflow-lint to validate node parameters and `typeVersion`s
offline:

| File | Contents |
|---|---|
| `base.json` | `dist/types/nodes.json` from the `n8n-nodes-base` package, verbatim |
| `langchain.json` | `dist/types/nodes.json` from the `@n8n/n8n-nodes-langchain` package, verbatim |
| `meta.json` | The n8n app version, the exact library versions it pins, and when the bundle was built |

`meta.json` names the source packages and versions for each bundle (for the
shipped `2.38.3`: `n8n-nodes-base@2.38.1` and `@n8n/n8n-nodes-langchain@2.38.1`).

**Regenerating:** `pnpm --filter workflow-lint-node-types bundle <n8nVersion>`
(`scripts/bundle.ts`) resolves that n8n release's dependency pins from the npm
registry, downloads the two tarballs, verifies their sha512 integrity, and
extracts only `nodes.json`. It is the same code path as
`workflow-lint node-types install`, so a shipped bundle and an installed one are
identical.

## License

These files are the work of **n8n GmbH** and are distributed under the
[n8n Sustainable Use License](https://github.com/n8n-io/n8n/blob/master/LICENSE.md).
They are **not** covered by this repository's MIT license. The vendor names
and icon references inside them are trademarks of their respective owners.
workflow-lint is not affiliated with n8n GmbH.

## Running without them

workflow-lint runs without this directory: all commands that do not need node
descriptions work as normal, and `lint`/`fmt` fail with one clear error naming
the install command (`workflow-lint node-types install <version>`) instead of
crashing. Bundles installed that way live in `~/.workflow-lint/node-types/<version>/`
(override the root with `WORKFLOW_LINT_HOME`) and are found before anything in this
directory. `packages/node-types/test/no-bundle.test.ts` covers the no-data case.
