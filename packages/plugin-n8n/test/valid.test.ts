import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../src/rules/valid.js';
import { wf, trigger, httpOk } from './helpers/wf.js';

const set = (name: string, parameters: Record<string, unknown> = {}) => ({
  name,
  type: 'n8n-nodes-base.set',
  typeVersion: 3.4,
  parameters,
});

const agent = (parameters: Record<string, unknown>) => ({
  name: 'Answer Question',
  type: '@n8n/n8n-nodes-langchain.agent',
  typeVersion: 3,
  parameters,
});

const SYSTEM = { options: { systemMessage: 'You are a helpful assistant.' } };

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    {
      name: 'clean linear workflow',
      workflow: wf([trigger, httpOk, set('Shape Payload')], [
        [trigger.name, httpOk.name],
        [httpOk.name, 'Shape Payload'],
      ]),
    },
    {
      name: 'sub-workflow needs no trigger node',
      workflow: wf(
        [
          { name: 'When Executed by Another Workflow', type: 'n8n-nodes-base.executeWorkflowTrigger', typeVersion: 1 },
          set('Shape Payload'),
        ],
        [['When Executed by Another Workflow', 'Shape Payload']],
      ),
    },
    {
      name: 'webhook responding immediately needs no Respond node',
      workflow: wf(
        [
          { name: 'Order Received', type: 'n8n-nodes-base.webhook', typeVersion: 2.1, parameters: { path: 'hook', responseMode: 'onReceived' } },
          set('Shape Payload'),
        ],
        [['Order Received', 'Shape Payload']],
      ),
    },
  ],
  invalid: [
    {
      name: 'unknown node type',
      workflow: wf([trigger, { name: 'Weird', type: 'n8n-nodes-base.doesNotExist' }]),
      errors: [{ messageId: 'unknownNodeType', nodeName: 'Weird' }],
    },
    {
      name: 'missing required parameter',
      workflow: wf([trigger, { name: 'Fetch', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2 }]),
      errors: [{ messageId: 'parameterIssue', nodeName: 'Fetch', data: { parameter: 'url' } }],
    },
    {
      name: 'no trigger at all',
      workflow: wf([httpOk]),
      errors: [{ messageId: 'noTrigger' }],
    },
    {
      name: 'merge wired with fewer inputs than configured',
      workflow: wf(
        [trigger, set('Branch A'), set('Branch B'), { name: 'Combine', type: 'n8n-nodes-base.merge', typeVersion: 3.2, parameters: { numberInputs: 3 } }],
        [
          [trigger.name, 'Branch A'],
          [trigger.name, 'Branch B'],
          ['Branch A', 'Combine', 0, 0],
          ['Branch B', 'Combine', 0, 1],
        ],
      ),
      errors: [{ messageId: 'mergeInputCount', nodeName: 'Combine', data: { expected: 3, wired: 2 } }],
    },
    {
      name: 'sub-node left unconnected',
      workflow: wf([trigger, { name: 'OpenAI Model', type: '@n8n/n8n-nodes-langchain.lmChatOpenAi' }]),
      errors: [{ messageId: 'subNodeNotConnected', nodeName: 'OpenAI Model' }],
    },
    {
      name: 'tool with no parameters',
      workflow: wf(
        [trigger, agent(SYSTEM), { name: 'Lookup Order', type: '@n8n/n8n-nodes-langchain.toolWorkflow', typeVersion: 2.2 }],
        [
          [trigger.name, 'Answer Question'],
          ['Lookup Order', 'Answer Question', 0, 0, 'ai_tool'],
        ],
      ),
      errors: [{ messageId: 'toolNoParameters', nodeName: 'Lookup Order' }],
    },
    {
      name: '$fromAI used outside a tool',
      workflow: wf([
        trigger,
        set('Shape Payload', {
          assignments: { assignments: [{ id: '1', name: 'city', value: "={{ $fromAI('city') }}", type: 'string' }] },
          options: {},
        }),
      ]),
      errors: [{ messageId: 'fromAiOutsideTool', nodeName: 'Shape Payload' }],
    },
    {
      name: 'agent with a static prompt',
      workflow: wf([trigger, agent({ promptType: 'define', text: 'Summarise the ticket', ...SYSTEM })]),
      errors: [{ messageId: 'agentStaticPrompt', nodeName: 'Answer Question' }],
    },
    {
      name: 'agent with no system message',
      workflow: wf([trigger, agent({})]),
      errors: [{ messageId: 'agentNoSystemMessage', nodeName: 'Answer Question' }],
    },
    {
      name: 'hardcoded credential in an HTTP header',
      workflow: wf([
        trigger,
        {
          name: 'GET Users - Fetch active',
          type: 'n8n-nodes-base.httpRequest',
          typeVersion: 4.2,
          parameters: {
            url: 'https://api.acme.test/users',
            sendHeaders: true,
            headerParameters: { parameters: [{ name: 'Authorization', value: 'Bearer hunter2hunter2' }] },
            options: {},
          },
        },
      ]),
      errors: [{ messageId: 'hardcodedCredentialInHttp', nodeName: 'GET Users - Fetch active', data: { header: 'Authorization' } }],
    },
    {
      name: 'webhook promises a Respond node that is absent',
      workflow: wf(
        [
          { name: 'Order Received', type: 'n8n-nodes-base.webhook', typeVersion: 2.1, parameters: { path: 'hook', responseMode: 'responseNode' } },
          set('Shape Payload'),
        ],
        [['Order Received', 'Shape Payload']],
      ),
      errors: [{ messageId: 'webhookResponseMismatch', nodeName: 'Order Received' }],
    },
  ],
});
