import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../../src/rules/structure/branch-entry-pass-through.js';
import { wf, trigger } from '../helpers/wf.js';

const ifNode = { name: 'Is Valid?', type: 'n8n-nodes-base.if', typeVersion: 2.2 };
const sib = { name: 'Loop Over Items', type: 'n8n-nodes-base.splitInBatches', typeVersion: 3 };
const noOp = (name: string) => ({ name, type: 'n8n-nodes-base.noOp', typeVersion: 1 });
const passSet = (name: string) => ({
  name,
  type: 'n8n-nodes-base.set',
  typeVersion: 3.4,
  parameters: { includeOtherFields: true },
});
const plainSet = (name: string) => ({ name, type: 'n8n-nodes-base.set', typeVersion: 3.4 });
const http = (name: string) => ({
  name,
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  parameters: { url: 'https://api.acme.test/x', options: {} },
});

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    {
      name: 'both IF branches open with a NoOp',
      workflow: wf([trigger, ifNode, noOp('Valid'), noOp('Invalid')], [
        [trigger.name, 'Is Valid?'],
        ['Is Valid?', 'Valid', 0, 0],
        ['Is Valid?', 'Invalid', 1, 0],
      ]),
    },
    {
      name: 'pass-through Set that keeps the incoming fields',
      workflow: wf([trigger, ifNode, passSet('Valid Order')], [['Is Valid?', 'Valid Order', 0, 0]]),
    },
    {
      name: 'non-branching nodes are ignored',
      workflow: wf([trigger, http('GET Users - Fetch')], [[trigger.name, 'GET Users - Fetch']]),
    },
  ],
  invalid: [
    {
      name: 'branch goes straight into work',
      workflow: wf([trigger, ifNode, http('GET Users - Fetch')], [['Is Valid?', 'GET Users - Fetch', 0, 0]]),
      errors: [
        {
          messageId: 'missingPassThrough',
          nodeName: 'GET Users - Fetch',
          data: { source: 'Is Valid?', output: 0 },
        },
      ],
    },
    {
      name: 'loop branch Set drops the incoming data',
      workflow: wf([trigger, sib, plainSet('Loop Body')], [['Loop Over Items', 'Loop Body', 1, 0]]),
      errors: [
        {
          messageId: 'setWithoutInclude',
          nodeName: 'Loop Body',
          data: { source: 'Loop Over Items', output: 1 },
        },
      ],
    },
    {
      name: 'both Switch branches unguarded',
      workflow: wf([trigger, { name: 'Route By Plan', type: 'n8n-nodes-base.switch', typeVersion: 3.3 }, http('GET Free - Fetch'), http('GET Pro - Fetch')], [
        ['Route By Plan', 'GET Free - Fetch', 0, 0],
        ['Route By Plan', 'GET Pro - Fetch', 1, 0],
      ]),
      errors: [
        { messageId: 'missingPassThrough', nodeName: 'GET Free - Fetch', data: { output: 0 } },
        { messageId: 'missingPassThrough', nodeName: 'GET Pro - Fetch', data: { output: 1 } },
      ],
    },
  ],
});
