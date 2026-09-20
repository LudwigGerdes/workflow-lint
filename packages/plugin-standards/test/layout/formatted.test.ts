import { describe, it, expect } from 'vitest';
import { RuleTester } from 'workflow-lint-core/rule-tester';
import { resolveConfig, type Rule } from 'workflow-lint-core';
import { rule } from '../../src/rules/layout/formatted.js';
import { rules as allRules } from '../../src/index.js';
import type { WorkflowJson } from 'workflow-lint-core';

const at = (position: [number, number]) => ({
  name: 'Trigger',
  type: 'n8n-nodes-base.manualTrigger',
  typeVersion: 1,
  position,
  parameters: {},
});
const setAt = (position: [number, number]) => ({
  name: 'Shape Payload',
  type: 'n8n-nodes-base.set',
  typeVersion: 3.4,
  position,
  parameters: {},
});
const wf = (nodes: object[]): WorkflowJson =>
  ({
    nodes,
    connections: { Trigger: { main: [[{ node: 'Shape Payload', type: 'main', index: 0 }]] } },
    settings: {},
  }) as unknown as WorkflowJson;

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    { name: 'already laid out', workflow: wf([at([0, 192]), setAt([192, 192])]) },
  ],
  invalid: [
    {
      name: 'off the grid',
      workflow: wf([at([13, 47]), setAt([900, 600])]),
      // The entry node is preserved, so only the follower moves — and it is
      // off on both axes, which is now reported as two distinct principles.
      errors: [
        { messageId: 'spacing', data: { count: 1 } },
        { messageId: 'alignment', data: { count: 1 } },
      ],
      output: wf([at([13, 47]), setAt([205, 47])]),
    },
    {
      name: 'a single node out of place',
      workflow: wf([at([0, 192]), setAt([192, 500])]),
      // Correct horizontal gap, wrong row: alignment alone.
      errors: [{ messageId: 'alignment', data: { count: 1 } }],
      output: wf([at([0, 192]), setAt([192, 192])]),
    },
  ],
});

describe('layout/formatted', () => {
  it('is not part of the recommended preset', () => {
    const registry = new Map<string, Rule>(allRules.map((r) => [r.meta.id, r]));
    const config = resolveConfig({ extends: ['workflow-lint:recommended'] }, registry);
    expect(config.rules.has('layout/formatted')).toBe(false);
  });

  it('is enabled when asked for explicitly', () => {
    const registry = new Map<string, Rule>(allRules.map((r) => [r.meta.id, r]));
    const config = resolveConfig({ rules: { 'layout/formatted': 'warn' } }, registry);
    expect(config.rules.get('layout/formatted')?.severity).toBe('warn');
  });
});
