import type { Rule } from 'workflow-lint-core';
import type { INode } from 'n8n-workflow';
import { SET } from '../../node-types.js';

interface Assignment {
  name?: unknown;
  type?: unknown;
  value?: unknown;
}

/** An expression that opens straight into an object or array literal. */
const NESTED_LITERAL = /^=\{\{\s*[[{]/;

export const rule: Rule = {
  meta: {
    id: 'data/set-raw-mode-for-nested',
    type: 'suggestion',
    class: 'quality',
    fixable: null,
    docs: {
      description:
        'Building a nested structure field by field is easier to read as one raw JSON payload.',
      recommended: 'info',
    },
    messages: {
      useRawMode:
        'Set node "{{name}}" assigns nested data to "{{field}}"; raw mode with jsonOutput reads better.',
    },
  },
  create(ctx) {
    return {
      Node(target) {
        const node = target as INode;
        if (node.type !== SET || node.typeVersion < 3) return;
        if (node.parameters['mode'] === 'raw') return;

        const assignments = (
          node.parameters['assignments'] as { assignments?: Assignment[] } | undefined
        )?.assignments;

        for (const assignment of assignments ?? []) {
          const nested =
            assignment.type === 'object' ||
            assignment.type === 'array' ||
            (typeof assignment.value === 'string' && NESTED_LITERAL.test(assignment.value));
          if (!nested) continue;
          ctx.report({
            node,
            messageId: 'useRawMode',
            data: { name: node.name, field: String(assignment.name ?? '') },
          });
        }
      },
    };
  },
};
