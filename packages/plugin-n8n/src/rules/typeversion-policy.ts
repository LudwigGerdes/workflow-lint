import { getNodeParametersIssues, type Rule } from 'workflow-lint-core';
import type { INode } from 'n8n-workflow';

interface Options {
  /** How many released versions a node may lag behind the default. */
  maxLag?: number;
  allowDeprecated?: boolean;
}

const hasIssues = (issues: { parameters?: Record<string, string[]> } | null): boolean =>
  Object.keys(issues?.parameters ?? {}).length > 0;

export const rule: Rule = {
  meta: {
    id: 'n8n/typeversion-policy',
    type: 'problem',
    class: 'quality',
    fixable: 'params',
    fixSafety: 'unsafe',
    docs: {
      description:
        'Nodes should run a typeVersion the target n8n knows, close to current, and not deprecated.',
      recommended: 'warn',
    },
    schema: {
      type: 'object',
      properties: { maxLag: { type: 'number' }, allowDeprecated: { type: 'boolean' } },
    },
    messages: {
      outdated:
        'Node "{{name}}" uses typeVersion {{version}}; the current version is {{defaultVersion}}.',
      deprecated: 'Node "{{name}}" uses deprecated typeVersion {{version}}.',
      unpinnedNote:
        'No n8n version is pinned, so version findings were reported as information only; set settings.n8nVersion to enforce them.',
    },
  },

  create(ctx) {
    const { maxLag = 1, allowDeprecated = false } = (ctx.options ?? {}) as Options;
    const { exact, resolved } = ctx.n8nVersion;
    let suppressedByUnpinned = false;

    return {
      Node(target) {
        const node = target as INode;
        const info = ctx.n8n.versions(node.type);
        // An unknown node type is n8n/valid's business, not ours.
        if (!info) return;

        const { versions, defaultVersion } = info;
        const version = node.typeVersion;
        const data = { name: node.name, version, defaultVersion, n8nVersion: resolved };

        // Backward drift belongs to n8n/typeversion-drift, which errors on it.
        // The bookkeeping stays here so `unpinnedNote` keeps its meaning.
        if (!versions.includes(version)) return;

        if (version > defaultVersion) {
          if (!exact) suppressedByUnpinned = true;
        } else if (version < defaultVersion) {
          const lag = versions.filter((v) => v > version && v < defaultVersion).length;
          if (lag > maxLag) {
            if (!exact) suppressedByUnpinned = true;
            else {
              // Bumping is only safe when the node validates before *and* after.
              const targetDescription = ctx.n8n.pack.describe(node.type, defaultVersion);
              const bumped = { ...node, typeVersion: defaultVersion };
              const canBump =
                targetDescription !== undefined &&
                !hasIssues(ctx.n8n.parameterIssues(node)) &&
                !hasIssues(
                  getNodeParametersIssues(targetDescription.properties, bumped, targetDescription),
                );
              ctx.report({
                node,
                messageId: 'outdated',
                data: { ...data, lag },
                ...(canBump
                  ? { fix: (f) => f.setNodeField(node.name, 'typeVersion', defaultVersion) }
                  : {}),
              });
            }
          }
        }

        if (!allowDeprecated && ctx.n8n.pack.isDeprecated(node.type, version)) {
          ctx.report({ node, messageId: 'deprecated', data });
        }
      },

      'Workflow:exit'() {
        if (!exact && suppressedByUnpinned) {
          ctx.report({ workflow: true, messageId: 'unpinnedNote' });
        }
      },
    };
  },
};
