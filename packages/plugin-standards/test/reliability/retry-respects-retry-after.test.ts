import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../../src/rules/reliability/retry-respects-retry-after.js';
import { wf, trigger, type TestNode } from '../helpers/wf.js';

const HTTP_NAME = 'GET Users - Fetch active';
const http = (over: Partial<TestNode> = {}): TestNode => ({
  name: HTTP_NAME,
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  parameters: { url: 'https://api.acme.io/users', options: {} },
  ...over,
});

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    {
      name: 'a deliberate fixed delay',
      workflow: wf([trigger, http({ retryOnFail: true, waitBetweenTries: 1500 })]),
    },
    {
      name: 'the node reads Retry-After itself',
      workflow: wf([
        trigger,
        http({
          retryOnFail: true,
          parameters: {
            url: 'https://api.acme.io/users',
            options: {},
            headerParameters: { parameters: [{ name: 'X-Wait', value: '={{ $response.headers["retry-after"] }}' }] },
          },
        }),
      ]),
    },
    { name: 'not retrying at all', workflow: wf([trigger, http()]) },
  ],
  invalid: [
    {
      name: 'retries on the default delay, ignoring the header',
      workflow: wf([trigger, http({ retryOnFail: true })]),
      errors: [{ messageId: 'ignoresRetryAfter', nodeName: HTTP_NAME }],
    },
    {
      name: 'retry enabled with a non-numeric wait',
      workflow: wf([trigger, http({ retryOnFail: true, waitBetweenTries: '={{ 200 }}' } as Partial<TestNode>)]),
      errors: [{ messageId: 'ignoresRetryAfter', nodeName: HTTP_NAME }],
    },
  ],
});
