import { parse } from 'acorn';
import type { Rule } from 'workflow-lint-core';
import type { INode } from 'n8n-workflow';
import { CODE } from '../../node-types.js';

interface Options {
  maxFields?: number;
}

type Node = Record<string, unknown>;

const isNode = (value: unknown): value is Node =>
  value !== null && typeof value === 'object' && typeof (value as Node)['type'] === 'string';

/** Depth-first walk over any acorn AST fragment. */
function walk(value: unknown, visit: (node: Node) => void): void {
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visit);
    return;
  }
  if (!isNode(value)) return;
  visit(value);
  for (const [key, child] of Object.entries(value)) {
    if (key !== 'type') walk(child, visit);
  }
}

const propertyName = (property: Node): string | undefined => {
  const key = property['key'] as { name?: unknown; value?: unknown } | undefined;
  if (typeof key?.name === 'string') return key.name;
  if (typeof key?.value === 'string') return key.value;
  return undefined;
};

const identifiersIn = (value: unknown): Set<string> => {
  const found = new Set<string>();
  walk(value, (node) => {
    if (node['type'] === 'Identifier' && typeof node['name'] === 'string') found.add(node['name']);
  });
  return found;
};

/**
 * The object a Code node hands back. Covers `return { json: {...} }`,
 * `return [{ json: {...} }]` and `return items.map(() => ({ json: {...} }))`
 * in one pass, by looking for any `json:` property whose value is an object.
 * Falls back to a bare returned object literal.
 */
function returnedObjects(ast: unknown): Node[] {
  const wrapped: Node[] = [];
  walk(ast, (node) => {
    if (node['type'] !== 'Property' || propertyName(node) !== 'json') return;
    const value = node['value'];
    if (isNode(value) && value['type'] === 'ObjectExpression') wrapped.push(value);
  });
  if (wrapped.length > 0) return wrapped;

  const bare: Node[] = [];
  walk(ast, (node) => {
    if (node['type'] !== 'ReturnStatement') return;
    const argument = node['argument'];
    if (isNode(argument) && argument['type'] === 'ObjectExpression') bare.push(argument);
  });
  return bare;
}

export const rule: Rule = {
  meta: {
    id: 'data/code-node-multi-field',
    type: 'problem',
    class: 'quality',
    fixable: null,
    docs: {
      description:
        'A Code node that only assembles several unrelated fields is doing a Set node\'s job, less visibly.',
      recommended: 'warn',
    },
    schema: { type: 'object', properties: { maxFields: { type: 'number' } } },
    messages: {
      independentFields:
        'Code node "{{name}}" returns {{count}} independent fields; a Set node would make them visible on the canvas.',
    },
  },
  create(ctx) {
    const { maxFields = 3 } = (ctx.options ?? {}) as Options;

    return {
      Node(target) {
        const node = target as INode;
        if (node.type !== CODE) return;
        const code = node.parameters['jsCode'];
        if (typeof code !== 'string' || code.trim().length === 0) return;

        let ast: unknown;
        try {
          ast = parse(code, {
            ecmaVersion: 'latest',
            allowReturnOutsideFunction: true,
            allowAwaitOutsideFunction: true,
          });
        } catch {
          // Not our job to report syntax errors; n8n will.
          return;
        }

        // Names bound in the code itself. Two fields both built from one of
        // these are related work, not independent assignments.
        const declared = new Set<string>();
        walk(ast, (n) => {
          if (n['type'] !== 'VariableDeclarator') return;
          const id = n['id'] as { type?: unknown; name?: unknown } | undefined;
          if (id?.type === 'Identifier' && typeof id.name === 'string') declared.add(id.name);
        });

        for (const object of returnedObjects(ast)) {
          const properties = (object['properties'] as unknown[])
            .filter(isNode)
            .filter((p) => p['type'] === 'Property');
          const keys = new Set(
            properties.map(propertyName).filter((n): n is string => n !== undefined),
          );
          if (keys.size < maxFields) continue;

          const uses = new Map<string, number>();
          let crossReferences = false;
          for (const property of properties) {
            const own = propertyName(property);
            const referenced = identifiersIn(property['value']);
            for (const name of referenced) {
              if (name !== own && keys.has(name)) crossReferences = true;
              if (declared.has(name) || keys.has(name)) {
                uses.set(name, (uses.get(name) ?? 0) + 1);
              }
            }
          }
          const shared = [...uses.values()].some((count) => count > 1);
          if (crossReferences || shared) continue;

          ctx.report({
            node,
            messageId: 'independentFields',
            data: { name: node.name, count: keys.size },
          });
          return;
        }
      },
    };
  },
};
