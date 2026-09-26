import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError, loadConfig, loadConfigFile, readConfig, resolveConfig } from '../src/config.js';
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

describe('config discovery', () => {
  it('walks up from a subdirectory to the nearest config file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'workflow-lint-walk-'));
    mkdirSync(join(root, 'flows', 'billing'), { recursive: true });
    writeFileSync(join(root, 'workflow-lint.config.yaml'), 'settings:\n  n8nVersion: 2.10.0\n');
    const { config, path } = await loadConfigFile(join(root, 'flows', 'billing'));
    expect(path).toBe(join(root, 'workflow-lint.config.yaml'));
    expect(config.settings?.n8nVersion).toBe('2.10.0');
  });

  it('the nearest file wins; a parent config is not merged in', async () => {
    const root = mkdtempSync(join(tmpdir(), 'workflow-lint-walk-'));
    mkdirSync(join(root, 'sub'));
    writeFileSync(join(root, 'workflow-lint.config.yaml'), 'departments:\n  naming: off\n');
    writeFileSync(join(root, 'sub', 'workflow-lint.config.json'), '{"rules":{"naming/other":"error"}}');
    const { config, path } = await readConfig({ cwd: join(root, 'sub') });
    expect(path).toBe(join(root, 'sub', 'workflow-lint.config.json'));
    expect(config.departments).toBeUndefined();
    expect(config.rules).toEqual({ 'naming/other': 'error' });
  });
});

describe('readConfig', () => {
  const setup = (): string => mkdtempSync(join(tmpdir(), 'workflow-lint-read-'));

  it('defaults to the recommended preset when there is no file, or the file names no extends', async () => {
    const dir = setup();
    expect((await readConfig({ cwd: dir })).config.extends).toEqual(['workflow-lint:recommended']);
    writeFileSync(join(dir, 'workflow-lint.config.yaml'), 'rules:\n  naming/other: error\n');
    const { config } = await readConfig({ cwd: dir });
    expect(config.extends).toEqual(['workflow-lint:recommended']);
    expect(config.rules).toEqual({ 'naming/other': 'error' });
  });

  it('takes an explicit path, resolved against cwd', async () => {
    const dir = setup();
    mkdirSync(join(dir, 'ci'));
    writeFileSync(join(dir, 'ci', 'strict.yaml'), 'extends: [workflow-lint:strict]\n');
    const { config, path } = await readConfig({ cwd: dir, path: 'ci/strict.yaml' });
    expect(path).toBe(join(dir, 'ci', 'strict.yaml'));
    expect(config.extends).toEqual(['workflow-lint:strict']);
  });

  it('extends a local file, relative to the extending file, with the child layered on top', async () => {
    const dir = setup();
    mkdirSync(join(dir, 'shared'));
    mkdirSync(join(dir, 'team'));
    writeFileSync(
      join(dir, 'shared', 'base.yaml'),
      [
        'extends: [workflow-lint:production]',
        'settings: { n8nVersion: 2.10.0, extra: base }',
        'departments: { naming: error }',
        'rules: { naming/other: warn, layout/formatted: warn }',
        'fix: { naming/other: false }',
        'ignore: ["**/*.generated.json"]',
        'overrides: [{ files: ["legacy/**"], departments: { naming: off } }]',
        'plugins: [./plugin-a.mjs]',
      ].join('\n'),
    );
    writeFileSync(
      join(dir, 'team', 'workflow-lint.config.yaml'),
      [
        'extends: [../shared/base.yaml, workflow-lint:strict]',
        'settings: { n8nVersion: 2.38.3 }',
        'rules: { naming/other: off }',
        'ignore: ["tmp/**"]',
        'overrides: [{ files: ["exp/**"], rules: { naming/other: off } }]',
        'plugins: [./plugin-b.mjs]',
      ].join('\n'),
    );
    const { config } = await readConfig({ cwd: join(dir, 'team') });
    // Preset names keep their order: the base's first, then the child's.
    expect(config.extends).toEqual(['workflow-lint:production', 'workflow-lint:strict']);
    expect(config.settings).toEqual({ n8nVersion: '2.38.3', extra: 'base' });
    expect(config.departments).toEqual({ naming: 'error' });
    expect(config.rules).toEqual({ 'naming/other': 'off', 'layout/formatted': 'warn' });
    expect(config.fix).toEqual({ 'naming/other': false });
    expect(config.ignore).toEqual(['**/*.generated.json', 'tmp/**']);
    expect(config.overrides?.map((o) => o.files)).toEqual([['legacy/**'], ['exp/**']]);
    // Plugin specifiers are resolved to absolute paths so they load from the right place.
    expect(config.plugins).toEqual([join(dir, 'shared', 'plugin-a.mjs'), join(dir, 'team', 'plugin-b.mjs')]);
  });

  it('extends an npm package: a module exporting a config, or a package whose main is a yaml file', async () => {
    const dir = setup();
    const mods = join(dir, 'node_modules');
    mkdirSync(join(mods, 'workflow-lint-config-acme'), { recursive: true });
    writeFileSync(
      join(mods, 'workflow-lint-config-acme', 'package.json'),
      '{"name":"workflow-lint-config-acme","type":"module","main":"index.js"}',
    );
    writeFileSync(
      join(mods, 'workflow-lint-config-acme', 'index.js'),
      'export default { departments: { naming: "error" }, plugins: ["./plugin.mjs"] };',
    );
    writeFileSync(join(mods, 'workflow-lint-config-acme', 'plugin.mjs'), 'export const rules = [];');
    mkdirSync(join(mods, 'acme-yaml'));
    writeFileSync(join(mods, 'acme-yaml', 'package.json'), '{"name":"acme-yaml","main":"config.yaml"}');
    writeFileSync(join(mods, 'acme-yaml', 'config.yaml'), 'rules: { naming/other: warn }\n');
    writeFileSync(
      join(dir, 'workflow-lint.config.yaml'),
      'extends: [workflow-lint-config-acme, acme-yaml]\n',
    );
    const { config } = await readConfig({ cwd: dir });
    expect(config.departments).toEqual({ naming: 'error' });
    expect(config.rules).toEqual({ 'naming/other': 'warn' });
    // require.resolve reports the real path (macOS: /var -> /private/var).
    expect(config.plugins?.map((p) => realpathSync(p))).toEqual([
      realpathSync(join(mods, 'workflow-lint-config-acme', 'plugin.mjs')),
    ]);
  });

  it('names an extends entry it cannot find', async () => {
    const dir = setup();
    writeFileSync(join(dir, 'workflow-lint.config.yaml'), 'extends: [./missing.yaml]\n');
    await expect(readConfig({ cwd: dir })).rejects.toThrow(/missing\.yaml/);
    writeFileSync(join(dir, 'workflow-lint.config.yaml'), 'extends: [no-such-package-xyz]\n');
    await expect(readConfig({ cwd: dir })).rejects.toThrow(/no-such-package-xyz/);
  });

  it('refuses a cycle', async () => {
    const dir = setup();
    writeFileSync(join(dir, 'a.yaml'), 'extends: [./b.yaml]\n');
    writeFileSync(join(dir, 'b.yaml'), 'extends: [./a.yaml]\n');
    await expect(readConfig({ cwd: dir, path: 'a.yaml' })).rejects.toThrow(/cycle|circular/i);
  });
});

