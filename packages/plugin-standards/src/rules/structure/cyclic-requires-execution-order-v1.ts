import type { Rule } from 'workflow-lint-core';

export const rule: Rule = {
  meta: {
    id: 'structure/cyclic-requires-execution-order-v1',
    type: 'problem',
    class: 'quality',
    fixable: 'params',
    fixSafety: 'safe',
    docs: {
      description: 'A workflow containing a loop must run under executionOrder v1.',
      recommended: 'error',
    },
    messages: {
      needsV1:
        'This workflow loops ({{cycle}}) but does not set executionOrder "v1", so the loop order is undefined.',
    },
  },
  create(ctx) {
    return {
      'Workflow:exit'() {
        const cycles = ctx.graph.cycles();
        if (cycles.length === 0) return;
        if (ctx.workflow.json.settings?.['executionOrder'] === 'v1') return;
        ctx.report({
          workflow: true,
          messageId: 'needsV1',
          data: { cycle: cycles[0]!.join(' -> ') },
          fix: (f) => f.setSetting('executionOrder', 'v1'),
        });
      },
    };
  },
};
