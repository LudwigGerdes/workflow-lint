import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../../src/rules/structure/merge-for-reconvergence.js';
import { wf, trigger } from '../helpers/wf.js';

const set = (name: string) => ({ name, type: 'n8n-nodes-base.set', typeVersion: 3.4 });
const ifNode = { name: 'Is Premium?', type: 'n8n-nodes-base.if', typeVersion: 2.2 };
const merge = { name: 'Combine Branches', type: 'n8n-nodes-base.merge', typeVersion: 3.2 };

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    {
      name: 'branches reconverge through a Merge on separate inputs',
      workflow: wf([trigger, ifNode, set('A'), set('B'), merge], [
        ['Is Premium?', 'A', 0, 0],
        ['Is Premium?', 'B', 1, 0],
        ['A', 'Combine Branches', 0, 0],
        ['B', 'Combine Branches', 0, 1],
      ]),
    },
    { name: 'linear chain', workflow: wf([trigger, set('A')], [[trigger.name, 'A']]) },
  ],
  invalid: [
    {
      name: 'two branches into one Set input',
      workflow: wf([trigger, ifNode, set('A'), set('B'), set('Combine')], [
        ['Is Premium?', 'A', 0, 0],
        ['Is Premium?', 'B', 1, 0],
        ['A', 'Combine', 0, 0],
        ['B', 'Combine', 0, 0],
      ]),
      errors: [
        {
          messageId: 'multipleSources',
          nodeName: 'Combine',
          data: { input: 0, count: 2, sources: 'A, B' },
        },
      ],
    },
    {
      name: 'both IF outputs into the same input',
      workflow: wf([trigger, ifNode, set('Next')], [
        ['Is Premium?', 'Next', 0, 0],
        ['Is Premium?', 'Next', 1, 0],
      ]),
      errors: [{ messageId: 'multipleSources', nodeName: 'Next', data: { input: 0 } }],
    },
  ],
});
