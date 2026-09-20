import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../../src/rules/reliability/webhook-input-contract.js';
import { wf } from '../helpers/wf.js';

const WEBHOOK = 'Order Received';
const webhook = { name: WEBHOOK, type: 'n8n-nodes-base.webhook', typeVersion: 2.1, parameters: { path: 'orders' } };
const validatingIf = {
  name: 'Has Order Id?',
  type: 'n8n-nodes-base.if',
  typeVersion: 2.2,
  parameters: {
    conditions: {
      conditions: [{ leftValue: '={{ $json.orderId }}', operator: { type: 'string', operation: 'exists' } }],
    },
  },
};
const plainIf = {
  name: 'Is Big?',
  type: 'n8n-nodes-base.if',
  typeVersion: 2.2,
  parameters: {
    conditions: { conditions: [{ leftValue: '={{ $json.total }}', operator: { type: 'number', operation: 'gt' } }] },
  },
};
const stop = { name: 'Reject Bad Input', type: 'n8n-nodes-base.stopAndError', typeVersion: 1 };
const set = { name: 'Shape Payload', type: 'n8n-nodes-base.set', typeVersion: 3.4 };
const http = {
  name: 'POST Orders - Forward',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  parameters: { url: 'https://api.acme.io/orders', options: {} },
};

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    {
      name: 'validates the payload and rejects bad input',
      workflow: wf([webhook, validatingIf, set, stop], [
        [WEBHOOK, validatingIf.name],
        [validatingIf.name, set.name, 0, 0],
        [validatingIf.name, stop.name, 1, 0],
      ]),
    },
  ],
  invalid: [
    {
      name: 'accepts whatever arrives',
      workflow: wf([webhook, set, http], [
        [WEBHOOK, set.name],
        [set.name, http.name],
      ]),
      errors: [{ messageId: 'noContract', nodeName: WEBHOOK }],
    },
    {
      name: 'branches, but on business logic rather than a contract check',
      workflow: wf([webhook, plainIf, set, stop], [
        [WEBHOOK, plainIf.name],
        [plainIf.name, set.name, 0, 0],
        [plainIf.name, stop.name, 1, 0],
      ]),
      errors: [{ messageId: 'noContract', nodeName: WEBHOOK }],
    },
    {
      name: 'validates but never rejects',
      workflow: wf([webhook, validatingIf, set], [
        [WEBHOOK, validatingIf.name],
        [validatingIf.name, set.name, 0, 0],
      ]),
      errors: [{ messageId: 'noContract', nodeName: WEBHOOK }],
    },
  ],
});
