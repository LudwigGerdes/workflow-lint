import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../../src/rules/naming/agent-tool-snake-case.js';
import { wf, trigger } from '../helpers/wf.js';

// toolHttpRequest has no `name` parameter, so its tool name is the node name.
const httpTool = (name: string) => ({
  name,
  type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
  typeVersion: 1.1,
  parameters: { url: 'https://api.acme.test/mx' },
});

// toolWorkflow does declare `name`, which then wins over the node name.
const workflowTool = (nodeName: string, toolName: string) => ({
  name: nodeName,
  type: '@n8n/n8n-nodes-langchain.toolWorkflow',
  typeVersion: 2.2,
  parameters: { name: toolName },
});

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    { name: 'snake_case node name', workflow: wf([trigger, httpTool('mx_record_lookup')]) },
    { name: 'snake_case name parameter', workflow: wf([trigger, workflowTool('Lookup Order', 'lookup_order')]) },
    { name: 'non-tool nodes ignored', workflow: wf([trigger, { name: 'Shape Payload', type: 'n8n-nodes-base.set', typeVersion: 3.4 }]) },
  ],
  invalid: [
    {
      name: 'node name converted',
      workflow: wf([trigger, httpTool('MX Record Lookup')]),
      errors: [
        { messageId: 'snakeCase', nodeName: 'MX Record Lookup', data: { suggestion: 'mx_record_lookup' } },
      ],
      output: wf([trigger, httpTool('mx_record_lookup')]),
    },
    {
      name: 'name parameter converted, node name untouched',
      workflow: wf([trigger, workflowTool('Lookup Order', 'Lookup Order')]),
      errors: [{ messageId: 'snakeCase', nodeName: 'Lookup Order', data: { suggestion: 'lookup_order' } }],
      output: wf([trigger, workflowTool('Lookup Order', 'lookup_order')]),
    },
    {
      name: 'camelCase split at the boundary',
      workflow: wf([trigger, httpTool('mxRecordLookup')]),
      errors: [{ messageId: 'snakeCase', data: { suggestion: 'mx_record_lookup' } }],
      output: wf([trigger, httpTool('mx_record_lookup')]),
    },
  ],
});
