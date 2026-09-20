import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../../src/rules/naming/external-node-name-format.js';
import { wf, trigger } from '../helpers/wf.js';

const http = (name: string) => ({
  name,
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  parameters: { url: 'https://api.acme.test/users', options: {} },
});

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    { name: 'verb-resource-purpose', workflow: wf([trigger, http('GET Users - Fetch active')]) },
    {
      name: 'nodes without credentials are ignored',
      workflow: wf([trigger, { name: 'Shape Payload', type: 'n8n-nodes-base.set', typeVersion: 3.4 }]),
    },
    {
      name: 'a custom pattern is honoured',
      workflow: wf([trigger, http('fetch-users')]),
      options: { pattern: '^[a-z-]+$' },
    },
  ],
  invalid: [
    {
      name: 'plain description',
      workflow: wf([trigger, http('Fetch users')]),
      errors: [{ messageId: 'format', nodeName: 'Fetch users', data: { name: 'Fetch users' } }],
    },
    {
      name: 'verb but no purpose',
      workflow: wf([trigger, http('GET Users')]),
      errors: [{ messageId: 'format', nodeName: 'GET Users' }],
    },
    {
      name: 'a credentialed service node is held to the same format',
      workflow: wf([
        trigger,
        { name: 'Send message', type: 'n8n-nodes-base.slack', typeVersion: 2.3, parameters: { select: 'channel' } },
      ]),
      errors: [{ messageId: 'format', nodeName: 'Send message' }],
    },
  ],
});
