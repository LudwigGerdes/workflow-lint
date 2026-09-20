import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../../src/rules/reliability/webhook-responds-early.js';
import { wf } from '../helpers/wf.js';

const WEBHOOK = 'Order Received';
const webhook = (responseMode?: string) => ({
  name: WEBHOOK,
  type: 'n8n-nodes-base.webhook',
  typeVersion: 2.1,
  parameters: { path: 'orders', ...(responseMode ? { responseMode } : {}) },
});
const respond = { name: 'Respond OK', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.5 };
const http = {
  name: 'POST Orders - Forward',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  parameters: { url: 'https://api.acme.io/orders', options: {} },
};
const set = { name: 'Shape Payload', type: 'n8n-nodes-base.set', typeVersion: 3.4 };

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    {
      name: 'responds immediately on receipt',
      workflow: wf([webhook('onReceived'), http], [[WEBHOOK, http.name]]),
    },
    {
      name: 'replies before the slow work',
      workflow: wf([webhook('responseNode'), respond, http], [
        [WEBHOOK, respond.name],
        [respond.name, http.name],
      ]),
    },
    {
      name: 'only cheap work before replying',
      workflow: wf([webhook('responseNode'), set, respond], [
        [WEBHOOK, set.name],
        [set.name, respond.name],
      ]),
    },
  ],
  invalid: [
    {
      name: 'caller waits for an HTTP call',
      workflow: wf([webhook('responseNode'), http, respond], [
        [WEBHOOK, http.name],
        [http.name, respond.name],
      ]),
      errors: [
        { messageId: 'heavyBeforeRespond', nodeName: WEBHOOK, data: { heavy: 'POST Orders - Forward' } },
      ],
    },
    {
      name: 'lastNode mode with slow work in the way',
      workflow: wf([webhook('lastNode'), set, http], [
        [WEBHOOK, set.name],
        [set.name, http.name],
      ]),
      errors: [{ messageId: 'heavyBeforeRespond', nodeName: WEBHOOK }],
    },
  ],
});
