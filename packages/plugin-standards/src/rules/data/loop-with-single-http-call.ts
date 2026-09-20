import type { Rule } from 'workflow-lint-core';
import type { INode } from 'n8n-workflow';
import { AGGREGATE, CODE, HTTP, ITEM_LISTS, SIB, SUMMARIZE } from '../../node-types.js';
import { loopBody } from '../../util/loop.js';

/** Nodes that fold many items back into one, which a batch call would skip. */
const AGGREGATION = new Set<string>([AGGREGATE, ITEM_LISTS, SUMMARIZE]);

export const rule: Rule = {
  meta: {
    id: 'data/loop-with-single-http-call',
    type: 'suggestion',
    class: 'quality',
    fixable: null,
    docs: {
      description:
        'A loop whose body is one HTTP call is usually a batch endpoint waiting to be used.',
      recommended: 'info',
    },
    messages: {
      batchCandidate:
        'Loop "{{loop}}" exists only to call "{{http}}" once per item; check whether the API takes a batch.',
    },
  },
  create(ctx) {
    return {
      Node(target) {
        const node = target as INode;
        if (node.type !== SIB) return;

        const body = loopBody(ctx, node.name);
        const calls = body.filter((name) => ctx.graph.node(name)?.type === HTTP);
        if (calls.length !== 1) return;

        // Aggregating in the body means the loop is doing more than the call.
        const aggregates = body.some((name) => {
          const member = ctx.graph.node(name);
          if (!member) return false;
          if (AGGREGATION.has(member.type)) return true;
          return member.type === CODE && /\.all\(/.test(JSON.stringify(member.parameters));
        });
        if (aggregates) return;

        ctx.report({
          node,
          messageId: 'batchCandidate',
          data: { loop: node.name, http: calls[0]! },
        });
      },
    };
  },
};
