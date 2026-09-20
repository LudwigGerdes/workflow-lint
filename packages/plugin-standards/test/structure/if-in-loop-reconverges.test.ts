import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../../src/rules/structure/if-in-loop-reconverges.js';
import { wf, trigger } from '../helpers/wf.js';

const sib = { name: 'Loop Over Items', type: 'n8n-nodes-base.splitInBatches', typeVersion: 3 };
const ifNode = { name: 'Is Premium?', type: 'n8n-nodes-base.if', typeVersion: 2.2 };
const set = (name: string) => ({ name, type: 'n8n-nodes-base.set', typeVersion: 3.4 });
const merge = { name: 'Combine Branches', type: 'n8n-nodes-base.merge', typeVersion: 3.2 };

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    {
      name: 'branches reconverge through a Merge',
      workflow: wf([trigger, sib, ifNode, set('Premium Path'), set('Standard Path'), merge], [
        [trigger.name, 'Loop Over Items'],
        ['Loop Over Items', 'Is Premium?', 1, 0],
        ['Is Premium?', 'Premium Path', 0, 0],
        ['Is Premium?', 'Standard Path', 1, 0],
        ['Premium Path', 'Combine Branches', 0, 0],
        ['Standard Path', 'Combine Branches', 0, 1],
        ['Combine Branches', 'Loop Over Items'],
      ]),
    },
    {
      name: 'loop body with no branch',
      workflow: wf([trigger, sib, set('Loop Body')], [
        [trigger.name, 'Loop Over Items'],
        ['Loop Over Items', 'Loop Body', 1, 0],
        ['Loop Body', 'Loop Over Items'],
      ]),
    },
    {
      name: 'branch outside any loop',
      workflow: wf([trigger, ifNode, set('A'), set('B')], [
        [trigger.name, 'Is Premium?'],
        ['Is Premium?', 'A', 0, 0],
        ['Is Premium?', 'B', 1, 0],
      ]),
    },
  ],
  invalid: [
    {
      name: 'both branches return to the loop separately',
      workflow: wf([trigger, sib, ifNode, set('Premium Path'), set('Standard Path')], [
        [trigger.name, 'Loop Over Items'],
        ['Loop Over Items', 'Is Premium?', 1, 0],
        ['Is Premium?', 'Premium Path', 0, 0],
        ['Is Premium?', 'Standard Path', 1, 0],
        ['Premium Path', 'Loop Over Items'],
        ['Standard Path', 'Loop Over Items'],
      ]),
      errors: [{ messageId: 'missingMerge', nodeName: 'Loop Over Items', data: { loop: 'Loop Over Items' } }],
    },
  ],
});
