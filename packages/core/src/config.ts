import { access, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import picomatch from 'picomatch';
import { parse as parseYaml } from 'yaml';
import { presets as builtinPresets, type PresetBuilder } from './presets.js';
import type { ResolvedConfig, ResolvedRule, Rule, Severity, UserConfig } from './types.js';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const CONFIG_FILES = ['workflow-lint.config.yaml', 'workflow-lint.config.yml', 'workflow-lint.config.json'];
const RECOMMENDED = 'workflow-lint:recommended';

const readConfigText = async (path: string): Promise<UserConfig> => {
  // `yaml` parses JSON too, so one branch covers both file kinds.
  const parsed: unknown = parseYaml(await readFile(path, 'utf8'));
  if (parsed === null || parsed === undefined) return {};
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ConfigError(`${path}: a config file must be a mapping`);
  }
  return parsed as UserConfig;
};

/**
 * Load the nearest config file at or above `cwd`, the way `.gitignore` and
 * `.eslintrc` are found: a workflow under `flows/billing/` is linted with the
 * repo's config whichever directory the command runs from. The nearest file
 * wins outright; a parent's is not merged in (use `extends` for that). Missing
 * config is not an error.
 */
export async function loadConfigFile(cwd = process.cwd()): Promise<{ config: UserConfig; path?: string }> {
  let dir = resolve(cwd);
  for (;;) {
    for (const name of CONFIG_FILES) {
      const path = join(dir, name);
      try {
        await access(path);
      } catch {
        continue;
      }
      return { config: await readConfigText(path), path };
    }
    const parent = dirname(dir);
    if (parent === dir) return { config: {} };
    dir = parent;
  }
}

const isPathSpecifier = (spec: string): boolean =>
  spec.startsWith('./') || spec.startsWith('../') || isAbsolute(spec);

const packageNameOf = (spec: string): { name: string; subpath: string } => {
  const parts = spec.split('/');
  const take = spec.startsWith('@') ? 2 : 1;
  return { name: parts.slice(0, take).join('/'), subpath: parts.slice(take).join('/') };
};

type ExportsField = string | string[] | { [key: string]: ExportsField } | null;

/** Pick the ESM target out of a package `exports` entry. */
const pickExport = (entry: ExportsField | undefined): string | undefined => {
  if (entry === undefined || entry === null) return undefined;
  if (typeof entry === 'string') return entry;
  if (Array.isArray(entry)) return entry.map(pickExport).find((e) => e !== undefined);
  for (const condition of ['import', 'node', 'default']) {
    const found = pickExport(entry[condition]);
    if (found !== undefined) return found;
  }
  return undefined;
};

/**
 * Resolve a bare specifier (`workflow-lint-plugin-acme`, `@acme/lint-config`)
 * from a config file's directory. `require.resolve` covers packages with a
 * `main` or a `require` export; an ESM-only package with an `import`-only
 * `exports` map is walked by hand, because `import.meta.resolve` cannot take a
 * parent URL without a flag.
 */
async function resolveBare(spec: string, fromDir: string): Promise<string> {
  try {
    return createRequire(join(fromDir, '__workflow-lint__.js')).resolve(spec);
  } catch {
    // fall through to the exports walk
  }
  const { name, subpath } = packageNameOf(spec);
  let dir = fromDir;
  for (;;) {
    const pkgDir = join(dir, 'node_modules', name);
    let manifest: { exports?: ExportsField; main?: string } | undefined;
    try {
      manifest = JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf8')) as typeof manifest;
    } catch {
      manifest = undefined;
    }
    if (manifest !== undefined) {
      const exportsField = manifest.exports;
      let target: string | undefined;
      if (exportsField !== undefined && exportsField !== null && typeof exportsField === 'object' && !Array.isArray(exportsField)) {
        const keys = Object.keys(exportsField);
        target = keys.some((k) => k.startsWith('.'))
          ? pickExport(exportsField[subpath === '' ? '.' : `./${subpath}`])
          : subpath === '' ? pickExport(exportsField) : undefined;
      } else if (subpath === '') {
        target = pickExport(exportsField) ?? manifest.main ?? 'index.js';
      } else {
        target = subpath;
      }
      if (target === undefined) {
        throw new ConfigError(`cannot resolve "${spec}" from ${fromDir}: the package does not export it`);
      }
      return join(pkgDir, target);
    }
    const parent = dirname(dir);
    if (parent === dir) throw new ConfigError(`cannot resolve "${spec}" from ${fromDir}: not installed`);
    dir = parent;
  }
}

