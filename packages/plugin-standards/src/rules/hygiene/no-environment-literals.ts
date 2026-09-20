import type { Rule } from 'workflow-lint-core';
import type { INode } from 'n8n-workflow';
import { HTTP } from '../../node-types.js';

const DEFAULT_PATTERNS = [
  '\\b(dev|development)\\b',
  '\\b(stag|staging)\\b',
  '\\b(prod|production)\\b',
  '\\b(test|testing)\\b',
];

const PARAMETERISED = /\$env|\$credentials/;

const walkStrings = (value: unknown, path: string, cb: (value: string, path: string) => void): void => {
  if (typeof value === 'string') cb(value, path);
  else if (Array.isArray(value)) value.forEach((v, i) => walkStrings(v, `${path}[${i}]`, cb));
  else if (value !== null && typeof value === 'object') {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      walkStrings(v, path === '' ? key : `${path}.${key}`, cb);
    }
  }
};

const hostOf = (url: string): string | undefined => {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
};

export const rule: Rule = {
  meta: {
    id: 'hygiene/no-environment-literals',
    type: 'suggestion',
    class: 'quality',
    fixable: null,
    docs: {
      description:
        'Environment names and hosts baked into a workflow have to be edited by hand to promote it; use $env.',
      recommended: 'warn',
    },
    schema: {
      type: 'object',
      properties: { patterns: { type: 'array' }, urlHosts: { type: 'boolean' } },
    },
    messages: {
      envLiteral:
        'Node "{{name}}" names an environment in "{{parameter}}" ("{{match}}"); read it from $env instead.',
      hardcodedHost:
        'Node "{{name}}" hardcodes host "{{host}}", which is parameterised elsewhere in this workflow; use $env here too.',
    },
  },
  create(ctx) {
    const { patterns = DEFAULT_PATTERNS, urlHosts = true } = (ctx.options ?? {}) as {
      patterns?: string[];
      urlHosts?: boolean;
    };
    const res = patterns.map((p) => new RegExp(p, 'i'));

    // Strings that already defer to $env/$credentials tell us which hosts the
    // workflow considers environment-specific.
    const parameterised: string[] = [];
    for (const node of ctx.graph.nodes) {
      walkStrings(node.parameters, '', (value) => {
        if (PARAMETERISED.test(value)) parameterised.push(value);
      });
    }

    return {
      Node(target) {
        const node = target as INode;

        walkStrings(node.parameters, '', (value, parameter) => {
          if (PARAMETERISED.test(value)) return;
          for (const re of res) {
            const m = re.exec(value);
            if (m) {
              ctx.report({
                node,
                messageId: 'envLiteral',
                data: { name: node.name, parameter, match: m[0] },
              });
              return;
            }
          }
        });

        if (!urlHosts || node.type !== HTTP) return;
        const url = node.parameters['url'];
        if (typeof url !== 'string' || PARAMETERISED.test(url)) return;
        const host = hostOf(url);
        if (host === undefined) return;
        if (parameterised.some((s) => s.includes(host))) {
          ctx.report({ node, messageId: 'hardcodedHost', data: { name: node.name, host } });
        }
      },
    };
  },
};
