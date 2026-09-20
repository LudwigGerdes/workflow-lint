import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../../src/rules/reliability/error-output-wired.js';
import { wf, trigger, type TestNode } from '../helpers/wf.js';

const http = (over: Partial<TestNode> = {}): TestNode => ({
  name: 'GET Users - Fetch active',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  parameters: { url: 'https://api.acme.io/users', options: {} },
  ...over,
});
const set = { name: 'Shape Payload', type: 'n8n-nodes-base.set', typeVersion: 3.4 };
const stop = { name: 'Fail Loudly', type: 'n8n-nodes-base.stopAndError', typeVersion: 1 };

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    {
      name: 'error output connected',
      workflow: wf([trigger, http({ onError: 'continueErrorOutput' }), set, stop], [
        [http().name, set.name, 0, 0],
        [http().name, stop.name, 1, 0],
      ]),
    },
    { name: 'no error routing configured', workflow: wf([trigger, http(), set], [[http().name, set.name]]) },
  ],
  invalid: [
    {
      name: 'error output left unconnected',
      workflow: wf([trigger, http({ onError: 'continueErrorOutput' }), set], [
        [http().name, set.name, 0, 0],
      ]),
      errors: [{ messageId: 'unwired', nodeName: 'GET Users - Fetch active' }],
    },
    {
      name: 'nothing connected at all',
      workflow: wf([trigger, http({ onError: 'continueErrorOutput' })], [[trigger.name, http().name]]),
      errors: [{ messageId: 'unwired', nodeName: 'GET Users - Fetch active' }],
    },
  ],
});
