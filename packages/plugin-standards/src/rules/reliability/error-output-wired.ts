import type { Rule } from 'workflow-lint-core';
import type { INode } from 'n8n-workflow';
import { errorOutputIndex } from '../../util/outputs.js';

export const rule: Rule = {
  meta: {
    id: 'reliability/error-output-wired',
    type: 'problem',
    class: 'quality',
    fixable: null,
    docs: {
      description:
        'A node routing failures to its error output must have that output connected, or failures vanish.',
      recommended: 'warn',
    },
    messages: {
      unwired:
        'Node "{{name}}" sends failures to its error output, but that output is not connected.',
    },
  },
  create(ctx) {
    return {
      Node(target) {
        const node = target as INode;
        if (node.onError !== 'continueErrorOutput') return;
        const index = errorOutputIndex(ctx.n8n.nodeType(node));
        const wired = ctx.graph
          .outgoing(node.name)
          .some((e) => e.type === 'main' && e.output === index);
        if (!wired) ctx.report({ node, messageId: 'unwired', data: { name: node.name } });
      },
    };
  },
};
