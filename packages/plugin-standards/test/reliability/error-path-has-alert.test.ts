import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../../src/rules/reliability/error-path-has-alert.js';
import { wf, trigger, type TestNode } from '../helpers/wf.js';

const HTTP_NAME = 'GET Users - Fetch active';
const http = (over: Partial<TestNode> = {}): TestNode => ({
  name: HTTP_NAME,
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  parameters: { url: 'https://api.acme.io/users', options: {} },
  onError: 'continueErrorOutput',
  ...over,
});
const set = (name: string) => ({ name, type: 'n8n-nodes-base.set', typeVersion: 3.4 });
const slack = { name: 'Notify Team', type: 'n8n-nodes-base.slack', typeVersion: 2.3 };
const stop = { name: 'Fail Loudly', type: 'n8n-nodes-base.stopAndError', typeVersion: 1 };
const merge = { name: 'Combine Paths', type: 'n8n-nodes-base.merge', typeVersion: 3.2 };

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    {
      name: 'error path notifies before rejoining',
      workflow: wf([trigger, http(), set('Happy Path'), slack, merge], [
        [HTTP_NAME, 'Happy Path', 0, 0],
        [HTTP_NAME, slack.name, 1, 0],
        ['Happy Path', merge.name, 0, 0],
        [slack.name, merge.name, 0, 1],
      ]),
    },
    {
      name: 'error path stops the run',
      workflow: wf([trigger, http(), set('Happy Path'), stop], [
        [HTTP_NAME, 'Happy Path', 0, 0],
        [HTTP_NAME, stop.name, 1, 0],
      ]),
    },
    {
      name: 'no error routing configured',
      workflow: wf([trigger, http({ onError: undefined }), set('Happy Path')], [
        [HTTP_NAME, 'Happy Path', 0, 0],
      ]),
    },
  ],
  invalid: [
    {
      name: 'error path rejoins silently',
      workflow: wf([trigger, http(), set('Happy Path'), set('Swallow Error'), merge], [
        [HTTP_NAME, 'Happy Path', 0, 0],
        [HTTP_NAME, 'Swallow Error', 1, 0],
        ['Happy Path', merge.name, 0, 0],
        ['Swallow Error', merge.name, 0, 1],
      ]),
      errors: [{ messageId: 'noAlert', nodeName: HTTP_NAME }],
    },
    {
      name: 'error path just ends',
      workflow: wf([trigger, http(), set('Happy Path'), set('Swallow Error')], [
        [HTTP_NAME, 'Happy Path', 0, 0],
        [HTTP_NAME, 'Swallow Error', 1, 0],
      ]),
      errors: [{ messageId: 'noAlert', nodeName: HTTP_NAME }],
    },
  ],
});
