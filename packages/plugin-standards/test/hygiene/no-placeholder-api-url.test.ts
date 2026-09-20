import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../../src/rules/hygiene/no-placeholder-api-url.js';
import { wf, trigger } from '../helpers/wf.js';

const http = (name: string, url: string, disabled = false) => ({
  name,
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  parameters: { url, options: {} },
  ...(disabled ? { disabled: true } : {}),
});

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    { name: 'a real endpoint', workflow: wf([trigger, http('GET Users - Fetch active', 'https://api.acme.io/users')]) },
    {
      name: 'a Set named for its intent',
      workflow: wf([trigger, { name: 'Shape Payload', type: 'n8n-nodes-base.set', typeVersion: 3.4 }]),
    },
  ],
  invalid: [
    {
      name: 'example.com placeholder',
      workflow: wf([trigger, http('GET Users - Fetch active', 'https://api.example.com/users')]),
      errors: [{ messageId: 'placeholderUrl', nodeName: 'GET Users - Fetch active' }],
    },
    {
      name: 'still reported when the node is disabled',
      workflow: wf([trigger, http('GET Users - Fetch active', 'https://your-domain.test/users', true)]),
      errors: [{ messageId: 'placeholderUrl', nodeName: 'GET Users - Fetch active' }],
    },
    {
      name: 'a Set standing in for a call',
      workflow: wf([trigger, { name: 'GET Users', type: 'n8n-nodes-base.set', typeVersion: 3.4 }]),
      errors: [{ messageId: 'setAsApiPlaceholder', nodeName: 'GET Users' }],
    },
  ],
});
