import type { Rule } from 'workflow-lint-core';
import type { INode } from 'n8n-workflow';
import { isNetworkNode } from '../../util/network.js';

const RETRY_AFTER = /retry[-_]?after/i;

const mentionsRetryAfter = (value: unknown): boolean => {
  if (typeof value === 'string') return RETRY_AFTER.test(value);
  if (Array.isArray(value)) return value.some(mentionsRetryAfter);
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(mentionsRetryAfter);
  }
  return false;
};

export const rule: Rule = {
  meta: {
    id: 'reliability/retry-respects-retry-after',
    type: 'suggestion',
    class: 'quality',
    fixable: null,
    docs: {
      description:
        'A retrying call should honour the API\'s Retry-After header rather than guessing a fixed delay.',
      recommended: 'info',
    },
    messages: {
      ignoresRetryAfter:
        'Node "{{name}}" retries on a fixed delay and never reads Retry-After, so it may keep hitting a rate limit.',
    },
  },
  create(ctx) {
    return {
      Node(target) {
        const node = target as INode;
        if (!isNetworkNode(node, ctx.n8n)) return;
        if ((node as INode & { retryOnFail?: unknown }).retryOnFail !== true) return;

        const wait = (node as INode & { waitBetweenTries?: unknown }).waitBetweenTries;
        // A numeric wait is a deliberate fixed delay; anything else falls back
        // to n8n's default, which also ignores the header.
        if (typeof wait === 'number') return;
        if (mentionsRetryAfter(node.parameters)) return;

        ctx.report({ node, messageId: 'ignoresRetryAfter', data: { name: node.name } });
      },
    };
  },
};
