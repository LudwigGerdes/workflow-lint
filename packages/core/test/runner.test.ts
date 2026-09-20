import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { INode } from 'n8n-workflow';
import { lint } from '../src/runner.js';
import type { ResolvedConfig, Rule } from '../src/types.js';

const text = readFileSync(new URL('./fixtures/basic.json', import.meta.url), 'utf8');

const alwaysReport: Rule = {
  meta: {
    id: 'test/always-report',
    type: 'suggestion',
    fixable: 'params',
    fixSafety: 'safe',
    docs: { description: 'Reports every Set node.', recommended: 'warn' },
    messages: { always: 'Set node "{{name}}" reported.' },
  },
  create(ctx) {
    return {
      'Node[type="n8n-nodes-base.set"]': (target) => {
        const n = target as INode;
        ctx.report({
          node: n,
          messageId: 'always',
          data: { name: n.name },
          fix: (f) => f.setParameter(n.name, 'options.x', 1),
        });
      },
    };
  },
};

const orderRule = (log: string[]): Rule => ({
  meta: {
    id: 'test/order',
    type: 'suggestion',
    fixable: null,
    docs: { description: 'Records traversal order.', recommended: 'warn' },
    messages: {},
  },
  create() {
    return {
      Workflow: () => log.push('workflow'),
      Node: () => log.push('node'),
      StickyNote: () => log.push('sticky'),
      'Workflow:exit': () => log.push('exit'),
    };
  },
});

const configOf = (...rules: Rule[]): ResolvedConfig => ({
  settings: { n8nVersion: '2.38.3' },
  rules: new Map(rules.map((rule) => [rule.meta.id, { rule, severity: 'warn' as const, options: {} }])),
});

describe('lint', () => {
  it('reports a finding with location and severity', async () => {
    const res = await lint({ text, path: 'basic.json' }, configOf(alwaysReport));
    expect(res.parseErrors).toEqual([]);
    expect(res.findings).toHaveLength(1);
    const f = res.findings[0]!;
    expect(f).toMatchObject({
      ruleId: 'test/always-report',
      severity: 'warn',
      messageId: 'always',
      nodeName: 'Edit Fields',
      message: 'Set node "Edit Fields" reported.',
    });
    expect(f.loc?.line).toBeGreaterThan(1);
  });

  it('applies fixes to a fixpoint', async () => {
    const res = await lint({ text, path: 'basic.json' }, configOf(alwaysReport), { fix: true });
    const set = res.fixedJson!.nodes.find((n) => n.name === 'Edit Fields')!;
    expect((set.parameters['options'] as { x: number }).x).toBe(1);
    // pass 1 changes the document, pass 2 produces no further change
    expect(res.fixPasses).toBe(2);
  });

  it('leaves the original document untouched when not fixing', async () => {
    const res = await lint({ text, path: 'basic.json' }, configOf(alwaysReport));
    expect(res.fixedJson).toBeUndefined();
  });

  it('runs Workflow, then nodes, then Workflow:exit', async () => {
    const log: string[] = [];
    await lint({ text, path: 'basic.json' }, configOf(orderRule(log)));
    expect(log[0]).toBe('workflow');
    expect(log.at(-1)).toBe('exit');
    expect(log.filter((l) => l === 'node')).toHaveLength(3);
    expect(log.filter((l) => l === 'sticky')).toHaveLength(1);
  });

  it('returns parse errors instead of findings', async () => {
    const res = await lint({ text: '{ oops', path: 'bad.json' }, configOf(alwaysReport));
    expect(res.parseErrors).toHaveLength(1);
    expect(res.findings).toEqual([]);
  });

  it('exposes n8n services to rules', async () => {
    const seen: Record<string, unknown> = {};
    const probe: Rule = {
      meta: {
        id: 'test/probe',
        type: 'suggestion',
        fixable: null,
        docs: { description: 'probe', recommended: 'warn' },
        messages: {},
      },
      create(ctx) {
        return {
          Node: (target) => {
            const n = target as INode;
            if (n.name !== 'Edit Fields') return;
            seen['nodeType'] = ctx.n8n.nodeType(n)?.displayName;
            seen['isDefaultName'] = ctx.n8n.isDefaultName(n);
            seen['isTrigger'] = ctx.n8n.isTrigger(n);
            seen['isSubNode'] = ctx.n8n.isSubNode(n);
            seen['isTool'] = ctx.n8n.isTool(n);
            seen['versions'] = ctx.n8n.versions('n8n-nodes-base.set')?.defaultVersion;
            seen['issues'] = ctx.n8n.parameterIssues(n);
          },
        };
      },
    };
    await lint({ text, path: 'basic.json' }, configOf(probe));
    expect(seen['nodeType']).toBe('Edit Fields (Set)');
    expect(seen['isDefaultName']).toBe(true);
    expect(seen['isTrigger']).toBe(false);
    expect(seen['isSubNode']).toBe(false);
    expect(seen['isTool']).toBe(false);
    expect(seen['versions']).toBe(3.5);
  });

  it('n8n services tolerate unknown node types', async () => {
    const bogus = JSON.stringify({
      nodes: [{ name: 'Weird', type: 'n8n-nodes-base.nope', typeVersion: 1, position: [0, 0], parameters: {} }],
      connections: {},
    });
    let defaultName: boolean | undefined;
    const probe: Rule = {
      meta: {
        id: 'test/unknown',
        type: 'suggestion',
        fixable: null,
        docs: { description: 'probe', recommended: 'warn' },
        messages: {},
      },
      create(ctx) {
        return { Node: (t) => void (defaultName = ctx.n8n.isDefaultName(t as INode)) };
      },
    };
    const res = await lint({ text: bogus, path: 'b.json' }, configOf(probe));
    expect(res.parseErrors).toEqual([]);
    expect(defaultName).toBe(false);
  });
});