describe('loadConfig', () => {
  const PLUGIN = `
export const rules = [
  {
    meta: { id: 'acme/no-http', type: 'problem', fixable: null, docs: { description: 'x', recommended: 'error' }, messages: {} },
    create: () => ({}),
  },
];
export const presets = {
  'acme:paranoid': (registry) => ({ rules: { 'acme/no-http': 'error', 'naming/other': 'error' } }),
};
`;

  const setup = (): string => mkdtempSync(join(tmpdir(), 'workflow-lint-load-'));
  const builtin = [...registry.values()];

  it('adds plugin rules to the registry so the config can name them', async () => {
    const dir = setup();
    writeFileSync(join(dir, 'acme.mjs'), PLUGIN);
    writeFileSync(join(dir, 'workflow-lint.config.yaml'), 'plugins: [./acme.mjs]\nrules:\n  acme/no-http: warn\n');
    const loaded = await loadConfig({ cwd: dir, rules: builtin });
    expect(loaded.registry.has('acme/no-http')).toBe(true);
    expect(loaded.registry.has('naming/other')).toBe(true);
    const resolved = resolveConfig(loaded.config, loaded.registry, undefined, loaded.presets);
    expect(sev(resolved, 'acme/no-http')).toBe('warn');
  });

  it('a plugin preset is usable from extends', async () => {
    const dir = setup();
    writeFileSync(join(dir, 'acme.mjs'), PLUGIN);
    writeFileSync(join(dir, 'workflow-lint.config.yaml'), 'plugins: [./acme.mjs]\nextends: [acme:paranoid]\n');
    const loaded = await loadConfig({ cwd: dir, rules: builtin });
    const resolved = resolveConfig(loaded.config, loaded.registry, undefined, loaded.presets);
    expect(sev(resolved, 'acme/no-http')).toBe('error');
    expect(sev(resolved, 'naming/other')).toBe('error');
    // Naming a plugin preset without loading the plugin is the error it always was.
    await expect(
      loadConfig({ cwd: dir, rules: builtin }).then((l) => resolveConfig({ extends: ['acme:nope'] }, l.registry, undefined, l.presets)),
    ).rejects.toThrow(/unknown preset/);
  });

  it('loads a plugin from node_modules by package name', async () => {
    const dir = setup();
    mkdirSync(join(dir, 'node_modules', 'workflow-lint-plugin-acme'), { recursive: true });
    writeFileSync(
      join(dir, 'node_modules', 'workflow-lint-plugin-acme', 'package.json'),
      '{"name":"workflow-lint-plugin-acme","type":"module","main":"index.js"}',
    );
    writeFileSync(join(dir, 'node_modules', 'workflow-lint-plugin-acme', 'index.js'), PLUGIN);
    writeFileSync(join(dir, 'workflow-lint.config.yaml'), 'plugins: [workflow-lint-plugin-acme]\n');
    const loaded = await loadConfig({ cwd: dir, rules: builtin });
    expect(loaded.registry.has('acme/no-http')).toBe(true);
  });

  it('rejects a plugin that exports no rules, a duplicate rule id, and one it cannot find', async () => {
    const dir = setup();
    writeFileSync(join(dir, 'empty.mjs'), 'export const hello = 1;');
    writeFileSync(join(dir, 'workflow-lint.config.yaml'), 'plugins: [./empty.mjs]\n');
    await expect(loadConfig({ cwd: dir, rules: builtin })).rejects.toThrow(/empty\.mjs.*rules/s);

    writeFileSync(
      join(dir, 'dup.mjs'),
      `export const rules = [{ meta: { id: 'naming/other', type: 'suggestion', fixable: null, docs: { description: 'x', recommended: 'warn' }, messages: {} }, create: () => ({}) }];`,
    );
    writeFileSync(join(dir, 'workflow-lint.config.yaml'), 'plugins: [./dup.mjs]\n');
    await expect(loadConfig({ cwd: dir, rules: builtin })).rejects.toThrow(/naming\/other.*already/s);

    writeFileSync(join(dir, 'workflow-lint.config.yaml'), 'plugins: [./nope.mjs]\n');
    await expect(loadConfig({ cwd: dir, rules: builtin })).rejects.toThrow(/nope\.mjs/);
  });

  it('a plugin listed twice is loaded once', async () => {
    const dir = setup();
    writeFileSync(join(dir, 'acme.mjs'), PLUGIN);
    writeFileSync(join(dir, 'base.yaml'), 'plugins: [./acme.mjs]\n');
    writeFileSync(join(dir, 'workflow-lint.config.yaml'), 'extends: [./base.yaml]\nplugins: [./acme.mjs]\n');
    const loaded = await loadConfig({ cwd: dir, rules: builtin });
    expect(loaded.config.plugins).toEqual([join(dir, 'acme.mjs')]);
    expect(loaded.registry.has('acme/no-http')).toBe(true);
  });
});

