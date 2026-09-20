import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../../src/rules/reliability/http-retry-config.js';
import { wf, trigger, type TestNode } from '../helpers/wf.js';

const HTTP_NAME = 'GET Users - Fetch active';
const http = (over: Partial<TestNode> = {}): TestNode => ({
  name: HTTP_NAME,
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  parameters: { url: 'https://api.acme.io/users', options: {} },
  ...over,
});
const retrying = { retryOnFail: true, maxTries: 3, waitBetweenTries: 500 };

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    { name: 'retry configured explicitly', workflow: wf([trigger, http(retrying)]) },
    {
      name: 'retry on, relying on n8n defaults of 3 tries and 1000ms',
      workflow: wf([trigger, http({ retryOnFail: true })]),
    },
    {
      name: 'retryOnFail decided by an expression',
      workflow: wf([trigger, http({ retryOnFail: '={{ $json.shouldRetry }}' } as Partial<TestNode>)]),
    },
    {
      name: 'non-network nodes are ignored',
      workflow: wf([trigger, { name: 'Shape Payload', type: 'n8n-nodes-base.set', typeVersion: 3.4 }]),
    },
  ],
  invalid: [
    {
      name: 'no retry at all',
      workflow: wf([trigger, http()]),
      errors: [{ messageId: 'noRetry', nodeName: HTTP_NAME }],
      output: wf([trigger, http(retrying)]),
    },
    {
      name: 'too few tries',
      workflow: wf([trigger, http({ retryOnFail: true, maxTries: 1 })]),
      errors: [{ messageId: 'tooFewTries', nodeName: HTTP_NAME, data: { actual: 1, minTries: 3 } }],
      output: wf([trigger, http({ retryOnFail: true, maxTries: 3 })]),
    },
    {
      name: 'wait too short',
      workflow: wf([trigger, http({ retryOnFail: true, waitBetweenTries: 100 })]),
      errors: [{ messageId: 'waitTooShort', nodeName: HTTP_NAME, data: { actual: 100, minWait: 500 } }],
      output: wf([trigger, http({ retryOnFail: true, waitBetweenTries: 500 })]),
    },
    {
      name: 'thresholds are configurable',
      workflow: wf([trigger, http({ retryOnFail: true, maxTries: 3 })]),
      options: { minTries: 5 },
      errors: [{ messageId: 'tooFewTries', nodeName: HTTP_NAME, data: { minTries: 5 } }],
      output: wf([trigger, http({ retryOnFail: true, maxTries: 5 })]),
    },
  ],
});
