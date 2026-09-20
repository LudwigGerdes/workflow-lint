import type { Rule } from 'workflow-lint-core';
import type { INode } from 'n8n-workflow';

const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;

const toSnakeCase = (s: string): string =>
  s
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

export const rule: Rule = {
  meta: {
    id: 'naming/agent-tool-snake-case',
    type: 'suggestion',
    class: 'quality',
    fixable: 'params',
    fixSafety: 'safe',
    docs: {
      description: 'Tool names are passed to the model as identifiers, so they must be snake_case.',
      recommended: 'warn',
    },
    messages: {
      snakeCase: 'Tool name "{{name}}" should be snake_case, such as "{{suggestion}}".',
    },
  },
  create(ctx) {
    return {
      Node(target) {
        const node = target as INode;
        // n8n's own predicate, rather than guessing from the type name.
        if (!ctx.n8n.isTool(node)) return;

        // Some tool nodes carry an explicit `name` parameter; the rest are
        // identified to the model by the node's own name.
        const parameterName = node.parameters['name'];
        const usesParameter = typeof parameterName === 'string' && parameterName.trim().length > 0;
        const toolName = usesParameter ? parameterName : node.name;
        if (SNAKE_CASE.test(toolName)) return;

        const suggestion = toSnakeCase(toolName);
        ctx.report({
          node,
          messageId: 'snakeCase',
          data: { name: toolName, suggestion },
          ...(SNAKE_CASE.test(suggestion)
            ? {
                fix: (f) =>
                  usesParameter
                    ? f.setParameter(node.name, 'name', suggestion)
                    : f.renameNode(node.name, suggestion),
              }
            : {}),
        });
      },
    };
  },
};
