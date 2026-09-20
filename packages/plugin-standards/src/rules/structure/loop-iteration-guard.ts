import type { Rule } from 'workflow-lint-core';
import { IF, SIB, SWITCH } from '../../node-types.js';

/** Wording that indicates the branch is counting its way out of the loop. */
const GUARD = /attempt|iteration|count|retry|tries|max/i;

export const rule: Rule = {
  meta: {
    id: 'structure/loop-iteration-guard',
    type: 'suggestion',
    class: 'quality',
    fixable: null,
    docs: {
      description:
        'Every loop needs a bound: an item-driven SplitInBatches, or a decision node testing an attempt counter.',
      recommended: 'warn',
    },
    messages: {
      unbounded:
        'Loop ({{cycle}}) has no iteration guard, so it can run forever; bound it with a counter check or SplitInBatches.',
    },
  },
  create(ctx) {
    return {
      'Workflow:exit'() {
        for (const cycle of ctx.graph.cycles()) {
          const guarded = cycle.some((name) => {
            const node = ctx.graph.node(name);
            if (!node) return false;
            // SplitInBatches is bounded by the item list itself.
            if (node.type === SIB) return true;
            if (node.type !== IF && node.type !== SWITCH) return false;
            return GUARD.test(JSON.stringify(node.parameters['conditions'] ?? {}));
          });
          if (!guarded) {
            ctx.report({ workflow: true, messageId: 'unbounded', data: { cycle: cycle.join(' -> ') } });
          }
        }
      },
    };
  },
};
