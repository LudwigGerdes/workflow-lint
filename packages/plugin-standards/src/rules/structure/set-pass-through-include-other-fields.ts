import type { Rule } from 'workflow-lint-core';
import type { INode } from 'n8n-workflow';
import { SET } from '../../node-types.js';

const assignmentCount = (node: INode): number =>
  ((node.parameters['assignments'] as { assignments?: unknown[] } | undefined)?.assignments ?? [])
    .length;

export const rule: Rule = {
  meta: {
    id: 'structure/set-pass-through-include-other-fields',
    type: 'problem',
    class: 'quality',
    fixable: 'params',
    fixSafety: 'safe',
    docs: {
      description:
        'A Set node that assigns nothing is a pass-through, and must set includeOtherFields or it emits empty items.',
      recommended: 'error',
    },
    messages: {
      missingIncludeOtherFields:
        'Pass-through Set "{{name}}" assigns nothing and does not set includeOtherFields, so it emits empty items.',
      nestedIncludeOtherFields:
        'Set "{{name}}" sets includeOtherFields inside options, where n8n ignores it; it belongs at the top level.',
    },
  },
  create(ctx) {
    return {
      Node(target) {
        const node = target as INode;
        if (node.type !== SET || node.typeVersion < 3) return;

        const options = node.parameters['options'] as { includeOtherFields?: unknown } | undefined;
        if (options?.includeOtherFields === true) {
          ctx.report({
            node,
            messageId: 'nestedIncludeOtherFields',
            data: { name: node.name },
            fix: (f) => [
              f.setParameter(node.name, 'includeOtherFields', true),
              f.deleteParameter(node.name, 'options.includeOtherFields'),
            ],
          });
          return;
        }

        if (
          node.parameters['mode'] !== 'raw' &&
          assignmentCount(node) === 0 &&
          node.parameters['includeOtherFields'] !== true
        ) {
          ctx.report({
            node,
            messageId: 'missingIncludeOtherFields',
            data: { name: node.name },
            fix: (f) => f.setParameter(node.name, 'includeOtherFields', true),
          });
        }
      },
    };
  },
};
