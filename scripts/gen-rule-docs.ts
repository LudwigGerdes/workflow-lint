// Regenerate docs/rules from rule metadata: `pnpm docs:rules`.
// The rules are the source of truth; these pages are derived, never edited.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { renderRuleDoc, renderRuleIndex, ruleDocPath } from 'workflow-lint-core';
import { rules as n8nRules } from 'workflow-lint-plugin-n8n';
import { rules as standardsRules } from 'workflow-lint-plugin-standards';

const rules = [...n8nRules, ...standardsRules].sort((a, b) =>
  a.meta.id.localeCompare(b.meta.id),
);

const root = join(process.cwd(), 'docs', 'rules');
rmSync(root, { recursive: true, force: true });

for (const rule of rules) {
  const path = join(root, ruleDocPath(rule));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderRuleDoc(rule));
}
writeFileSync(join(root, 'README.md'), renderRuleIndex(rules));

console.log(`wrote ${rules.length} rule pages to docs/rules`);
