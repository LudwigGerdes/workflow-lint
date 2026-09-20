import { describe, it, expect } from 'vitest';
import { renderRuleDoc, renderRuleIndex, ruleDocPath } from '../src/rule-docs.js';
import type { Rule } from '../src/types.js';

const rule: Rule = {
  meta: {
    id: 'naming/sample-rule',
    type: 'suggestion',
    class: 'stylistic',
    fixable: 'params',
    fixSafety: 'safe',
    docs: { description: 'A sample rule.', recommended: 'warn' },
    schema: { type: 'object', properties: { flag: { type: 'boolean' } } },
    messages: { sample: 'Node "{{name}}" is a sample.' },
  },
  create: () => ({}),
};

const bare: Rule = {
  meta: {
    id: 'layout/formatted',
    type: 'suggestion',
    class: 'stylistic',
    fixable: null,
    docs: { description: 'Layout matches the formatter.', recommended: false },
    messages: {},
  },
  create: () => ({}),
};

describe('rule docs', () => {
  it('renders a page from metadata alone', () => {
    expect(renderRuleDoc(rule)).toBe(
      `# naming/sample-rule

A sample rule.

|  |  |
|---|---|
| Department | \`naming\` |
| Class | \`stylistic\` (advisory; needs \`--fail-on-stylistic\` to fail a run) |
| Recommended | \`warn\` |
| Fixable | \`params\` (safe) |

## Options

\`\`\`json
{
  "type": "object",
  "properties": {
    "flag": {
      "type": "boolean"
    }
  }
}
\`\`\`

## Messages

| Message ID | Template |
|---|---|
| \`sample\` | Node "{{name}}" is a sample. |
`,
    );
  });

  it('omits optional sections and reports an off default', () => {
    const out = renderRuleDoc(bare);
    expect(out).toContain('| Recommended | off |');
    expect(out).toContain('| Fixable | no |');
    expect(out).not.toContain('## Options');
    expect(out).not.toContain('## Messages');
  });

  it('derives the doc path from the rule id', () => {
    expect(ruleDocPath(rule)).toBe('naming/sample-rule.md');
  });

  it('groups the index by department', () => {
    const index = renderRuleIndex([bare, rule]);
    expect(index).toContain('2 rules');
    expect(index.indexOf('## layout')).toBeLessThan(index.indexOf('## naming'));
    expect(index).toContain('[`naming/sample-rule`](./naming/sample-rule.md)');
  });
});
