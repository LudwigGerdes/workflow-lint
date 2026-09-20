import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../../src/rules/naming/no-type-prefix-in-name.js';
import { wf, trigger } from '../helpers/wf.js';

const set = (name: string) => ({ name, type: 'n8n-nodes-base.set', typeVersion: 3.4 });
const switchNode = (name: string, keys: Array<string | undefined>, typeVersion = 3.3) => ({
  name,
  type: 'n8n-nodes-base.switch',
  typeVersion,
  parameters: {
    rules: {
      [typeVersion >= 3 ? 'values' : 'rules']: keys.map((outputKey) => ({
        conditions: {},
        ...(outputKey === undefined ? {} : { outputKey }),
      })),
    },
  },
});

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    { name: 'intent-describing name', workflow: wf([trigger, set('Shape Payload')]) },
    { name: 'switch with output keys', workflow: wf([trigger, switchNode('Route By Plan', ['free', 'pro'])]) },
    {
      name: 'output keys not required by option',
      workflow: wf([trigger, switchNode('Route By Plan', [undefined])]),
      options: { requireSwitchOutputKeys: false },
    },
  ],
  invalid: [
    {
      name: 'Set: prefix stripped',
      workflow: wf([trigger, set('Set: Shape Payload')]),
      errors: [{ messageId: 'prefix', nodeName: 'Set: Shape Payload', data: { prefix: 'Set' } }],
      output: wf([trigger, set('Shape Payload')]),
    },
    {
      name: 'Switch: prefix stripped, keys present',
      workflow: wf([trigger, switchNode('Switch: Route By Plan', ['free', 'pro'])]),
      errors: [{ messageId: 'prefix', nodeName: 'Switch: Route By Plan' }],
      output: wf([trigger, switchNode('Route By Plan', ['free', 'pro'])]),
    },
    {
      name: 'switch branches missing output keys',
      workflow: wf([trigger, switchNode('Route By Plan', [undefined, ''])]),
      errors: [
        { messageId: 'switchOutputKey', nodeName: 'Route By Plan', data: { index: 0 } },
        { messageId: 'switchOutputKey', nodeName: 'Route By Plan', data: { index: 1 } },
      ],
    },
    {
      name: 'v2 switch keeps its branches under rules.rules',
      workflow: wf([trigger, switchNode('Route By Plan', [undefined], 2)]),
      errors: [{ messageId: 'switchOutputKey', nodeName: 'Route By Plan', data: { index: 0 } }],
    },
  ],
});
