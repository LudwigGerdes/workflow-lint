import type { Rule } from 'workflow-lint-core';
import type { INode } from 'n8n-workflow';
import { HTTP, SPLIT_OUT } from '../../node-types.js';

/** `$json.results[0]` or `$json.results.0.` — reaching into an array by index. */
const ARRAY_INDEXED = /\$json\.(\w+)\[\d+\]|\$json\.(\w+)\.0\./;

export const rule: Rule = {
  meta: {
    id: 'data/batch-response-not-split',
    type: 'problem',
    class: 'quality',
    fixable: null,
    docs: {
      description:
        'Reaching into a response array by index processes one element and drops the rest; split it out instead.',
      recommended: 'warn',
    },
    messages: {
      arrayIndexed:
        'Node "{{consumer}}" reads "{{field}}" from "{{http}}" by index, so only one element is processed; use a Split Out.',
    },
  },
  create(ctx) {
    return {
      Node(target) {
        const node = target as INode;
        if (node.type !== HTTP) return;

        const children = ctx.graph
          .outgoing(node.name)
          .filter((e) => e.type === 'main')
          .map((e) => e.to);
        if (children.some((name) => ctx.graph.node(name)?.type === SPLIT_OUT)) return;

        for (const name of children) {
          const consumer = ctx.graph.node(name);
          if (!consumer) continue;
          const match = ARRAY_INDEXED.exec(JSON.stringify(consumer.parameters));
          if (!match) continue;
          ctx.report({
            node: consumer,
            messageId: 'arrayIndexed',
            data: {
              http: node.name,
              consumer: consumer.name,
              field: match[1] ?? match[2] ?? '',
            },
          });
        }
      },
    };
  },
};
