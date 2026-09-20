import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError, loadConfigFile, resolveConfig } from '../src/config.js';
import type { Rule } from '../src/types.js';

const mkRule = (id: string, recommended: 'warn' | 'error' | false, schema?: unknown): Rule => ({
  meta: {
    id,
    type: 'suggestion',
    fixable: null,
    docs: { description: id, recommended },
    schema,
    messages: {},
  },
  create: () => ({}),
});

const registry = new Map<string, Rule>(
  [
    mkRule('naming/no-default-node-name', 'warn'),
    mkRule('naming/other', 'warn'),
    mkRule('structure/merge-for-reconvergence', 'error'),
    mkRule('layout/formatted', false),
    mkRule('reliability/http-retry-config', 'warn', {
      type: 'object',
      properties: { minTries: { type: 'number' } },
      required: ['minTries'],
    }),
  ].map((r) => [r.meta.id, r]),
);

const sev = (c: ReturnType<typeof resolveConfig>, id: string) => c.rules.get(id)?.severity;

describe('resolveConfig', () => {
  it('recommended enables rules at their recommended level and skips false', () => {
    const c = resolveConfig({ extends: ['workflow-lint:recommended'] }, registry);
    expect(sev(c, 'naming/no-default-node-name')).toBe('warn');
    expect(sev(c, 'structure/merge-for-reconvergence')).toBe('error');
    expect(c.rules.has('layout/formatted')).toBe(false);
  });

  it('departments set a whole department', () => {
    const c = resolveConfig(
      { extends: ['workflow-lint:recommended'], departments: { naming: 'off' } },
      registry,
    );
    expect(c.rules.has('naming/no-default-node-name')).toBe(false);
    expect(c.rules.has('naming/other')).toBe(false);
    expect(sev(c, 'structure/merge-for-reconvergence')).toBe('error');
  });

  it('an explicit rule beats its department', () => {
    const c = resolveConfig(
      {
        extends: ['workflow-lint:recommended'],
        departments: { naming: 'off' },
        rules: { 'naming/no-default-node-name': 'error' },
      },
      registry,
    );
    expect(sev(c, 'naming/no-default-node-name')).toBe('error');
    expect(c.rules.has('naming/other')).toBe(false);
  });

  it('carries rule options', () => {
    const c = resolveConfig(
      { rules: { 'reliability/http-retry-config': ['warn', { minTries: 5 }] } },
      registry,
    );
    expect(c.rules.get('reliability/http-retry-config')?.options).toEqual({ minTries: 5 });
  });

  it('validates options against the rule schema', () => {
    expect(() =>
      resolveConfig({ rules: { 'reliability/http-retry-config': ['warn', { minTries: 'lots' }] } }, registry),
    ).toThrow(ConfigError);
    expect(() =>
      resolveConfig({ rules: { 'reliability/http-retry-config': ['warn', {}] } }, registry),
    ).toThrow(/required/i);
  });

  it('applies a files override only to matching paths', () => {
    const user = {
      extends: ['workflow-lint:recommended'],
      overrides: [{ files: ['legacy/**'], departments: { naming: 'off' as const } }],
    };
    expect(sev(resolveConfig(user, registry, { path: 'legacy/a.json' }), 'naming/other')).toBeUndefined();
    expect(sev(resolveConfig(user, registry, { path: 'main/a.json' }), 'naming/other')).toBe('warn');
  });

  it('applies a workflow override by tag and by name', () => {
    const user = {
      extends: ['workflow-lint:recommended'],
      overrides: [{ workflows: { tags: ['experimental'] }, rules: { 'naming/other': 'off' as const } }],
    };
    expect(sev(resolveConfig(user, registry, { path: 'a.json', tags: ['experimental'] }), 'naming/other')).toBeUndefined();
    expect(sev(resolveConfig(user, registry, { path: 'a.json', tags: ['prod'] }), 'naming/other')).toBe('warn');

    const byName = {
      extends: ['workflow-lint:recommended'],
      overrides: [{ workflows: { name: 'Scratch' }, rules: { 'naming/other': 'off' as const } }],
    };
    expect(sev(resolveConfig(byName, registry, { path: 'a.json', name: 'Scratch' }), 'naming/other')).toBeUndefined();
    expect(sev(resolveConfig(byName, registry, { path: 'a.json', name: 'Real' }), 'naming/other')).toBe('warn');
  });

  it('rejects an unknown rule or preset', () => {
    expect(() => resolveConfig({ rules: { 'nope/nope': 'warn' } }, registry)).toThrow(/unknown rule/i);
    expect(() => resolveConfig({ extends: ['workflow-lint:nope'] }, registry)).toThrow(/unknown preset/i);
  });

  it('carries settings', () => {
    const c = resolveConfig({ settings: { n8nVersion: '2.9.0' } }, registry);
    expect(c.settings.n8nVersion).toBe('2.9.0');
  });
});

describe('loadConfigFile', () => {
  it('loads yaml from a directory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'workflow-lint-cfg-'));
    writeFileSync(
      join(dir, 'workflow-lint.config.yaml'),
      'extends: [workflow-lint:recommended]\nsettings:\n  n8nVersion: 2.10.0\n',
    );
    const { config, path } = await loadConfigFile(dir);
    expect(path).toContain('workflow-lint.config.yaml');
    expect(config.extends).toEqual(['workflow-lint:recommended']);
    expect(config.settings?.n8nVersion).toBe('2.10.0');
  });

  it('returns an empty config when none exists', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'workflow-lint-cfg-'));
    const { config, path } = await loadConfigFile(dir);
    expect(config).toEqual({});
    expect(path).toBeUndefined();
  });
});

describe('presets', () => {
  const productionRegistry = new Map<string, Rule>(
    [
      mkRule('n8n/valid', 'error'),
      mkRule('hygiene/no-inline-secrets', 'error'),
      mkRule('reliability/error-workflow-configured', false),
      mkRule('reliability/http-retry-config', 'warn'),
      mkRule('reliability/webhook-input-contract', 'info'),
      mkRule('naming/no-default-node-name', 'warn'),
      mkRule('layout/formatted', false),
    ].map((r) => [r.meta.id, r]),
  );

  it('strict raises everything the recommended preset enables', () => {
    const c = resolveConfig({ extends: ['workflow-lint:strict'] }, productionRegistry);
    for (const [, resolved] of c.rules) expect(resolved.severity).toBe('error');
    expect(c.rules.has('layout/formatted')).toBe(false);
  });

  it('leaves an opt-in rule out of recommended but enables it in production', () => {
    const recommended = resolveConfig({ extends: ['workflow-lint:recommended'] }, productionRegistry);
    expect(recommended.rules.has('reliability/error-workflow-configured')).toBe(false);
    const production = resolveConfig({ extends: ['workflow-lint:production'] }, productionRegistry);
    expect(production.rules.get('reliability/error-workflow-configured')?.severity).toBe('error');
  });

  it('production raises the findings that become incidents', () => {
    const c = resolveConfig({ extends: ['workflow-lint:production'] }, productionRegistry);
    expect(sev(c, 'reliability/error-workflow-configured')).toBe('error');
    expect(sev(c, 'reliability/http-retry-config')).toBe('error');
    expect(sev(c, 'hygiene/no-inline-secrets')).toBe('error');
    expect(sev(c, 'n8n/valid')).toBe('error');
    // raised from info, but not to error
    expect(sev(c, 'reliability/webhook-input-contract')).toBe('warn');
    // everything else keeps its recommended level
    expect(sev(c, 'naming/no-default-node-name')).toBe('warn');
  });
});
