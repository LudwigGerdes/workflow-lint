import type { Rule } from 'workflow-lint-core';
import type { INode } from 'n8n-workflow';
import { FILTER, IF } from '../../node-types.js';

export const rule: Rule = {
  meta: {
    id: 'naming/decision-node-question-mark',
    type: 'suggestion',
    class: 'stylistic',
    fixable: 'connections',
    fixSafety: 'safe',
    docs: {
      description: 'IF and Filter nodes should be named as the question they answer, ending in "?".',
      recommended: 'warn',
    },
    messages: {
      questionMark: 'Decision node "{{name}}" should be phrased as a question ending in "?".',
    },
  },
  create(ctx) {
    return {
      Node(target) {
        const node = target as INode;
        if (node.type !== IF && node.type !== FILTER) return;
        if (node.name.trimEnd().endsWith('?')) return;
        ctx.report({
          node,
          messageId: 'questionMark',
          data: { name: node.name },
          // renameNode also rewrites connections and $('…') references.
          fix: (f) => f.renameNode(node.name, `${node.name.trimEnd()}?`),
        });
      },
    };
  },
};
