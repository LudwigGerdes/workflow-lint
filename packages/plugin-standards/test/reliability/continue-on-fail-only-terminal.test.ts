import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../../src/rules/reliability/continue-on-fail-only-terminal.js';
import { wf, trigger, type TestNode } from '../helpers/wf.js';

const http = (over: Partial<TestNode> = {}): TestNode => ({
  name: 'GET Users - Fetch active',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  parameters: { url: 'https://api.acme.io/users', options: {} },
  ...over,
});
const set = { name: 'Shape Payload', type: 'n8n-nodes-base.set', typeVersion: 3.4 };
const slack = { name: 'Notify Team', type: 'n8n-nodes-base.slack', typeVersion: 2.3 };
const stop = { name: 'Fail Loudly', type: 'n8n-nodes-base.stopAndError', typeVersion: 1 };

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    { name: 'no failure suppression', workflow: wf([trigger, http(), set], [[http().name, set.name]]) },
    {
      name: 'suppressed at the end of the path',
      workflow: wf([trigger, { ...slack, onError: 'continueRegularOutput' }], [
        [trigger.name, slack.name],
      ]),
    },
    {
      name: 'downstream is only a notification',
      workflow: wf([trigger, http({ onError: 'continueRegularOutput' }), slack], [
        [http().name, slack.name],
      ]),
    },
    {
      name: 'continueErrorOutput routed to Stop and Error',
      workflow: wf([trigger, http({ onError: 'continueErrorOutput' }), set, stop], [
        [http().name, set.name, 0, 0],
        [http().name, stop.name, 1, 0],
      ]),
    },
  ],
  invalid: [
    {
      name: 'failure continues into ordinary work',
      workflow: wf([trigger, http({ onError: 'continueRegularOutput' }), set], [
        [http().name, set.name],
      ]),
      errors: [
        {
          messageId: 'suppressedUpstream',
          nodeName: 'GET Users - Fetch active',
          data: { consumers: 'Shape Payload' },
        },
      ],
    },
    {
      name: 'legacy continueOnFail flag',
      workflow: wf([trigger, http({ continueOnFail: true }), set], [[http().name, set.name]]),
      errors: [{ messageId: 'suppressedUpstream', nodeName: 'GET Users - Fetch active' }],
    },
    {
      name: 'continueErrorOutput with the error output left unwired',
      workflow: wf([trigger, http({ onError: 'continueErrorOutput' }), set], [
        [http().name, set.name, 0, 0],
      ]),
      errors: [{ messageId: 'suppressedUpstream', nodeName: 'GET Users - Fetch active' }],
    },
  ],
});
