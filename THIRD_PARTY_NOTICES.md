# Third-party notices

workflow-lint itself is MIT-licensed (see [LICENSE](./LICENSE)). The following
third-party material is used or redistributed under its own terms, which the
MIT license of this repository does not alter.

## n8n (n8n GmbH) — Sustainable Use License

- **Node description bundles** in `packages/node-types/versions/<version>/`
  (`base.json`, `langchain.json`) are extracted verbatim from the published
  `n8n-nodes-base` and `@n8n/n8n-nodes-langchain` npm packages. They are n8n
  GmbH's work, distributed under the
  [n8n Sustainable Use License](https://github.com/n8n-io/n8n/blob/master/LICENSE.md),
  and are **not** covered by this repository's MIT license. See
  `packages/node-types/versions/README.md`.
- **`n8n-workflow`** is a runtime dependency (installed from npm by
  `pnpm install`, not vendored). It and its `@n8n/*` transitive packages are
  likewise under the n8n Sustainable Use License.

workflow-lint is not affiliated with, endorsed by, or sponsored by n8n GmbH. "n8n"
is a trademark of n8n GmbH. Vendor names and icons that appear inside the node
descriptions are trademarks of their respective owners.

## Other direct dependencies

All other direct dependencies are under MIT, ISC, or similarly permissive
licenses. Of note:

- **glob** — BlueOak-1.0.0 (permissive).

Run `pnpm licenses list` in a checkout for the full transitive inventory.
