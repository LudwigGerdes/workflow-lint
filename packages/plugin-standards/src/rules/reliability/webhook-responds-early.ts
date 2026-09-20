import type { Rule } from 'workflow-lint-core';
import type { INode } from 'n8n-workflow';
import { RESPOND_TO_WEBHOOK, WEBHOOK } from '../../node-types.js';
import { isHeavyNode } from '../../util/network.js';

/** Modes where the caller waits for the workflow to get around to replying. */
const DEFERRED = new Set(['responseNode', 'lastNode']);

export const rule: Rule = {
  meta: {
    id: 'reliability/webhook-responds-early',
    type: 'problem',
    class: 'quality',
    fixable: null,
    docs: {
      description:
        'A webhook should answer before doing slow work, or the caller waits for the whole run.',
      recommended: 'warn',
    },
    messages: {
      heavyBeforeRespond:
        'Webhook "{{webhook}}" makes the caller wait for "{{heavy}}" before replying; respond first, then do the work.',
    },
  },
  create(ctx) {
    return {
      Node(target) {
        const webhook = target as INode;
        if (webhook.type !== WEBHOOK) return;
        const mode = String(webhook.parameters['responseMode'] ?? 'onReceived');
        if (!DEFERRED.has(mode)) return;

        // Everything reachable before a Respond node runs while the caller waits.
        const seen = new Set<string>();
        const queue = ctx.graph.outgoing(webhook.name).filter((e) => e.type === 'main').map((e) => e.to);
        while (queue.length > 0) {
          const current = queue.shift()!;
          if (seen.has(current)) continue;
          seen.add(current);

          const node = ctx.graph.node(current);
          if (!node) continue;
          // Past the reply, slow work costs the caller nothing.
          if (node.type === RESPOND_TO_WEBHOOK) continue;

          if (isHeavyNode(node, ctx.n8n)) {
            ctx.report({
              node: webhook,
              messageId: 'heavyBeforeRespond',
              data: { webhook: webhook.name, heavy: node.name },
            });
            return;
          }
          for (const edge of ctx.graph.outgoing(current)) {
            if (edge.type === 'main') queue.push(edge.to);
          }
        }
      },
    };
  },
};
