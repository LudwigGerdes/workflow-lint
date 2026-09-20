import type { Rule } from 'workflow-lint-core';
import type { INode, NodeConnectionType } from 'n8n-workflow';
import { IF, STOP_AND_ERROR, SWITCH, WEBHOOK } from '../../node-types.js';

/** Operators that check a field is actually present and populated. */
const VALIDATING = /hasField|notEmpty|exists/i;

const ENTRY_NODES = 3;
const STOP_DEPTH = 4;

export const rule: Rule = {
  meta: {
    id: 'reliability/webhook-input-contract',
    type: 'suggestion',
    class: 'quality',
    fixable: null,
    docs: {
      description:
        'A webhook takes input from outside; validate its shape up front and reject what does not fit.',
      recommended: 'info',
    },
    messages: {
      noContract:
        'Webhook "{{name}}" accepts its payload without checking it; validate the required fields and stop on bad input.',
    },
  },
  create(ctx) {
    return {
      Node(target) {
        const webhook = target as INode;
        if (webhook.type !== WEBHOOK) return;

        // The first few nodes are where a contract check belongs.
        const entry: string[] = [];
        const seen = new Set<string>();
        const queue = ctx.graph.outgoing(webhook.name).filter((e) => e.type === 'main').map((e) => e.to);
        while (queue.length > 0 && entry.length < ENTRY_NODES) {
          const current = queue.shift()!;
          if (seen.has(current)) continue;
          seen.add(current);
          entry.push(current);
          for (const edge of ctx.graph.outgoing(current)) {
            if (edge.type === 'main') queue.push(edge.to);
          }
        }

        const validates = entry.some((name) => {
          const node = ctx.graph.node(name);
          if (!node || (node.type !== IF && node.type !== SWITCH)) return false;
          return VALIDATING.test(JSON.stringify(node.parameters['conditions'] ?? {}));
        });

        const rejects = ctx.graph
          .children(webhook.name, 'main' as NodeConnectionType, STOP_DEPTH)
          .some((name) => ctx.graph.node(name)?.type === STOP_AND_ERROR);

        if (!validates || !rejects) {
          ctx.report({ node: webhook, messageId: 'noContract', data: { name: webhook.name } });
        }
      },
    };
  },
};
