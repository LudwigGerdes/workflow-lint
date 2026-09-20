import type { Rule } from 'workflow-lint-core';
import type { INode } from 'n8n-workflow';

export const rule: Rule = {
  meta: {
    id: 'naming/no-default-node-name',
    type: 'suggestion',
    class: 'stylistic',
    fixable: null,
    docs: {
      description:
        'Every node must have a descriptive name, not the type default (Set, Code, HTTP Request, …).',
      recommended: 'warn',
    },
    schema: { type: 'object', properties: { allowTriggers: { type: 'boolean' } } },
    messages: {
      defaultName: 'Node "{{name}}" still has its default name; rename it to describe what it does.',
    },
  },
  create(ctx) {
    const { allowTriggers = true } = (ctx.options ?? {}) as { allowTriggers?: boolean };
    return {
      Node(node) {
        const n = node as INode;
        if (allowTriggers && ctx.n8n.isTrigger(n)) return;
        if (ctx.n8n.isDefaultName(n)) {
          ctx.report({ node: n, messageId: 'defaultName', data: { name: n.name } });
        }
      },
    };
  },
};
