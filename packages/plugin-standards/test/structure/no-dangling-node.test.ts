import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../../src/rules/structure/no-dangling-node.js';
import { wf, trigger } from '../helpers/wf.js';

const http = (name: string) => ({
  name,
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  parameters: { url: 'https://api.acme.test/x', options: {} },
});
const tail = (name: string, type: string, typeVersion = 1) => ({ name, type, typeVersion });

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    {
      name: 'a notification ends the path',
      workflow: wf([trigger, tail('Notify Team', 'n8n-nodes-base.slack', 2.3)], [
        [trigger.name, 'Notify Team'],
      ]),
    },
    {
      name: 'a named pass-through Set ends the path',
      workflow: wf([trigger, tail('Loop Done Pass Through', 'n8n-nodes-base.set', 3.4)], [
        [trigger.name, 'Loop Done Pass Through'],
      ]),
    },
    {
      name: 'Respond to Webhook and Stop and Error are terminal',
      workflow: wf(
        [trigger, tail('Respond OK', 'n8n-nodes-base.respondToWebhook', 1.5), tail('Fail Loudly', 'n8n-nodes-base.stopAndError')],
        [
          [trigger.name, 'Respond OK'],
          [trigger.name, 'Fail Loudly'],
        ],
      ),
    },
    {
      // A workflow has to end somewhere, and the corpus ends on Set, Merge,
      // httpRequest, Code and Aggregate alike — no fixed terminal list can
      // enumerate them.
      name: 'the deepest node is where the workflow ends',
      workflow: wf([trigger, tail('Shape Payload', 'n8n-nodes-base.set', 3.4)], [
        [trigger.name, 'Shape Payload'],
      ]),
    },
    {
      name: 'a workflow ending on an HTTP call',
      workflow: wf([trigger, http('GET Users - Fetch active')], [
        [trigger.name, 'GET Users - Fetch active'],
      ]),
    },
    {
      name: 'branches that all run to the same depth',
      workflow: wf(
        [
          trigger,
          { name: 'Is Valid?', type: 'n8n-nodes-base.if', typeVersion: 2.2 },
          tail('Left', 'n8n-nodes-base.set', 3.4),
          tail('Right', 'n8n-nodes-base.set', 3.4),
        ],
        [
          [trigger.name, 'Is Valid?'],
          ['Is Valid?', 'Left', 0, 0],
          ['Is Valid?', 'Right', 1, 0],
        ],
      ),
    },
    {
      name: 'a node type the pack does not know is left to n8n/valid',
      // n8n generates <node>Tool variants at runtime, so they are in no
      // bundled nodes.json and isTool() cannot recognise them.
      workflow: wf([trigger, tail('Lookup Order', 'n8n-nodes-base.httpRequestTool', 4.2)], [
        [trigger.name, 'Lookup Order'],
      ]),
    },
    {
      name: 'extra terminal types via options',
      workflow: wf([trigger, tail('Archive', 'n8n-nodes-base.s3', 1)], [[trigger.name, 'Archive']]),
      options: { terminalTypes: ['n8n-nodes-base.s3'] },
    },
  ],
  invalid: [
    {
      name: 'work abandoned while the flow continues elsewhere',
      workflow: wf(
        [
          trigger,
          { name: 'Is Valid?', type: 'n8n-nodes-base.if', typeVersion: 2.2 },
          tail('Dropped', 'n8n-nodes-base.set', 3.4),
          tail('Continues', 'n8n-nodes-base.set', 3.4),
          tail('And On', 'n8n-nodes-base.set', 3.4),
        ],
        [
          [trigger.name, 'Is Valid?'],
          ['Is Valid?', 'Dropped', 0, 0],
          ['Is Valid?', 'Continues', 1, 0],
          ['Continues', 'And On'],
        ],
      ),
      errors: [{ messageId: 'dangling', nodeName: 'Dropped' }],
    },
    {
      name: 'a branch that stops short of the others',
      workflow: wf(
        [
          trigger,
          { name: 'Route?', type: 'n8n-nodes-base.switch', typeVersion: 3.3 },
          http('GET Free - Fetch'),
          tail('Pro Path', 'n8n-nodes-base.set', 3.4),
          tail('Pro Continues', 'n8n-nodes-base.set', 3.4),
        ],
        [
          [trigger.name, 'Route?'],
          ['Route?', 'GET Free - Fetch', 0, 0],
          ['Route?', 'Pro Path', 1, 0],
          ['Pro Path', 'Pro Continues'],
        ],
      ),
      errors: [{ messageId: 'dangling', nodeName: 'GET Free - Fetch' }],
    },
  ],
});
