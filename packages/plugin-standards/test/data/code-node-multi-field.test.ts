import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../../src/rules/data/code-node-multi-field.js';
import { wf, trigger } from '../helpers/wf.js';

const code = (jsCode: string) => ({
  name: 'Build Payload',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  parameters: { jsCode },
});

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    { name: 'two fields is not a pile', workflow: wf([trigger, code('return [{ json: { a: 1, b: 2 } }];')]) },
    {
      name: 'fields built from a shared local are related work',
      workflow: wf([
        trigger,
        code('const total = $json.x + $json.y;\nreturn [{ json: { sum: total, doubled: total * 2, label: `${total}` } }];'),
      ]),
    },
    {
      name: 'one field referencing another is not independent',
      workflow: wf([trigger, code('return { json: { a: 1, b: 2, c: a } };')]),
    },
    { name: 'unparseable code is left to n8n', workflow: wf([trigger, code('return [{ json: { ')]) },
    { name: 'no code at all', workflow: wf([trigger, code('')]) },
  ],
  invalid: [
    {
      name: 'three independent literals',
      workflow: wf([trigger, code('return [{ json: { a: 1, b: 2, c: 3 } }];')]),
      errors: [{ messageId: 'independentFields', nodeName: 'Build Payload', data: { count: 3 } }],
    },
    {
      name: 'three independent reads of the incoming item',
      workflow: wf([
        trigger,
        code('return { json: { email: $json.email, name: $json.name, id: $json.id } };'),
      ]),
      errors: [{ messageId: 'independentFields', nodeName: 'Build Payload', data: { count: 3 } }],
    },
    {
      name: 'inside a map callback',
      workflow: wf([
        trigger,
        code('return items.map(i => ({ json: { a: i.json.a, b: i.json.b, c: i.json.c } }));'),
      ]),
      options: { maxFields: 3 },
      errors: [{ messageId: 'independentFields', nodeName: 'Build Payload' }],
    },
  ],
});
