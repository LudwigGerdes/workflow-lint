import type { Rule } from 'workflow-lint-core';
import type { INode, NodeConnectionType } from 'n8n-workflow';
import { isNotificationNode } from '../../util/network.js';
import { errorOutputIndex } from '../../util/outputs.js';

const SUPPRESSES = new Set(['continueRegularOutput', 'continueErrorOutput']);

export const rule: Rule = {
  meta: {
    id: 'reliability/continue-on-fail-only-terminal',
    type: 'problem',
    class: 'quality',
    fixable: null,
    docs: {
      description:
        'Swallowing a failure is only safe at the end of a path; mid-flow it feeds bad data downstream.',
      recommended: 'warn',
    },
    messages: {
      suppressedUpstream:
        'Node "{{name}}" continues on failure but feeds {{consumers}}, which will run on failed data.',
    },
  },
  create(ctx) {
    return {
      Node(target) {
        const node = target as INode;
        const onError = typeof node.onError === 'string' ? node.onError : undefined;
        const legacy = (node as INode & { continueOnFail?: unknown }).continueOnFail === true;
        if (!legacy && !(onError !== undefined && SUPPRESSES.has(onError))) return;

        // continueErrorOutput with its error output wired is explicit routing,
        // not suppression; error-output-wired covers the unwired case.
        if (onError === 'continueErrorOutput') {
          const index = errorOutputIndex(ctx.n8n.nodeType(node));
          const wired = ctx.graph
            .outgoing(node.name)
            .some((e) => e.type === 'main' && e.output === index);
          if (wired) return;
        }

        const downstream = ctx.graph.children(node.name, 'main' as NodeConnectionType, -1);
        if (downstream.length === 0) return;

        const consumers = downstream.filter((name) => {
          const consumer = ctx.graph.node(name);
          return consumer !== undefined && !isNotificationNode(consumer);
        });
        if (consumers.length === 0) return;

        ctx.report({
          node,
          messageId: 'suppressedUpstream',
          data: { name: node.name, consumers: consumers.join(', ') },
        });
      },
    };
  },
};
