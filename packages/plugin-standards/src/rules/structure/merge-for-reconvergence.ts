import type { Rule } from 'workflow-lint-core';
import type { INode } from 'n8n-workflow';
import { MERGE } from '../../node-types.js';

export const rule: Rule = {
  meta: {
    id: 'structure/merge-for-reconvergence',
    type: 'problem',
    class: 'quality',
    fixable: null,
    docs: {
      description:
        'Two branches feeding one input of a non-Merge node run it twice; reconverge through a Merge instead.',
      recommended: 'error',
    },
    messages: {
      multipleSources:
        'Node "{{name}}" receives input {{input}} from {{count}} branches ({{sources}}); reconverge them through a Merge.',
    },
  },
  create(ctx) {
    return {
      Node(target) {
        const node = target as INode;
        if (node.type === MERGE) return;

        const byInput = new Map<number, string[]>();
        for (const edge of ctx.graph.incoming(node.name)) {
          // Only main flow reconverges; several tools sharing an agent's
          // ai_tool input is normal and must not be reported.
          if (edge.type !== 'main') continue;
          byInput.set(edge.input, [...(byInput.get(edge.input) ?? []), edge.from]);
        }

        for (const [input, sources] of [...byInput.entries()].sort((a, b) => a[0] - b[0])) {
          if (sources.length > 1) {
            ctx.report({
              node,
              messageId: 'multipleSources',
              data: { name: node.name, input, count: sources.length, sources: sources.join(', ') },
            });
          }
        }
      },
    };
  },
};
