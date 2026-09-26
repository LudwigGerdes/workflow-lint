import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const CONFIG_FILE = 'workflow-lint.config.yaml';

/**
 * The generated config leans on comments rather than defaults, so the file
 * documents what can be set without changing behaviour until it is edited.
 */
const TEMPLATE = `# workflow-lint configuration. Rules: https://workflowtools.dev/workflow-lint/rules
extends:
  - workflow-lint:recommended
# Also a local file (./shared/base.yaml) or an npm package (@acme/workflow-lint-config).

# Rules of your own: a local module or an npm package exporting \`rules\`.
# See https://workflowtools.dev/workflow-lint/api
# plugins:
#   - ./tools/lint-rules/index.mjs

# Pin the n8n version to lint against. Without it, version-sensitive findings
# are withheld, since the target instance is unknown.
# settings:
#   n8nVersion: 2.38.3

# Files never to lint, in .gitignore syntax. Your .gitignore is honoured too,
# so gitignored scratch such as local/ stays out of a repo-wide run. Naming a
# file explicitly still lints it — workflow-lint local/thing.json — which is how you
# check a local workflow before promoting it. --no-ignore lints everything.
#
# Prefer --gen-baseline when the goal is to quiet findings you already have:
# a baseline keeps watching for NEW ones, where ignore stops looking entirely.
#
# The object form records why. Reasons are optional, but workflow-lint counts the
# suppressions that lack one, so a stale exception stays visible.
# ignore:
#   - "**/*.generated.json"
#   - path: "workflows/vendor/**"
#     reason: "vendor-shipped, regenerated on upgrade"

# Set a whole department at once.
# Departments: n8n, naming, structure, reliability, data, hygiene, layout.
# departments:
#   hygiene: error

# Individual rules win over their department. A rule may take options.
# rules:
#   naming/external-node-name-format: off
#   naming/no-default-node-name: [error, { allowTriggers: false }]

# Overrides apply in order, after everything above. Match on file globs, or on
# the workflow's own tags or name.
# overrides:
#   - files: ["workflows/legacy/**"]
#     reason: "pre-standards, frozen until rewritten"
#     departments:
#       naming: off
#   - workflows:
#       tags: [experimental]
#     rules:
#       hygiene/no-placeholder-api-url: off
`;

export interface InitDeps {
  write: (text: string) => void;
  writeErr: (text: string) => void;
  cwd: string;
}

export async function runInit(deps: InitDeps): Promise<number> {
  const path = join(deps.cwd, CONFIG_FILE);
  if (existsSync(path)) {
    deps.writeErr(`workflow-lint: ${CONFIG_FILE} already exists\n`);
    return 2;
  }
  await writeFile(path, TEMPLATE, 'utf8');
  deps.write(`Created ${CONFIG_FILE}\n`);
  return 0;
}
