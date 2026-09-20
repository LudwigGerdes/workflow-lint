import { describe, it, expect } from 'vitest';
import { lint, resolveConfig, type Rule } from 'workflow-lint-core';
import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../src/rules/typeversion-policy.js';
import { wf } from './helpers/wf.js';

const node = (type: string, typeVersion: number, parameters: Record<string, unknown> = {}) => ({
  name: 'Node Under Test',
  type,
  typeVersion,
  parameters,
});

const SET = 'n8n-nodes-base.set';
const PINNED = { n8nVersion: '2.38.3' };

new RuleTester({ settings: PINNED }).run(rule, {
  valid: [
    { name: 'current version', workflow: wf([node(SET, 3.5)]) },
    { name: 'lag within maxLag', workflow: wf([node(SET, 3.3)]), options: { maxLag: 1 } },
    {
      name: 'deprecated allowed by option',
      workflow: wf([node('n8n-nodes-base.airtable', 1)]),
      // airtable@1 is also two versions behind 2.2; allow that so only deprecation is under test.
      options: { allowDeprecated: true, maxLag: 2 },
    },
    { name: 'unknown node type is left to n8n/valid', workflow: wf([node('n8n-nodes-base.nope', 1)]) },
  ],
  invalid: [
    {
      name: 'outdated beyond maxLag is bumped to the default',
      workflow: wf([node(SET, 3.2)]),
      options: { maxLag: 1 },
      errors: [{ messageId: 'outdated', nodeName: 'Node Under Test', data: { lag: 2, defaultVersion: 3.5 } }],
      output: wf([node(SET, 3.5)]),
    },
    {
      name: 'deprecated version',
      workflow: wf([node('n8n-nodes-base.airtable', 1)]),
      options: { maxLag: 2 },
      errors: [{ messageId: 'deprecated', nodeName: 'Node Under Test' }],
    },
    {
      name: 'unpinned n8n version downgrades to a single note',
      workflow: wf([node(SET, 3.1)]),
      settings: {},
      errors: [{ messageId: 'unpinnedNote' }],
    },
  ],
});

describe('typeversion-policy fix safety', () => {
  const config = resolveConfig(
    { settings: PINNED, rules: { 'n8n/typeversion-policy': 'warn' } },
    new Map<string, Rule>([[rule.meta.id, rule]]),
  );

  it('withholds the bump when it would introduce a parameter issue', async () => {
    // mySql@1 validates with no parameters, but 2.5 requires "table".
    const text = JSON.stringify(wf([node('n8n-nodes-base.mySql', 1)]), null, 2);
    const res = await lint({ text, path: 'w.json' }, config, { fix: true, fixUnsafe: true });
    expect(res.findings.map((f) => f.messageId).sort()).toEqual(['deprecated', 'outdated']);
    expect(res.findings.find((f) => f.messageId === 'outdated')?.fix).toBeUndefined();
    expect(res.fixedJson!.nodes[0]!.typeVersion).toBe(1);
  });

  it('applies the bump when both versions validate', async () => {
    const text = JSON.stringify(wf([node(SET, 3.1)]), null, 2);
    const res = await lint({ text, path: 'w.json' }, config, { fix: true, fixUnsafe: true });
    expect(res.fixedJson!.nodes[0]!.typeVersion).toBe(3.5);
  });

  it('does not apply an unsafe fix without --fix-unsafe', async () => {
    const text = JSON.stringify(wf([node(SET, 3.1)]), null, 2);
    const res = await lint({ text, path: 'w.json' }, config, { fix: true });
    expect(res.fixedJson!.nodes[0]!.typeVersion).toBe(3.1);
  });
});
