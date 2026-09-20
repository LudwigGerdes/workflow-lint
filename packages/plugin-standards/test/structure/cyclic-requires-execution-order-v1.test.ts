import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../../src/rules/structure/cyclic-requires-execution-order-v1.js';
import { wf, trigger } from '../helpers/wf.js';

const sib = { name: 'Loop Over Items', type: 'n8n-nodes-base.splitInBatches', typeVersion: 3 };
const set = (name: string) => ({ name, type: 'n8n-nodes-base.set', typeVersion: 3.4 });
const loopEdges = [
  [trigger.name, 'Loop Over Items'],
  ['Loop Over Items', 'Loop Body', 1, 0],
  ['Loop Body', 'Loop Over Items'],
] as Array<[string, string, number?, number?]>;

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    {
      name: 'loop already on v1',
      workflow: wf([trigger, sib, set('Loop Body')], loopEdges, { executionOrder: 'v1' }),
    },
    { name: 'no loop at all', workflow: wf([trigger, set('A')], [[trigger.name, 'A']]) },
  ],
  invalid: [
    {
      name: 'loop without executionOrder v1',
      workflow: wf([trigger, sib, set('Loop Body')], loopEdges),
      errors: [{ messageId: 'needsV1' }],
      output: wf([trigger, sib, set('Loop Body')], loopEdges, { executionOrder: 'v1' }),
    },
  ],
});