/** Absolute path for a plugin or extends entry named in the file at `fromDir`. */
const resolveSpecifier = (spec: string, fromDir: string): Promise<string> =>
  isPathSpecifier(spec) ? Promise.resolve(resolve(fromDir, spec)) : resolveBare(spec, fromDir);

const isDataFile = (path: string): boolean => /\.(ya?ml|json)$/.test(path);

const importModule = async (path: string, what: string): Promise<Record<string, unknown>> => {
  try {
    return (await import(pathToFileURL(path).href)) as Record<string, unknown>;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`cannot load ${what} ${path}: ${reason}`);
  }
};

/** Read one config file plus everything it extends, flattened into a single UserConfig. */
async function readConfigChain(
  path: string,
  seen: string[],
): Promise<{ config: UserConfig; sawExtends: boolean }> {
  if (seen.includes(path)) {
    throw new ConfigError(`config extends form a cycle: ${[...seen, path].join(' -> ')}`);
  }
  const chain = [...seen, path];
  const own = isDataFile(path)
    ? await readConfigText(path)
    : await (async () => {
        const mod = await importModule(path, 'config');
        const value = (mod['default'] ?? mod['config'] ?? mod) as UserConfig;
        if (typeof value !== 'object' || value === null) throw new ConfigError(`${path} does not export a config`);
        return value;
      })();
  const dir = dirname(path);

  let merged: UserConfig = {};
  let sawExtends = own.extends !== undefined;
  const presetNames: string[] = [];
  for (const entry of own.extends ?? []) {
    if (entry.includes(':') && !isPathSpecifier(entry)) {
      presetNames.push(entry);
      continue;
    }
    const target = await resolveSpecifier(entry, dir);
    const base = await readConfigChain(target, chain);
    sawExtends = sawExtends || base.sawExtends;
    merged = mergeConfigs(merged, base.config);
  }
  const plugins = await Promise.all((own.plugins ?? []).map((p) => resolveSpecifier(p, dir)));
  merged = mergeConfigs(merged, {
    ...own,
    extends: presetNames,
    ...(own.plugins !== undefined ? { plugins } : {}),
  });
  return { config: merged, sawExtends };
}

const dedupe = <T>(items: T[]): T[] => [...new Set(items)];

/** Layer `over` on `base`: maps merge key by key, lists append, later wins. */
function mergeConfigs(base: UserConfig, over: UserConfig): UserConfig {
  const out: UserConfig = { ...base };
  const extendsList = [...(base.extends ?? []), ...(over.extends ?? [])];
  if (base.extends !== undefined || over.extends !== undefined) out.extends = dedupe(extendsList);
  if (base.settings !== undefined || over.settings !== undefined) {
    out.settings = { ...(base.settings ?? {}), ...(over.settings ?? {}) };
  }
  for (const key of ['departments', 'rules', 'fix'] as const) {
    if (base[key] !== undefined || over[key] !== undefined) {
      out[key] = { ...(base[key] ?? {}), ...(over[key] ?? {}) } as never;
    }
  }
  if (base.ignore !== undefined || over.ignore !== undefined) out.ignore = [...(base.ignore ?? []), ...(over.ignore ?? [])];
  if (base.overrides !== undefined || over.overrides !== undefined) {
    out.overrides = [...(base.overrides ?? []), ...(over.overrides ?? [])];
  }
  if (base.plugins !== undefined || over.plugins !== undefined) {
    out.plugins = dedupe([...(base.plugins ?? []), ...(over.plugins ?? [])]);
  }
  return out;
}

