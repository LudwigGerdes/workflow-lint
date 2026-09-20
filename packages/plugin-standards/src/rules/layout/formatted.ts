import type { Rule } from 'workflow-lint-core';
import { format } from 'workflow-lint-fmt';
import type { Move, MoveReason } from 'workflow-lint-fmt';

/**
 * One message per composition principle. The guide treats these as distinct
 * claims — asymmetric arms suggest asymmetric importance, misalignment forces
 * the eye to jump — so a single "12 nodes would move" tells you the workflow
 * is unformatted without telling you what is actually wrong with it.
 */
const REASONS: Array<{ reason: MoveReason; messageId: string }> = [
  { reason: 'spacing', messageId: 'spacing' },
  { reason: 'symmetry', messageId: 'symmetry' },
  { reason: 'alignment', messageId: 'alignment' },
  { reason: 'subnode', messageId: 'subnode' },
];

export const rule: Rule = {
  meta: {
    id: 'layout/formatted',
    type: 'suggestion',
    class: 'stylistic',
    fixable: 'layout',
    fixSafety: 'safe',
    docs: {
      // Off by default: layout is the formatter's business, and a team that
      // does not run fmt should not be nagged about it on every lint.
      description: 'Node positions should match what `workflow-lint fmt` would produce.',
      recommended: false,
    },
    messages: {
      spacing:
        '{{count}} node{{plural}} sit{{verb}} at the wrong horizontal gap from what it follows; run `workflow-lint fmt`.',
      symmetry:
        '{{count}} branch arm{{plural}} {{isare}} not symmetric about the decision node; run `workflow-lint fmt`.',
      alignment:
        '{{count}} node{{plural}} {{isare}} off its row, so parallel stages no longer line up; run `workflow-lint fmt`.',
      subnode:
        '{{count}} sub-node{{plural}} {{isare}} not positioned under the node it feeds; run `workflow-lint fmt`.',
    },
  },
  create(ctx) {
    return {
      'Workflow:exit'() {
        const { moves } = format(ctx.workflow, ctx.n8n.pack);
        if (moves.length === 0) return;

        for (const { reason, messageId } of REASONS) {
          const group = moves.filter((m: Move) => m.reasons.includes(reason));
          if (group.length === 0) continue;
          const count = group.length;
          ctx.report({
            workflow: true,
            messageId,
            data: {
              count,
              plural: count === 1 ? '' : 's',
              verb: count === 1 ? 's' : '',
              isare: count === 1 ? 'is' : 'are',
            },
            // Each finding carries only its own moves, so `--fix` applied to a
            // single principle does exactly that principle.
            fix: (f) => group.map((move) => f.moveNode(move.name, move.position)),
          });
        }
      },
    };
  },
};
