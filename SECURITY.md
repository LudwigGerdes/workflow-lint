# Security

## Reporting a vulnerability

Report privately through GitHub's **Report a vulnerability** button on the
[Security tab](https://github.com/LudwigGerdes/workflow-lint/security/advisories/new)
of this repository. Please do not open a public issue for anything that could
be exploited before it is fixed.

Expect an acknowledgement within about a week. There is no bug bounty.

## What handles secrets

workflow-lint is offline by design. Two paths reach the network, and only one of
them carries a credential:

| Command or setting | Network | Credential |
|---|---|---|
| `workflow-lint node-types install <version>` | npm registry, read-only, sha512-verified | none |
| MCP server with `WORKFLOW_LINT_N8N_API_KEY` **and** `WORKFLOW_LINT_N8N_INSTANCE` set | the one pinned n8n instance | the API key, as the `X-N8N-API-KEY` header |

The API key is read from the environment, held in memory, and sent only to
the instance named in `WORKFLOW_LINT_N8N_INSTANCE`; a request naming any other
host is refused before it is made. Nothing writes the key to disk: the only
files workflow-lint creates are the node-type bundles under `~/.workflow-lint/`
(or `WORKFLOW_LINT_HOME`), `workflow-lint.config.yaml` from `init`, the baseline from
`--gen-baseline`, and workflows rewritten by `--fix` and `fmt`.

Every other command — `lint`, `fmt`, `init`, `rules`, `fleet`,
`node-types list|diff` — makes no network request and needs no credential.

## Supported versions

Only the latest release on `main` receives fixes.
