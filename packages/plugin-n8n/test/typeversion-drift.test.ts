import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../src/rules/typeversion-drift.js';
import { wf } from './helpers/wf.js';

const node = (type: string, typeVersion: number, parameters: Record<string, unknown> = {}) => ({
  name: 'Node Under Test',
  type,
  typeVersion,
  parameters,
});

const SET = 'n8n-nodes-base.set';
const PINNED = { n8nVersion: '2.38.3' };

new RuleTester({ settings: PINNED }).run(rule, {
  valid: [
    { name: 'a version the target knows', workflow: wf([node(SET, 3.4)]) },
    // Lagging behind is forward drift: n8n/typeversion-policy's business.
    { name: 'older than the default is not drift', workflow: wf([node(SET, 3.1)]) },
    { name: 'unknown node type is left to n8n/valid', workflow: wf([node('n8n-nodes-base.nope', 1)]) },
    {
      // With no target there is nothing to drift from, and guessing would fail
      // every unpinned repo.
      name: 'silent when no n8n version is pinned',
      workflow: wf([node(SET, 9.9)]),
      settings: {},
    },
  ],
  invalid: [
    {
      name: 'a typeVersion the target does not know',
      workflow: wf([node(SET, 9.9)]),
      errors: [{ messageId: 'unknownVersion', nodeName: 'Node Under Test', data: { version: 9.9 } }],
    },
    {
      name: 'newer than the target default',
      workflow: wf([node('n8n-nodes-base.airtop', 1.1)]),
      errors: [
        { messageId: 'newerThanTarget', nodeName: 'Node Under Test', data: { defaultVersion: 1 } },
      ],
    },
  ],
});
