import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../../src/rules/naming/decision-node-question-mark.js';
import { wf, trigger } from '../helpers/wf.js';

const ifNode = (name: string) => ({ name, type: 'n8n-nodes-base.if', typeVersion: 2.2 });
const consumer = (ref: string) => ({
  name: 'Shape Payload',
  type: 'n8n-nodes-base.set',
  typeVersion: 3.4,
  parameters: {
    assignments: { assignments: [{ id: '1', name: 'id', value: `={{ $('${ref}').item.json.id }}`, type: 'string' }] },
    options: {},
  },
});

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    { name: 'already a question', workflow: wf([trigger, ifNode('Is Valid?')]) },
    { name: 'other node types are ignored', workflow: wf([trigger, { name: 'Shape Payload', type: 'n8n-nodes-base.set', typeVersion: 3.4 }]) },
  ],
  invalid: [
    {
      name: 'IF renamed, propagating into connections and expressions',
      workflow: wf(
        [trigger, ifNode('Is Valid'), consumer('Is Valid')],
        [[trigger.name, 'Is Valid'], ['Is Valid', 'Shape Payload']],
      ),
      errors: [{ messageId: 'questionMark', nodeName: 'Is Valid', data: { name: 'Is Valid' } }],
      output: wf(
        [trigger, ifNode('Is Valid?'), consumer('Is Valid?')],
        [[trigger.name, 'Is Valid?'], ['Is Valid?', 'Shape Payload']],
      ),
    },
    {
      name: 'Filter nodes too',
      workflow: wf([trigger, { name: 'Keep Active Users', type: 'n8n-nodes-base.filter', typeVersion: 2.2 }]),
      errors: [{ messageId: 'questionMark', nodeName: 'Keep Active Users' }],
      output: wf([trigger, { name: 'Keep Active Users?', type: 'n8n-nodes-base.filter', typeVersion: 2.2 }]),
    },
  ],
});
