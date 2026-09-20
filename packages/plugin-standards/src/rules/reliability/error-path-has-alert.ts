import type { Rule } from 'workflow-lint-core';
import type { INode } from 'n8n-workflow';
import { isNotificationNode } from '../../util/network.js';
import { errorOutputIndex } from '../../util/outputs.js';

export const rule: Rule = {
  meta: {
    id: 'reliability/error-path-has-alert',
    type: 'problem',
    class: 'quality',
    fixable: null,
    docs: {
      description:
        'An error path must reach someone: a notification, a log, or Stop and Error, before it rejoins the main flow.',
      recommended: 'warn',
    },
    messages: {
      noAlert:
        'The error path from "{{name}}" rejoins the main flow without notifying anyone or stopping the run.',
    },
  },
  create(ctx) {
    const mainTargets = (name: string, errorIndex: number): string[] =>
      ctx.graph
        .outgoing(name)
        .filter((e) => e.type === 'main' && e.output !== errorIndex)
        .map((e) => e.to);

    const walk = (start: string[]): Set<string> => {
      const seen = new Set<string>();
      const queue = [...start];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (seen.has(current)) continue;
        seen.add(current);
        for (const edge of ctx.graph.outgoing(current)) {
          if (edge.type === 'main') queue.push(edge.to);
        }
      }
      return seen;
    };

    return {
      Node(target) {
        const node = target as INode;
        if (node.onError !== 'continueErrorOutput') return;

        const errorIndex = errorOutputIndex(ctx.n8n.nodeType(node));
        const errorTargets = ctx.graph
          .outgoing(node.name)
          .filter((e) => e.type === 'main' && e.output === errorIndex)
          .map((e) => e.to);
        // An unwired error output is error-output-wired's finding, not ours.
        if (errorTargets.length === 0) return;

        // Where the happy path goes; meeting it again is a rejoin.
        const happyPath = walk(mainTargets(node.name, errorIndex));

        const seen = new Set<string>();
        const queue = [...errorTargets];
        while (queue.length > 0) {
          const current = queue.shift()!;
          if (seen.has(current)) continue;
          seen.add(current);

          const currentNode = ctx.graph.node(current);
          if (currentNode && isNotificationNode(currentNode)) return;
          // Stop at a rejoin: past here the flow is no longer the error path.
          if (happyPath.has(current)) continue;

          for (const edge of ctx.graph.outgoing(current)) {
            if (edge.type === 'main') queue.push(edge.to);
          }
        }

        ctx.report({ node, messageId: 'noAlert', data: { name: node.name } });
      },
    };
  },
};
