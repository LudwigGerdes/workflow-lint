import type { Rule } from './types.js';

export const departmentOf = (ruleId: string): string => ruleId.split('/')[0] ?? ruleId;

/** Path of a rule's generated documentation, relative to the docs root. */
export const ruleDocPath = (rule: Rule): string =>
  `${departmentOf(rule.meta.id)}/${rule.meta.id.split('/').slice(1).join('/')}.md`;

const fixableLabel = (rule: Rule): string =>
  rule.meta.fixable === null
    ? 'no'
    : `\`${rule.meta.fixable}\` (${rule.meta.fixSafety ?? 'safe'})`;

/** Render one rule's reference page from its metadata alone. */
export function renderRuleDoc(rule: Rule): string {
  const { meta } = rule;
  const lines: string[] = [
    `# ${meta.id}`,
    '',
    meta.docs.description,
    '',
    '|  |  |',
    '|---|---|',
    `| Department | \`${departmentOf(meta.id)}\` |`,
    `| Class | \`${meta.class}\`${meta.class === 'stylistic' ? ' (advisory; needs `--fail-on-stylistic` to fail a run)' : ''} |`,
    `| Recommended | ${meta.docs.recommended === false ? 'off' : `\`${meta.docs.recommended}\``} |`,
    `| Fixable | ${fixableLabel(rule)} |`,
    '',
  ];

  if (meta.schema !== undefined) {
    lines.push('## Options', '', '```json', JSON.stringify(meta.schema, null, 2), '```', '');
  }

  const messages = Object.entries(meta.messages);
  if (messages.length > 0) {
    lines.push('## Messages', '', '| Message ID | Template |', '|---|---|');
    for (const [id, template] of messages) lines.push(`| \`${id}\` | ${template} |`);
    lines.push('');
  }

  return lines.join('\n');
}

/** Render the index grouping every rule by department. */
export function renderRuleIndex(rules: Rule[]): string {
  const byDepartment = new Map<string, Rule[]>();
  for (const rule of rules) {
    const department = departmentOf(rule.meta.id);
    byDepartment.set(department, [...(byDepartment.get(department) ?? []), rule]);
  }

  const lines: string[] = [
    '# Rules',
    '',
    `Generated from rule metadata by \`pnpm docs:rules\` — ${rules.length} rules.`,
    '',
  ];
  for (const department of [...byDepartment.keys()].sort()) {
    const group = byDepartment.get(department)!.sort((a, b) => a.meta.id.localeCompare(b.meta.id));
    lines.push(
      `## ${department}`,
      '',
      '| Rule | Class | Recommended | Fixable | Description |',
      '|---|---|---|---|---|',
    );
    for (const rule of group) {
      const level = rule.meta.docs.recommended === false ? 'off' : rule.meta.docs.recommended;
      lines.push(
        `| [\`${rule.meta.id}\`](./${ruleDocPath(rule)}) | \`${rule.meta.class}\` | \`${level}\` | ${fixableLabel(rule)} | ${rule.meta.docs.description} |`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}