export interface ReadConfigOptions {
  cwd: string;
  /** An explicit config file, relative to `cwd`; otherwise the nearest one is found. */
  path?: string;
}

/**
 * The config as the tools see it: the nearest (or named) file with every
 * `extends` folded in, `plugins` turned into absolute paths and, when no file
 * in the chain says otherwise, the recommended preset. This is the one entry
 * point the CLI, `fmt`, the Action and the MCP server share, so a config
 * behaves the same whichever of them reads it.
 */
export async function readConfig(options: ReadConfigOptions): Promise<{ config: UserConfig; path?: string }> {
  let path: string | undefined;
  if (options.path !== undefined) {
    path = resolve(options.cwd, options.path);
  } else {
    path = (await loadConfigFile(options.cwd)).path;
  }
  if (path === undefined) return { config: { extends: [RECOMMENDED] } };
  const { config, sawExtends } = await readConfigChain(path, []);
  return { config: sawExtends ? config : { ...config, extends: [RECOMMENDED] }, path };
}

export interface LoadedConfig {
  config: UserConfig;
  path?: string;
  /** Built-in rules plus every rule the config's plugins export. */
  registry: Map<string, Rule>;
  /** Built-in presets plus every preset the plugins export. */
  presets: Record<string, PresetBuilder>;
}

const isRule = (value: unknown): value is Rule =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { create?: unknown }).create === 'function' &&
  typeof (value as { meta?: { id?: unknown } }).meta?.id === 'string';

/**
 * `readConfig`, then load the plugins it names. A plugin is a module that
 * exports `rules: Rule[]` (or `default: { rules }`) and, optionally,
 * `presets: Record<string, PresetBuilder>`. Rule ids are the plugin's own;
 * a clash with a built-in or another plugin is an error rather than a silent
 * override.
 */
export async function loadConfig(options: ReadConfigOptions & { rules: Rule[] }): Promise<LoadedConfig> {
  const { config, path } = await readConfig(options);
  const registry = new Map(options.rules.map((r) => [r.meta.id, r]));
  const presets: Record<string, PresetBuilder> = { ...builtinPresets };
  for (const pluginPath of config.plugins ?? []) {
    const mod = await importModule(pluginPath, 'plugin');
    const root = (mod['default'] ?? mod) as { rules?: unknown; presets?: unknown };
    const rules = Array.isArray(root.rules) ? root.rules : Array.isArray(mod['rules']) ? mod['rules'] : undefined;
    if (rules === undefined || !rules.every(isRule)) {
      throw new ConfigError(`plugin ${pluginPath} does not export a \`rules\` array of rules`);
    }
    for (const rule of rules) {
      if (registry.has(rule.meta.id)) {
        throw new ConfigError(`plugin ${pluginPath}: rule "${rule.meta.id}" is already registered`);
      }
      registry.set(rule.meta.id, rule);
    }
    const pluginPresets = root.presets ?? mod['presets'];
    if (typeof pluginPresets === 'object' && pluginPresets !== null) {
      for (const [name, build] of Object.entries(pluginPresets as Record<string, unknown>)) {
        if (typeof build !== 'function') throw new ConfigError(`plugin ${pluginPath}: preset "${name}" is not a function`);
        presets[name] = build as PresetBuilder;
      }
    }
  }
  return { config, registry, presets, ...(path !== undefined ? { path } : {}) };
}

interface SchemaLike {
  type?: string;
  properties?: Record<string, { type?: string }>;
  required?: string[];
}

const typeOf = (v: unknown): string => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);

/**
 * Minimal JSON-schema check — `type`, `properties` and `required` only. Phase 0
 * deliberately avoids an ajv dependency; rule option schemas are simple.
 */
