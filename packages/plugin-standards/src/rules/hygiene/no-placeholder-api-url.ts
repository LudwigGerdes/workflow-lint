import type { Rule } from 'workflow-lint-core';
import type { INode } from 'n8n-workflow';
import { HTTP, SET } from '../../node-types.js';

const PLACEHOLDER =
  /(^|\.)example\.(com|org|net)\b|api\.example|placeholder|your-domain|localhost:\d+\/api/i;

/** A Set standing in for a call that was never wired up. */
const CALL_SHAPED_NAME = /^(GET|POST|PUT|PATCH|DELETE) /;

export const rule: Rule = {
  meta: {
    id: 'hygiene/no-placeholder-api-url',
    type: 'suggestion',
    class: 'quality',
    fixable: null,
    docs: {
      description: 'Placeholder endpoints and stand-in nodes must not reach a finished workflow.',
      recommended: 'warn',
    },
    messages: {
      placeholderUrl: 'Node "{{name}}" still points at the placeholder URL "{{url}}".',
      setAsApiPlaceholder:
        'Set node "{{name}}" is named like an API call; it is standing in for a request that was never built.',
    },
  },
  create(ctx) {
    return {
      Node(target) {
        const node = target as INode;

        if (node.type === HTTP) {
          const url = node.parameters['url'];
          // Disabling the node does not make the placeholder any more finished.
          if (typeof url === 'string' && PLACEHOLDER.test(url)) {
            ctx.report({ node, messageId: 'placeholderUrl', data: { name: node.name, url } });
          }
          return;
        }

        if (node.type === SET && CALL_SHAPED_NAME.test(node.name)) {
          ctx.report({ node, messageId: 'setAsApiPlaceholder', data: { name: node.name } });
        }
      },
    };
  },
};
