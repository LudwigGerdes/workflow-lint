import { RuleTester } from 'workflow-lint-core/rule-tester';
import type { WorkflowJson } from 'workflow-lint-core';
import { rule } from '../../src/rules/naming/no-default-node-name.js';

/**
 * The Manual Trigger's *default name* is not "Manual Trigger" — that is only
 * its displayName. isDefaultNodeName compares against `defaults.name`, so the
 * trigger fixture must carry the real default to be a default at all.
 */
const TRIGGER_DEFAULT_NAME = 'When clicking ‘Execute workflow’';

const base = (nodes: object[]): WorkflowJson =>
  ({
    nodes: [
      {
        name: TRIGGER_DEFAULT_NAME,
        type: 'n8n-nodes-base.manualTrigger',
        typeVersion: 1,
        position: [0, 0],
        parameters: {},
      },
      ...nodes,
    ],
    connections: {},
  }) as unknown as WorkflowJson;

const setNode = (name: string) => ({
  name,
  type: 'n8n-nodes-base.set',
  typeVersion: 3.4,
  position: [192, 0],
  parameters: {},
});

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    { name: 'renamed set', workflow: base([setNode('Extract Email')]) },
    {
      name: 'trigger default names are allowed by option',
      workflow: base([]),
      options: { allowTriggers: true },
    },
  ],
  invalid: [
    {
      name: 'Edit Fields default',
      workflow: base([setNode('Edit Fields')]),
      errors: [{ messageId: 'defaultName', nodeName: 'Edit Fields', data: { name: 'Edit Fields' } }],
    },
    {
      name: 'numbered default',
      workflow: base([
        {
          name: 'HTTP Request2',
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: 4.2,
          position: [192, 0],
          parameters: {},
        },
      ]),
      errors: [{ messageId: 'defaultName', nodeName: 'HTTP Request2' }],
    },
    {
      name: 'trigger default flagged when allowTriggers false',
      workflow: base([]),
      options: { allowTriggers: false },
      errors: [{ messageId: 'defaultName', nodeName: TRIGGER_DEFAULT_NAME }],
    },
  ],
});
