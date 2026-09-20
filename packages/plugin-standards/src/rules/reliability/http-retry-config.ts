import type { Rule } from 'workflow-lint-core';
import type { INode } from 'n8n-workflow';
import { isNetworkNode } from '../../util/network.js';

interface Options {
  minTries?: number;
  minWait?: number;
}

/** n8n's own defaults once retryOnFail is on. */
const DEFAULT_MAX_TRIES = 3;
const DEFAULT_WAIT = 1000;

const isExpression = (v: unknown): boolean => typeof v === 'string' && v.startsWith('=');

export const rule: Rule = {
  meta: {
    id: 'reliability/http-retry-config',
    type: 'problem',
    class: 'quality',
    fixable: 'params',
    fixSafety: 'safe',
    docs: {
      description: 'Calls that cross the network should retry, with a real gap between attempts.',
      recommended: 'warn',
    },
    schema: {
      type: 'object',
      properties: { minTries: { type: 'number' }, minWait: { type: 'number' } },
    },
    messages: {
      noRetry: 'Node "{{name}}" calls out over the network but does not retry on failure.',
      tooFewTries: 'Node "{{name}}" retries only {{actual}} times; use at least {{minTries}}.',
      waitTooShort:
        'Node "{{name}}" waits {{actual}}ms between retries; use at least {{minWait}}ms.',
    },
  },
  create(ctx) {
    const { minTries = 3, minWait = 500 } = (ctx.options ?? {}) as Options;

    return {
      Node(target) {
        const node = target as INode;
        if (!isNetworkNode(node, ctx.n8n)) return;

        const retry = (node as INode & { retryOnFail?: unknown }).retryOnFail;
        // An expression decides at run time; we cannot judge it statically.
        if (isExpression(retry)) return;

        if (retry !== true) {
          ctx.report({
            node,
            messageId: 'noRetry',
            data: { name: node.name },
            fix: (f) => [
              f.setNodeField(node.name, 'retryOnFail', true),
              f.setNodeField(node.name, 'maxTries', minTries),
              f.setNodeField(node.name, 'waitBetweenTries', minWait),
            ],
          });
          return;
        }

        const maxTries = (node as INode & { maxTries?: unknown }).maxTries;
        const tries = typeof maxTries === 'number' ? maxTries : DEFAULT_MAX_TRIES;
        if (tries < minTries) {
          ctx.report({
            node,
            messageId: 'tooFewTries',
            data: { name: node.name, actual: tries, minTries },
            fix: (f) => f.setNodeField(node.name, 'maxTries', minTries),
          });
        }

        const waitBetweenTries = (node as INode & { waitBetweenTries?: unknown }).waitBetweenTries;
        const wait = typeof waitBetweenTries === 'number' ? waitBetweenTries : DEFAULT_WAIT;
        if (wait < minWait) {
          ctx.report({
            node,
            messageId: 'waitTooShort',
            data: { name: node.name, actual: wait, minWait },
            fix: (f) => f.setNodeField(node.name, 'waitBetweenTries', minWait),
          });
        }
      },
    };
  },
};