function validateOptions(ruleId: string, schema: unknown, options: unknown): void {
  if (schema === undefined || schema === null || typeof schema !== 'object') return;
  const s = schema as SchemaLike;
  if (s.type && typeOf(options) !== s.type) {
    throw new ConfigError(`options for "${ruleId}" must be of type ${s.type}`);
  }
  if (typeOf(options) !== 'object') return;
  const o = options as Record<string, unknown>;
  for (const key of s.required ?? []) {
    if (!(key in o)) throw new ConfigError(`options for "${ruleId}" are missing required "${key}"`);
  }
  for (const [key, prop] of Object.entries(s.properties ?? {})) {
    if (key in o && prop.type && typeOf(o[key]) !== prop.type) {
      throw new ConfigError(`option "${key}" of "${ruleId}" must be of type ${prop.type}`);
    }
  }
}

export interface LintTarget {
  path: string;
  tags?: string[];
  name?: string;
}

const overrideMatches = (
  override: NonNullable<UserConfig['overrides']>[number],
  target?: LintTarget,
): boolean => {
  if (override.files) {
    if (!target || !picomatch.isMatch(target.path, override.files)) return false;
  }
  const w = override.workflows;
  if (w?.tags) {
    if (!target?.tags?.some((t) => w.tags!.includes(t))) return false;
  }
  if (w?.name !== undefined && target?.name !== w.name) return false;
  return true;
};

/**
 * Resolve a user config into the rule set the runner executes. Layers apply in
 * order — presets, then departments, then rules, then each matching override
 * (again departments before rules) — so later layers win.
 */
export function resolveConfig(
  user: UserConfig,
  registry: Map<string, Rule>,
  target?: LintTarget,
  presets: Record<string, PresetBuilder> = builtinPresets,
): ResolvedConfig {
  const severities = new Map<string, Severity>();
  const options = new Map<string, unknown>();
  const fixFlags = new Map<string, boolean>();

  const applyFix = (fix?: Record<string, boolean>): void => {
    for (const [id, allowed] of Object.entries(fix ?? {})) {
      if (!registry.has(id)) throw new ConfigError(`unknown rule "${id}"`);
      fixFlags.set(id, allowed);
    }
  };

  const applyDepartments = (departments?: Record<string, Severity>): void => {
    for (const [dept, severity] of Object.entries(departments ?? {})) {
      for (const id of registry.keys()) {
        if (id.startsWith(`${dept}/`)) severities.set(id, severity);
      }
    }
  };

  const applyRules = (rules?: UserConfig['rules']): void => {
    for (const [id, value] of Object.entries(rules ?? {})) {
      const rule = registry.get(id);
      if (!rule) throw new ConfigError(`unknown rule "${id}"`);
      const [severity, opts] = Array.isArray(value) ? value : [value, undefined];
      severities.set(id, severity);
      if (opts !== undefined) {
        validateOptions(id, rule.meta.schema, opts);
        options.set(id, opts);
      }
    }
  };

  let settings = { ...(user.settings ?? {}) };

  for (const name of user.extends ?? []) {
    const build = presets[name];
    if (!build) throw new ConfigError(`unknown preset "${name}"`);
    const preset = build(registry);
    settings = { ...(preset.settings ?? {}), ...settings };
    applyDepartments(preset.departments);
    applyRules(preset.rules);
  }

  applyDepartments(user.departments);
  applyRules(user.rules);
  applyFix(user.fix);

  for (const override of user.overrides ?? []) {
    if (!overrideMatches(override, target)) continue;
    settings = { ...settings, ...(override.settings ?? {}) };
    applyDepartments(override.departments);
    applyRules(override.rules);
    applyFix(override.fix);
  }

  const rules = new Map<string, ResolvedRule>();
  for (const [id, severity] of severities) {
    if (severity === 'off') continue;
    const rule = registry.get(id);
    if (!rule) throw new ConfigError(`unknown rule "${id}"`);
    const opts = options.get(id);
    if (opts !== undefined) validateOptions(id, rule.meta.schema, opts);
    const fixAllowed = fixFlags.get(id);
    rules.set(id, {
      rule,
      severity,
      options: opts ?? {},
      ...(fixAllowed !== undefined ? { fix: fixAllowed } : {}),
    });
  }

  return { settings, rules };
}
