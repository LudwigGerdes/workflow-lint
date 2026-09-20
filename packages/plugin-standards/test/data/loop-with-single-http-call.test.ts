import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../../src/rules/data/loop-with-single-http-call.js';
import { wf, trigger } from '../helpers/wf.js';

const LOOP = 'Loop Over Items';
const sib = { name: LOOP, type: 'n8n-nodes-base.splitInBatches', typeVersion: 3 };
const http = (name: string) => ({
  name,
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  parameters: { url: 'https://api.acme.io/users', options: {} },
});
const set = (name: string) => ({ name, type: 'n8n-nodes-base.set', typeVersion: 3.4 });

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    {
      name: 'loop body makes more than one call',
      workflow: wf([trigger, sib, http('GET User - Fetch one'), http('POST Audit - Record')], [
        [trigger.name, LOOP],
        [LOOP, 'GET User - Fetch one', 1, 0],
        ['GET User - Fetch one', 'POST Audit - Record'],
        ['POST Audit - Record', LOOP],
      ]),
    },
    {
      name: 'body aggregates its results',
      workflow: wf([trigger, sib, http('GET User - Fetch one'), { name: 'Collect', type: 'n8n-nodes-base.aggregate', typeVersion: 1 }], [
        [LOOP, 'GET User - Fetch one', 1, 0],
        ['GET User - Fetch one', 'Collect'],
        ['Collect', LOOP],
      ]),
    },
    {
      name: 'no loop at all',
      workflow: wf([trigger, http('GET Users - Fetch active')], [[trigger.name, 'GET Users - Fetch active']]),
    },
  ],
  invalid: [
    {
      name: 'loop wraps a single call',
      workflow: wf([trigger, sib, http('GET User - Fetch one')], [
        [trigger.name, LOOP],
        [LOOP, 'GET User - Fetch one', 1, 0],
        ['GET User - Fetch one', LOOP],
      ]),
      errors: [
        { messageId: 'batchCandidate', nodeName: LOOP, data: { loop: LOOP, http: 'GET User - Fetch one' } },
      ],
    },
    {
      name: 'a pass-through beside the call does not count as aggregation',
      workflow: wf([trigger, sib, http('GET User - Fetch one'), set('Shape Payload')], [
        [trigger.name, LOOP],
        [LOOP, 'GET User - Fetch one', 1, 0],
        ['GET User - Fetch one', 'Shape Payload'],
        ['Shape Payload', LOOP],
      ]),
      errors: [{ messageId: 'batchCandidate', nodeName: LOOP }],
    },
  ],
});