describe('locked', () => {
  it('holds a rule at its severity whatever later layers say', () => {
    const c = resolveConfig(
      {
        extends: ['workflow-lint:recommended'],
        locked: { 'naming/no-default-node-name': 'error' },
        rules: { 'naming/no-default-node-name': 'off' },
        overrides: [{ files: ['**'], departments: { naming: 'off' } }],
      },
      registry,
      { path: 'a.json' },
    );
    expect(sev(c, 'naming/no-default-node-name')).toBe('error');
    expect(c.rules.has('naming/other')).toBe(false);
    expect(c.locked).toEqual(new Set(['naming/no-default-node-name']));
  });

  it('takes a department, expanding it to its rules', () => {
    const c = resolveConfig(
      { locked: { naming: 'warn' }, departments: { naming: 'off' } },
      registry,
    );
    expect(sev(c, 'naming/no-default-node-name')).toBe('warn');
    expect(sev(c, 'naming/other')).toBe('warn');
    expect(c.locked).toEqual(new Set(['naming/no-default-node-name', 'naming/other']));
  });

  it('rejects an unknown rule', () => {
    expect(() => resolveConfig({ locked: { 'nope/nope': 'error' } }, registry)).toThrow(/unknown rule/);
  });

  it('a lock in an extended file beats the extending file, and its own locked block', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'workflow-lint-lock-'));
    writeFileSync(join(dir, 'org.yaml'), 'locked: { naming/no-default-node-name: error }\n');
    writeFileSync(
      join(dir, 'workflow-lint.config.yaml'),
      'extends: [./org.yaml]\nlocked: { naming/no-default-node-name: off, naming/other: error }\nrules: { naming/no-default-node-name: off }\n',
    );
    const { config } = await readConfig({ cwd: dir });
    expect(config.locked).toEqual({ 'naming/no-default-node-name': 'error', 'naming/other': 'error' });
    expect(sev(resolveConfig(config, registry), 'naming/no-default-node-name')).toBe('error');
  });
});
