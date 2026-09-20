import type { Rule, SelectorHandlers } from 'workflow-lint-core';
import type { INode } from 'n8n-workflow';

/**
 * Backward version drift: the workflow was built against a newer n8n than the
 * environment it is headed for.
 *
 * This is the asymmetric half of version skew, and the reason it gets its own
 * rule at `error` while lag and deprecation stay warnings. A workflow carrying
 * a typeVersion the target does not know **imports without complaint and fails
 * when it runs** — so a deploy that looks entirely successful leaves a broken
 * workflow in production. Forward drift (running an older typeVersion than the
 * target's default) merely means you are behind, which is a warning.
 *
 * Silent unless a version is pinned exactly: with no known target there is
 * nothing to drift from, and guessing would fail every unpinned repo.
 * `n8n/typeversion-policy` already says when a pin is missing.
 */
export const rule: Rule = {
  meta: {
    id: 'n8n/typeversion-drift',
    type: 'problem',
    class: 'quality',
    fixable: null,
    docs: {
      description:
        'A node must not use a typeVersion newer than the target n8n; it imports cleanly and fails at run time.',
      recommended: 'error',
    },
    messages: {
      unknownVersion:
        'Node "{{name}}" uses typeVersion {{version}}, which the target n8n {{n8nVersion}} does not know. It will import and then fail at run time.',
      newerThanTarget:
        'Node "{{name}}" uses typeVersion {{version}}, newer than the default {{defaultVersion}} on the target n8n {{n8nVersion}}.',
    },
  },

  create(ctx): SelectorHandlers {
    const { exact, resolved } = ctx.n8nVersion;
    if (!exact) return {};

    return {
      Node(target) {
        const node = target as INode;
        const info = ctx.n8n.versions(node.type);
        // An unknown node type is n8n/valid's business, not ours.
        if (!info) return;

        const { versions, defaultVersion } = info;
        const version = node.typeVersion;
        const data = { name: node.name, version, defaultVersion, n8nVersion: resolved };

        if (!versions.includes(version)) {
          ctx.report({ node, messageId: 'unknownVersion', data });
          return;
        }
        if (version > defaultVersion) {
          ctx.report({ node, messageId: 'newerThanTarget', data });
        }
      },
    };
  },
};
