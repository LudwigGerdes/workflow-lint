import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../../src/rules/structure/loop-iteration-guard.js';
import { wf, trigger } from '../helpers/wf.js';

const set = (name: string) => ({ name, type: 'n8n-nodes-base.set', typeVersion: 3.4 });
const ifOn = (expression: string) => ({
  name: 'Should Continue?',
  type: 'n8n-nodes-base.if',
  typeVersion: 2.2,
  parameters: { conditions: { conditions: [{ leftValue: expression, rightValue: 5, operator: { type: 'number', operation: 'lt' } }] } },
});
const manualLoop = (expression: string) =>
  wf([trigger, set('Call Model'), ifOn(expression)], [
    [trigger.name, 'Call Model'],
    ['Call Model', 'Should Continue?'],
    ['Should Continue?', 'Call Model', 1, 0],
  ]);

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    { name: 'guarded by an attempt counter', workflow: manualLoop('={{ $json.attempt }}') },
    {
      name: 'SplitInBatches is bounded by its items',
      workflow: wf(
        [trigger, { name: 'Loop Over Items', type: 'n8n-nodes-base.splitInBatches', typeVersion: 3 }, set('Loop Body')],
        [
          [trigger.name, 'Loop Over Items'],
          ['Loop Over Items', 'Loop Body', 1, 0],
          ['Loop Body', 'Loop Over Items'],
        ],
      ),
    },
    { name: 'no loop', workflow: wf([trigger, set('A')], [[trigger.name, 'A']]) },
  ],
  invalid: [
    {
      name: 'condition does not count anything',
      workflow: manualLoop('={{ $json.passes }}'),
      errors: [{ messageId: 'unbounded' }],
    },
  ],
});
