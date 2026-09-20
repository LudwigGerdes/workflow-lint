import { RuleTester } from 'workflow-lint-core/rule-tester';
import { rule } from '../../src/rules/hygiene/no-environment-literals.js';
import { wf, trigger } from '../helpers/wf.js';

const http = (name: string, url: string) => ({
  name,
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  parameters: { url, options: {} },
});
const setValue = (name: string, value: string) => ({
  name,
  type: 'n8n-nodes-base.set',
  typeVersion: 3.4,
  parameters: {
    assignments: { assignments: [{ id: '1', name: 'base', value, type: 'string' }] },
    options: {},
  },
});

new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [
    {
      name: 'environment-neutral URL',
      workflow: wf([trigger, http('GET Users - Fetch active', 'https://api.acme.io/users')]),
    },
    {
      name: 'host read from $env',
      workflow: wf([trigger, http('GET Users - Fetch active', '={{ $env.API_BASE }}/users')]),
    },
    {
      name: 'patterns can be narrowed',
      workflow: wf([trigger, http('GET Users - Fetch active', 'https://staging.acme.io/users')]),
      options: { patterns: ['\\bprod\\b'] },
    },
  ],
  invalid: [
    {
      name: 'staging named in a URL',
      workflow: wf([trigger, http('GET Users - Fetch active', 'https://staging.acme.io/users')]),
      errors: [
        {
          messageId: 'envLiteral',
          nodeName: 'GET Users - Fetch active',
          data: { parameter: 'url', match: 'staging' },
        },
      ],
    },
    {
      name: 'a host parameterised elsewhere is hardcoded here',
      workflow: wf([
        trigger,
        http('GET Users - Fetch active', 'https://api.acme.io/users'),
        setValue('Resolve Base', "={{ $env.ACME_BASE || 'https://api.acme.io' }}"),
      ]),
      errors: [
        {
          messageId: 'hardcodedHost',
          nodeName: 'GET Users - Fetch active',
          data: { host: 'api.acme.io' },
        },
      ],
    },
  ],
});
