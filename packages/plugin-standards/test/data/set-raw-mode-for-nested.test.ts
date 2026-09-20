import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../../src/rules/data/set-raw-mode-for-nested.js';
import { wf, trigger } from '../helpers/wf.js';

const set = (assignments: object[], extra: Record<string, unknown> = {}) => ({
  name: 'Build Body',
  type: 'n8n-nodes-base.set',
  typeVersion: 3.4,
  parameters: { assignments: { assignments }, options: {}, ...extra },
});
const field = (name: string, value: unknown, type = 'string') => ({ id: '1', name, value, type });

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    { name: 'flat string fields', workflow: wf([trigger, set([field('email', '={{ $json.email }}')])]) },
    {
      name: 'already in raw mode',
      workflow: wf([trigger, set([field('body', '={{ { a: 1 } }}', 'object')], { mode: 'raw' })]),
    },
    {
      name: 'v2 Set predates the assignment shape',
      workflow: wf([trigger, { name: 'Build Body', type: 'n8n-nodes-base.set', typeVersion: 2 }]),
    },
  ],
  invalid: [
    {
      name: 'object-typed assignment',
      workflow: wf([trigger, set([field('customer', '={{ $json.customer }}', 'object')])]),
      errors: [{ messageId: 'useRawMode', nodeName: 'Build Body', data: { field: 'customer' } }],
    },
    {
      name: 'expression opening an object literal',
      workflow: wf([trigger, set([field('body', '={{ { id: $json.id } }}')])]),
      errors: [{ messageId: 'useRawMode', nodeName: 'Build Body', data: { field: 'body' } }],
    },
    {
      name: 'expression opening an array literal',
      workflow: wf([trigger, set([field('items', '={{ [1, 2, 3] }}')])]),
      errors: [{ messageId: 'useRawMode', nodeName: 'Build Body', data: { field: 'items' } }],
    },
  ],
});
