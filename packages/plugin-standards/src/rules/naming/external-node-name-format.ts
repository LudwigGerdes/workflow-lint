import type { Rule } from 'workflow-lint-core';
import type { INode } from 'n8n-workflow';
import { HTTP } from '../../node-types.js';

const DEFAULT_PATTERN = '^(GET|POST|PUT|PATCH|DELETE|UPSERT) .+ - .+$';

export const rule: Rule = {
  meta: {
    id: 'naming/external-node-name-format',
    type: 'suggestion',
    class: 'stylistic',
    fixable: null,
    docs: {
      description:
        'Nodes that call an external service should be named "<VERB> <Resource> - <Purpose>".',
      recommended: 'warn',
    },
    schema: { type: 'object', properties: { pattern: { type: 'string' } } },
    messages: {
      format: 'Node "{{name}}" calls an external service; name it to match {{pattern}}.',
    },
  },
  create(ctx) {
    const { pattern = DEFAULT_PATTERN } = (ctx.options ?? {}) as { pattern?: string };
    const re = new RegExp(pattern);
    return {
      Node(target) {
        const node = target as INode;
        const description = ctx.n8n.nodeType(node);
        if (!description) return;
        // Either the generic HTTP node, or a node that authenticates against a
        // service — but not triggers (named for the event) or sub-nodes.
        const callsOut =
          node.type === HTTP ||
          ((description.credentials?.length ?? 0) > 0 &&
            !ctx.n8n.isTrigger(node) &&
            !ctx.n8n.isSubNode(node));
        if (!callsOut) return;
        if (!re.test(node.name)) {
          ctx.report({ node, messageId: 'format', data: { name: node.name, pattern } });
        }
      },
    };
  },
};
