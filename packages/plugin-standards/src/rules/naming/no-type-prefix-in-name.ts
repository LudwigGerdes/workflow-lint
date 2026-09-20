import type { Rule } from 'workflow-lint-core';
import type { INode } from 'n8n-workflow';
import { SWITCH } from '../../node-types.js';

/** A name that merely restates the node's type adds nothing. */
const TYPE_PREFIX = /^(Switch|IF|If|Code|Set|HTTP Request|Merge):\s*/;

interface SwitchRule {
  outputKey?: unknown;
}

/** v3 keeps its branches under `rules.values`; v2 under `rules.rules`. */
const switchRules = (node: INode): SwitchRule[] => {
  const rules = node.parameters['rules'] as
    | { values?: SwitchRule[]; rules?: SwitchRule[] }
    | undefined;
  if (!rules) return [];
  return (node.typeVersion >= 3 ? rules.values : rules.rules) ?? [];
};

export const rule: Rule = {
  meta: {
    id: 'naming/no-type-prefix-in-name',
    type: 'suggestion',
    class: 'stylistic',
    fixable: 'connections',
    fixSafety: 'safe',
    docs: {
      description:
        'Node names should describe intent, not restate the node type; Switch branches need output keys.',
      recommended: 'warn',
    },
    schema: { type: 'object', properties: { requireSwitchOutputKeys: { type: 'boolean' } } },
    messages: {
      prefix: 'Node "{{name}}" restates its type; drop the "{{prefix}}" prefix.',
      switchOutputKey: 'Switch "{{name}}" branch {{index}} has no output key, so its branch is unnamed.',
    },
  },
  create(ctx) {
    const { requireSwitchOutputKeys = true } = (ctx.options ?? {}) as {
      requireSwitchOutputKeys?: boolean;
    };
    return {
      Node(target) {
        const node = target as INode;

        const match = TYPE_PREFIX.exec(node.name);
        if (match) {
          const stripped = node.name.slice(match[0].length).trim();
          ctx.report({
            node,
            messageId: 'prefix',
            data: { name: node.name, prefix: match[1]! },
            // Nothing left after stripping means there is no name to fix to.
            ...(stripped.length > 0 ? { fix: (f) => f.renameNode(node.name, stripped) } : {}),
          });
        }

        if (requireSwitchOutputKeys && node.type === SWITCH) {
          switchRules(node).forEach((branch, index) => {
            const key = branch.outputKey;
            if (typeof key !== 'string' || key.trim().length === 0) {
              ctx.report({ node, messageId: 'switchOutputKey', data: { name: node.name, index } });
            }
          });
        }
      },
    };
  },
};
