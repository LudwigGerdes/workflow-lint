import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../../src/rules/data/batch-response-not-split.js';
import { wf, trigger } from '../helpers/wf.js';

const HTTP_NAME = 'GET Users - Fetch active';
const http = {
  name: HTTP_NAME,
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  parameters: { url: 'https://api.acme.io/users', options: {} },
};
const consumer = (name: string, value: string) => ({
  name,
  type: 'n8n-nodes-base.set',
  typeVersion: 3.4,
  parameters: {
    assignments: { assignments: [{ id: '1', name: 'id', value, type: 'string' }] },
    options: {},
  },
});
const splitOut = { name: 'Split Results', type: 'n8n-nodes-base.splitOut', typeVersion: 1 };

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    {
      name: 'response is split before use',
      workflow: wf([trigger, http, splitOut, consumer('Shape Payload', '={{ $json.id }}')], [
        [HTTP_NAME, splitOut.name],
        [splitOut.name, 'Shape Payload'],
      ]),
    },
    {
      name: 'reads a scalar field',
      workflow: wf([trigger, http, consumer('Shape Payload', '={{ $json.id }}')], [
        [HTTP_NAME, 'Shape Payload'],
      ]),
    },
  ],
  invalid: [
    {
      name: 'indexes into the response array',
      workflow: wf([trigger, http, consumer('Shape Payload', '={{ $json.results[0].id }}')], [
        [HTTP_NAME, 'Shape Payload'],
      ]),
      errors: [
        {
          messageId: 'arrayIndexed',
          nodeName: 'Shape Payload',
          data: { http: HTTP_NAME, field: 'results' },
        },
      ],
    },
    {
      name: 'dotted zero index',
      workflow: wf([trigger, http, consumer('Shape Payload', '={{ $json.items.0.id }}')], [
        [HTTP_NAME, 'Shape Payload'],
      ]),
      errors: [{ messageId: 'arrayIndexed', nodeName: 'Shape Payload', data: { field: 'items' } }],
    },
  ],
});
