import type { Rule } from 'workflow-lint-core';
import type { INode, NodeConnectionType } from 'n8n-workflow';
import { AGENT, EXECUTE_WORKFLOW_TRIGGER, HTTP, MERGE, RESPOND_TO_WEBHOOK, WEBHOOK } from '../node-types.js';

/** Visit every string anywhere inside a parameter tree. */
const walkStrings = (value: unknown, cb: (s: string) => void): void => {
  if (typeof value === 'string') cb(value);
  else if (Array.isArray(value)) for (const v of value) walkStrings(v, cb);
  else if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) walkStrings(v, cb);
  }
};

const CREDENTIAL_HEADER = /authorization|x-api-key|api[-_]?key/i;

/** An n8n expression begins with `=`; anything else is a literal. */
const isExpression = (v: unknown): v is string => typeof v === 'string' && v.startsWith('=');

/** `n8n-nodes-acme-erp.invoice` → `n8n-nodes-acme-erp`; `@acme/n8n-nodes-erp.thing` → `@acme/n8n-nodes-erp`. */
const packageOf = (type: string): string => {
  const dot = type.indexOf('.', type.startsWith('@') ? type.indexOf('/') : 0);
  return dot === -1 ? type : type.slice(0, dot);
};

/** A `knownPackages` entry: a package name, with `*` standing for anything. */
const globToRegExp = (glob: string): RegExp =>
  new RegExp(`^${glob.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('.*')}$`);

export const rule: Rule = {
  meta: {
    id: 'n8n/valid',
    type: 'problem',
    class: 'quality',
    fixable: null,
    docs: {
      description:
        "Semantic checks n8n itself would make: unknown types, parameter issues, wiring and agent configuration.",
      recommended: 'error',
    },
    schema: {
      type: 'object',
      properties: {
        /**
         * Community or in-house node packages this instance has installed,
         * by name or glob (`n8n-nodes-acme-*`). Their nodes are not reported
         * as unknown; the bundle has no description for them, so the other
         * checks on such a node are skipped.
         */
        knownPackages: { type: 'array' },
      },
    },
    messages: {
      unknownNodeType: 'Node "{{name}}" has unknown type "{{type}}"; it will not run on this n8n version.',
      parameterIssue: 'Node "{{name}}": {{issue}}',
      noTrigger: 'This workflow has no trigger node, so nothing can start it.',
      mergeInputCount:
        'Merge node "{{name}}" is configured for {{expected}} inputs but only {{wired}} are wired.',
      subNodeNotConnected: 'Sub-node "{{name}}" is not connected to anything, so it will never be used.',
      toolNoParameters: 'Tool "{{name}}" has no parameters configured.',
      fromAiOutsideTool: 'Node "{{name}}" uses $fromAI(), which only works inside a tool node.',
      agentStaticPrompt:
        'Agent "{{name}}" has a static prompt; use an expression so it receives the incoming data.',
      agentNoSystemMessage: 'Agent "{{name}}" has no system message, leaving its role undefined.',
      hardcodedCredentialInHttp:
        'Node "{{name}}" sends header "{{header}}" as a literal; use a credential instead.',
      webhookResponseMismatch:
        'Webhook "{{name}}" uses responseMode "{{mode}}", which does not match the Respond to Webhook wiring.',
    },
  },

  create(ctx) {
    const { knownPackages = [] } = (ctx.options ?? {}) as { knownPackages?: string[] };
    const known = knownPackages.map(globToRegExp);
    return {
      Node(target) {
        const node = target as INode;
        const name = node.name;

        const description = ctx.n8n.nodeType(node);
        if (!description) {
          const pkg = packageOf(node.type);
          if (!known.some((re) => re.test(pkg) || re.test(node.type))) {
            ctx.report({ node, messageId: 'unknownNodeType', data: { name, type: node.type } });
          }
          return;
        }

        for (const [parameter, issues] of Object.entries(ctx.n8n.parameterIssues(node)?.parameters ?? {})) {
          for (const issue of issues) {
            ctx.report({ node, messageId: 'parameterIssue', data: { name, parameter, issue } });
          }
        }

        if (node.type === MERGE) {
          const expected = Number(node.parameters['numberInputs'] ?? 2);
          const wired = new Set(
            ctx.graph.incoming(name).filter((c) => c.type === 'main').map((c) => c.input),
          ).size;
          if (wired !== expected) {
            ctx.report({ node, messageId: 'mergeInputCount', data: { name, expected, wired } });
          }
        }

        const isTool = ctx.n8n.isTool(node);
        if (ctx.n8n.isSubNode(node) && ctx.graph.outgoing(name).length === 0) {
          ctx.report({ node, messageId: 'subNodeNotConnected', data: { name } });
        }
        if (isTool && Object.keys(node.parameters).length === 0) {
          ctx.report({ node, messageId: 'toolNoParameters', data: { name } });
        }

        if (!isTool) {
          let usesFromAi = false;
          walkStrings(node.parameters, (s) => {
            if (s.includes('$fromAI(')) usesFromAi = true;
          });
          if (usesFromAi) ctx.report({ node, messageId: 'fromAiOutsideTool', data: { name } });
        }

        if (node.type === AGENT) {
          const text = node.parameters['text'];
          if (node.parameters['promptType'] === 'define' && typeof text === 'string' && !text.includes('={{')) {
            ctx.report({ node, messageId: 'agentStaticPrompt', data: { name } });
          }
          const options = node.parameters['options'] as { systemMessage?: unknown } | undefined;
          if (options?.systemMessage === undefined || options.systemMessage === '') {
            ctx.report({ node, messageId: 'agentNoSystemMessage', data: { name } });
          }
        }

        if (node.type === HTTP) {
          const headers = (node.parameters['headerParameters'] as
            | { parameters?: Array<{ name?: unknown; value?: unknown }> }
            | undefined)?.parameters;
          for (const header of headers ?? []) {
            if (
              typeof header?.name === 'string' &&
              CREDENTIAL_HEADER.test(header.name) &&
              typeof header.value === 'string' &&
              header.value.length > 0 &&
              !isExpression(header.value)
            ) {
              ctx.report({ node, messageId: 'hardcodedCredentialInHttp', data: { name, header: header.name } });
            }
          }
        }

        if (node.type === WEBHOOK) {
          const mode = String(node.parameters['responseMode'] ?? 'onReceived');
          const downstream = ctx.graph.children(name, 'main' as NodeConnectionType, -1);
          const hasRespond = downstream.some((n) => ctx.graph.node(n)?.type === RESPOND_TO_WEBHOOK);
          if ((mode === 'responseNode') !== hasRespond) {
            ctx.report({ node, messageId: 'webhookResponseMismatch', data: { name, mode } });
          }
        }
      },

      'Workflow:exit'() {
        const hasTrigger = ctx.graph.triggers().length > 0;
        const isSubWorkflow = ctx.graph.nodes.some((n) => n.type === EXECUTE_WORKFLOW_TRIGGER);
        if (!hasTrigger && !isSubWorkflow) ctx.report({ workflow: true, messageId: 'noTrigger' });
      },
    };
  },
};
