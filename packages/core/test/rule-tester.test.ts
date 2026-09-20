import { describe, it, expect } from 'vitest';
import type { INode } from 'n8n-workflow';
import { RuleTester } from '../src/rule-tester.js';
import type { Rule, WorkflowJson } from '../src/types.js';

/**
 * A fixable rule that stops reporting once fixed, so RuleTester can check both
 * the fix output and fix completeness.
 */
const setsOptionX: Rule = {
  meta: {
    id: 'test/sets-option-x',
    type: 'suggestion',
    fixable: 'params',
    fixSafety: 'safe',
    docs: { description: 'Set nodes must carry options.x = 1.', recommended: 'warn' },
    messages: { missing: 'Node "{{name}}" is missing options.x.' },
  },
  create(ctx) {
    return {
      'Node[type="n8n-nodes-base.set"]': (target) => {
        const n = target as INode;
        const options = n.parameters['options'] as { x?: number } | undefined;
        if (options?.x === 1) return;
        ctx.report({
          node: n,
          messageId: 'missing',
          data: { name: n.name },
          fix: (f) => f.setParameter(n.name, 'options.x', 1),
        });
      },
    };
  },
};

const wf = (parameters: Record<string, unknown>): WorkflowJson =>
  ({
    nodes: [
      {
        name: 'Edit Fields',
        type: 'n8n-nodes-base.set',
        typeVersion: 3.4,
        position: [0, 0],
        parameters,
      },
    ],
    connections: {},
  }) as unknown as WorkflowJson;

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(setsOptionX, {
  valid: [{ name: 'already has options.x', workflow: wf({ options: { x: 1 } }) }],
  invalid: [
    {
      name: 'missing options.x is reported and fixed',
      workflow: wf({}),
      errors: [{ messageId: 'missing', nodeName: 'Edit Fields', data: { name: 'Edit Fields' } }],
      output: wf({ options: { x: 1 } }),
    },
  ],
});

describe('RuleTester', () => {
  it('registers the rule id as the outer describe block', () => {
    expect(setsOptionX.meta.id).toBe('test/sets-option-x');
  });
});
