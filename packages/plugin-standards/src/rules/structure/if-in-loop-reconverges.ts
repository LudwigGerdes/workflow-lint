import type { Rule } from 'workflow-lint-core';
import type { INode } from 'n8n-workflow';
import { IF, MERGE, SIB, SWITCH } from '../../node-types.js';
import { loopBody } from '../../util/loop.js';

export const rule: Rule = {
  meta: {
    id: 'structure/if-in-loop-reconverges',
    type: 'problem',
    class: 'quality',
    fixable: null,
    docs: {
      description:
        'A branch inside a loop must reconverge through a Merge before returning to the loop node, or iterations are lost.',
      recommended: 'error',
    },
    messages: {
      missingMerge:
        'Branches inside loop "{{loop}}" return to it separately (from {{sources}}); reconverge them through a Merge first.',
    },
  },
  create(ctx) {
    return {
      Node(target) {
        const node = target as INode;
        if (node.type !== SIB) return;
        const loop = node.name;

        const body = loopBody(ctx, loop);
        if (body.length === 0) return;

        const branches = body.some((n) => {
          const type = ctx.graph.node(n)?.type;
          return type === IF || type === SWITCH;
        });
        if (!branches) return;

        const returning = [
          ...new Set(
            ctx.graph
              .incoming(loop)
              .filter((c) => c.type === 'main' && body.includes(c.from))
              .map((c) => c.from),
          ),
        ];
        if (returning.length > 1 && returning.some((n) => ctx.graph.node(n)?.type !== MERGE)) {
          ctx.report({
            node,
            messageId: 'missingMerge',
            data: { loop, sources: returning.join(', ') },
          });
        }
      },
    };
  },
};
