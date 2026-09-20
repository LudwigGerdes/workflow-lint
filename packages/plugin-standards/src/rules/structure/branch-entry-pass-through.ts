import type { Rule } from 'workflow-lint-core';
import type { INode } from 'n8n-workflow';
import { IF, NOOP, SET, SIB, SWITCH } from '../../node-types.js';

/** SplitInBatches only fans out on "done" (0) and "loop" (1). */
const LOOP_OUTPUTS = new Set([0, 1]);

export const rule: Rule = {
  meta: {
    id: 'structure/branch-entry-pass-through',
    type: 'suggestion',
    class: 'quality',
    fixable: null,
    docs: {
      description:
        'Each branch of an IF, Switch or loop should open with a named pass-through, so the branch is labelled and its data shape is explicit.',
      recommended: 'warn',
    },
    messages: {
      missingPassThrough:
        'Branch {{output}} of "{{source}}" goes straight into "{{name}}"; open it with a NoOp or a pass-through Set.',
      setWithoutInclude:
        'Pass-through Set "{{name}}" on branch {{output}} of "{{source}}" does not set includeOtherFields, so it drops the incoming data.',
    },
  },
  create(ctx) {
    return {
      Node(target) {
        const node = target as INode;
        const branching = node.type === IF || node.type === SWITCH;
        const loop = node.type === SIB;
        if (!branching && !loop) return;

        for (const edge of ctx.graph.outgoing(node.name)) {
          if (edge.type !== 'main') continue;
          if (loop && !LOOP_OUTPUTS.has(edge.output)) continue;

          const entry = ctx.graph.node(edge.to);
          if (!entry || entry.type === NOOP) continue;

          const data = { source: node.name, output: edge.output, name: entry.name };
          if (entry.type === SET) {
            if (entry.parameters['includeOtherFields'] !== true) {
              ctx.report({ node: entry, messageId: 'setWithoutInclude', data });
            }
          } else {
            ctx.report({ node: entry, messageId: 'missingPassThrough', data });
          }
        }
      },
    };
  },
};
