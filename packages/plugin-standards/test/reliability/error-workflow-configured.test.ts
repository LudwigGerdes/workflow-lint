import { describe, it, expect } from 'vitest';
import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../../src/rules/reliability/error-workflow-configured.js';
import { wf, trigger } from '../helpers/wf.js';

const set = { name: 'Shape Payload', type: 'n8n-nodes-base.set', typeVersion: 3.4 };

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    {
      name: 'error workflow configured',
      workflow: wf([trigger, set], [[trigger.name, set.name]], { errorWorkflow: 'wf-error-1' }),
    },
    {
      name: 'sub-workflows report to their caller',
      workflow: wf([
        { name: 'When Executed by Another Workflow', type: 'n8n-nodes-base.executeWorkflowTrigger' },
        set,
      ]),
    },
  ],
  invalid: [
    {
      name: 'no error workflow at all',
      workflow: wf([trigger, set], [[trigger.name, set.name]]),
      errors: [{ messageId: 'missing' }],
    },
    {
      name: 'blank error workflow',
      workflow: wf([trigger, set], [[trigger.name, set.name]], { errorWorkflow: '   ' }),
      errors: [{ messageId: 'missing' }],
    },
  ],
});

describe('error-workflow-configured scope', () => {
  it('is opt-in, not part of the recommended preset', () => {
    // A property of the deployment, not of the workflow as authored.
    expect(rule.meta.docs.recommended).toBe(false);
  });
});
