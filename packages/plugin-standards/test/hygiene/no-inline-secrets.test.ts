import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../../src/rules/hygiene/no-inline-secrets.js';
import { wf, trigger } from '../helpers/wf.js';

const httpWithHeader = (value: string) => ({
  name: 'GET Users - Fetch active',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  parameters: {
    url: 'https://api.acme.test/users',
    sendHeaders: true,
    headerParameters: { parameters: [{ name: 'Authorization', value }] },
    options: {},
  },
});
const setValue = (value: string) => ({
  name: 'Shape Payload',
  type: 'n8n-nodes-base.set',
  typeVersion: 3.4,
  parameters: {
    assignments: { assignments: [{ id: '1', name: 'token', value, type: 'string' }] },
    options: {},
  },
});

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    { name: 'credential reference', workflow: wf([trigger, httpWithHeader('={{ $credentials.apiKey }}')]) },
    { name: 'env reference', workflow: wf([trigger, setValue('={{ $env.SLACK_TOKEN }}')]) },
    { name: 'ordinary value', workflow: wf([trigger, setValue('hello world')]) },
    { name: 'a scheme before a reference', workflow: wf([trigger, httpWithHeader('=Bearer {{ $env.API_TOKEN }}')]) },
  ],
  invalid: [
    {
      name: 'literal bearer token in a header',
      workflow: wf([trigger, httpWithHeader('Bearer abcdef0123456789abcdef')]),
      errors: [
        {
          messageId: 'secret',
          nodeName: 'GET Users - Fetch active',
          data: { parameter: 'headerParameters.parameters[0].value' },
        },
      ],
    },
    {
      name: 'slack token in a Set value',
      workflow: wf([trigger, setValue('xoxb-1234567890abcdef')]),
      errors: [
        {
          messageId: 'secret',
          nodeName: 'Shape Payload',
          data: { parameter: 'assignments.assignments[0].value' },
        },
      ],
    },
    {
      name: 'a token beside a $env reference is still a token',
      workflow: wf([trigger, setValue('=xoxb-1234567890abcdef {{ $env.NOTE }}')]),
      errors: [{ messageId: 'secret', nodeName: 'Shape Payload' }],
    },
    {
      name: 'a literal token in a header that also mentions $credentials',
      workflow: wf([trigger, httpWithHeader('=Bearer sk_live_0123456789abcdef {{ $credentials.x }}')]),
      errors: [{ messageId: 'secret', nodeName: 'GET Users - Fetch active' }],
    },
    {
      name: 'a custom denylist pattern',
      workflow: wf([trigger, setValue('ACME-INTERNAL-9f3c')]),
      options: { denylist: ['^ACME-INTERNAL-'] },
      errors: [{ messageId: 'secret', nodeName: 'Shape Payload' }],
    },
  ],
});
