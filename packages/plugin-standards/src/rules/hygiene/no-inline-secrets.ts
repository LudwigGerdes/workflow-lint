import type { Rule } from 'workflow-lint-core';
import type { INode } from 'n8n-workflow';
import { HTTP } from '../../node-types.js';

/** Shapes of well-known credential tokens. */
const TOKEN_SHAPES = [
  /^(sk|xox[abp]|ghp|gho|AKIA|AIza)[A-Za-z0-9_-]{10,}/,
  /^Bearer\s+\S{16,}/,
];

const CREDENTIAL_HEADER = /authorization|x-api-key|api[-_]?key|token/i;

/** A value that defers to n8n's own secret storage is fine. */
const SAFE_REFERENCE = /\$credentials|\$env/;

const walkStrings = (value: unknown, path: string, cb: (value: string, path: string) => void): void => {
  if (typeof value === 'string') cb(value, path);
  else if (Array.isArray(value)) value.forEach((v, i) => walkStrings(v, `${path}[${i}]`, cb));
  else if (value !== null && typeof value === 'object') {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      walkStrings(v, path === '' ? key : `${path}.${key}`, cb);
    }
  }
};

export const rule: Rule = {
  meta: {
    id: 'hygiene/no-inline-secrets',
    type: 'problem',
    class: 'quality',
    fixable: null,
    docs: {
      description: 'Secrets belong in credentials or $env, never inline in a workflow.',
      recommended: 'error',
    },
    schema: { type: 'object', properties: { denylist: { type: 'array' } } },
    messages: {
      secret:
        'Node "{{name}}" has what looks like a secret in "{{parameter}}"; move it into a credential or $env.',
    },
  },
  create(ctx) {
    const { denylist = [] } = (ctx.options ?? {}) as { denylist?: string[] };
    const patterns = denylist.map((p) => new RegExp(p));

    return {
      Node(target) {
        const node = target as INode;
        // Never echo the value itself into a finding.
        const reported = new Set<string>();
        const report = (parameter: string): void => {
          if (reported.has(parameter)) return;
          reported.add(parameter);
          ctx.report({ node, messageId: 'secret', data: { name: node.name, parameter } });
        };

        if (node.type === HTTP) {
          const headers = (node.parameters['headerParameters'] as
            | { parameters?: Array<{ name?: unknown; value?: unknown }> }
            | undefined)?.parameters;
          (headers ?? []).forEach((header, i) => {
            if (
              typeof header?.name === 'string' &&
              CREDENTIAL_HEADER.test(header.name) &&
              typeof header.value === 'string' &&
              header.value.trim().length > 0 &&
              !SAFE_REFERENCE.test(header.value)
            ) {
              report(`headerParameters.parameters[${i}].value`);
            }
          });
        }

        walkStrings(node.parameters, '', (value, path) => {
          if (SAFE_REFERENCE.test(value)) return;
          const looksLikeSecret =
            TOKEN_SHAPES.some((re) => re.test(value)) || patterns.some((re) => re.test(value));
          if (looksLikeSecret) report(path);
        });
      },
    };
  },
};
