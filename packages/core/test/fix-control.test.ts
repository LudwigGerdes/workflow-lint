import { readFileSync } from 'node:fs';
import type { INode } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config.js';
import { isAutofixable, lint } from '../src/runner.js';
import type { ResolvedConfig, Rule, UserConfig } from '../src/types.js';

const text = readFileSync(new URL('./fixtures/basic.json', import.meta.url), 'utf8');

/** Sets a parameter — a `params` fix. */
const paramsRule: Rule = {
  meta: {
    id: 'test/params-fix',
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

/** Same shape, declared as a `connections` fix, to test --fix-type. */
const connectionsRule: Rule = {
  ...paramsRule,
  meta: { ...paramsRule.meta, id: 'test/connections-fix', fixable: 'connections' },
  create(ctx) {
    return {
      'Node[type="n8n-nodes-base.set"]': (target) => {
        const n = target as INode;
        ctx.report({
          node: n,
          messageId: 'always',
          data: { name: n.name },
          fix: (f) => f.setParameter(n.name, 'options.y', 2),
        });
      },
    };
  },
};

const configOf = (rules: Array<[Rule, boolean?]>): ResolvedConfig => ({
  settings: { n8nVersion: '2.38.3' },
  rules: new Map(
    rules.map(([rule, fix]) => [
      rule.meta.id,
      { rule, severity: 'warn' as const, options: {}, ...(fix !== undefined ? { fix } : {}) },
    ]),
  ),
});

const registry = new Map([paramsRule, connectionsRule].map((r) => [r.meta.id, r]));

describe('config fix: false', () => {
  it('resolves a per-rule autofix opt-out', () => {
    const user: UserConfig = {
      rules: { 'test/params-fix': 'warn' },
      fix: { 'test/params-fix': false },
    };
    expect(resolveConfig(user, registry).rules.get('test/params-fix')?.fix).toBe(false);
  });

  it('leaves autofix enabled by default', () => {
    const user: UserConfig = { rules: { 'test/params-fix': 'warn' } };
    expect(resolveConfig(user, registry).rules.get('test/params-fix')?.fix).not.toBe(false);
  });

  it('lets an override scope the opt-out to a path', () => {
    const user: UserConfig = {
      rules: { 'test/params-fix': 'warn' },
      overrides: [{ files: ['prod/**'], fix: { 'test/params-fix': false } }],
    };
    const inProd = resolveConfig(user, registry, { path: 'prod/a.json' });
    const inDev = resolveConfig(user, registry, { path: 'dev/a.json' });
    expect(inProd.rules.get('test/params-fix')?.fix).toBe(false);
    expect(inDev.rules.get('test/params-fix')?.fix).not.toBe(false);
  });
});

describe('lint with autofix disabled for a rule', () => {
  it('still reports the finding but never applies its patch', async () => {
    const res = await lint({ text, path: 'basic.json' }, configOf([[paramsRule, false]]), {
      fix: true,
    });
    expect(res.findings.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.fixedJson)).toBe(JSON.stringify(JSON.parse(text)));
  });

  it('applies it when the opt-out is absent, proving the fixture is fixable', async () => {
    const res = await lint({ text, path: 'basic.json' }, configOf([[paramsRule]]), { fix: true });
    expect(JSON.stringify(res.fixedJson)).not.toBe(JSON.stringify(JSON.parse(text)));
  });
});

describe('lint with fixTypes', () => {
  it('applies only fixes of the named categories', async () => {
    const config = configOf([[paramsRule], [connectionsRule]]);
    const res = await lint({ text, path: 'basic.json' }, config, {
      fix: true,
      fixTypes: ['connections'],
    });
    const json = JSON.stringify(res.fixedJson);
    expect(json).toContain('"y"');
    expect(json).not.toContain('"x"');
  });

  it('applies every category when none is named', async () => {
    const config = configOf([[paramsRule], [connectionsRule]]);
    const res = await lint({ text, path: 'basic.json' }, config, { fix: true });
    const json = JSON.stringify(res.fixedJson);
    expect(json).toContain('"x"');
    expect(json).toContain('"y"');
  });
});

describe('isAutofixable', () => {
  it('is true for a finding whose rule still has autofix enabled', async () => {
    const config = configOf([[paramsRule]]);
    const res = await lint({ text, path: 'basic.json' }, config);
    expect(res.findings.some((f) => isAutofixable(f, config))).toBe(true);
  });

  it('is false once the rule opts out, which is what makes fix:false a valid CI exception', async () => {
    const config = configOf([[paramsRule, false]]);
    const res = await lint({ text, path: 'basic.json' }, config);
    expect(res.findings.every((f) => !isAutofixable(f, config))).toBe(true);
  });
});
