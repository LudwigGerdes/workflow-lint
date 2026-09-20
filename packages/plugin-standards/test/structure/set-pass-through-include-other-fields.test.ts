import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../../src/rules/structure/set-pass-through-include-other-fields.js';
import { wf, trigger } from '../helpers/wf.js';

const set = (name: string, parameters: Record<string, unknown>) => ({
  name,
  type: 'n8n-nodes-base.set',
  typeVersion: 3.4,
  parameters,
});
const withAssignment = {
  assignments: { assignments: [{ id: '1', name: 'email', value: '={{ $json.email }}', type: 'string' }] },
  options: {},
};

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    { name: 'assigns fields', workflow: wf([trigger, set('Extract Email', withAssignment)]) },
    {
      name: 'pass-through with the flag set',
      workflow: wf([trigger, set('Pass Through', { includeOtherFields: true, options: {} })]),
    },
    {
      name: 'raw mode builds its own payload',
      workflow: wf([trigger, set('Build Body', { mode: 'raw', jsonOutput: '={{ $json }}', options: {} })]),
    },
    {
      name: 'v2 Set predates the flag',
      workflow: wf([trigger, { name: 'Old Set', type: 'n8n-nodes-base.set', typeVersion: 2 }]),
    },
  ],
  invalid: [
    {
      name: 'empty Set emits empty items',
      workflow: wf([trigger, set('Pass Through', { options: {} })]),
      errors: [{ messageId: 'missingIncludeOtherFields', nodeName: 'Pass Through' }],
      output: wf([trigger, set('Pass Through', { options: {}, includeOtherFields: true })]),
    },
    {
      name: 'flag nested under options is moved to the top level',
      workflow: wf([trigger, set('Pass Through', { options: { includeOtherFields: true } })]),
      errors: [{ messageId: 'nestedIncludeOtherFields', nodeName: 'Pass Through' }],
      output: wf([trigger, set('Pass Through', { options: {}, includeOtherFields: true })]),
    },
  ],
});
