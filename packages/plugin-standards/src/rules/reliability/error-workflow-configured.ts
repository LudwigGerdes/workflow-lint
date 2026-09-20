import type { Rule } from 'workflow-lint-core';
import { EXECUTE_WORKFLOW_TRIGGER } from '../../node-types.js';

export const rule: Rule = {
  meta: {
    id: 'reliability/error-workflow-configured',
    type: 'problem',
    class: 'quality',
    fixable: null,
    docs: {
      description:
        'A production workflow needs an error workflow, or a failed run notifies nobody.',
      // Off by default, enabled by workflow-lint:production. Whether a workflow has
      // an error workflow is a property of the deployment, not of the
      // authoring: an example, a template and a sub-workflow all legitimately
      // have none, and the rule fired on all 61 corpus workflows with a
      // trigger. Spec 3 already scopes it to production.
      recommended: false,
    },
    messages: {
      missing:
        'No error workflow is configured, so a failed run fails silently; set settings.errorWorkflow.',
    },
  },
  create(ctx) {
    return {
      'Workflow:exit'() {
        // A sub-workflow reports failures to whoever called it.
        if (ctx.graph.nodes.some((n) => n.type === EXECUTE_WORKFLOW_TRIGGER)) return;
        const configured = ctx.workflow.json.settings?.['errorWorkflow'];
        if (typeof configured === 'string' && configured.trim().length > 0) return;
        ctx.report({ workflow: true, messageId: 'missing' });
      },
    };
  },
};
