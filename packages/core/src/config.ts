import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import picomatch from 'picomatch';
import { parse as parseYaml } from 'yaml';
import { presets } from './presets.js';
import type { ResolvedConfig, ResolvedRule, Rule, Severity, UserConfig } from './types.js';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const CONFIG_FILES = ['workflow-lint.config.yaml', 'workflow-lint.config.yml', 'workflow-lint.config.json'];

/** Load the nearest config file from `cwd`. Missing config is not an error. */
export async function loadConfigFile(cwd = process.cwd()): Promise<{ config: UserConfig; path?: string }> {
  for (const name of CONFIG_FILES) {
    const path = join(cwd, name);
    try {
      const text = await readFile(path, 'utf8');
      // `yaml` parses JSON too, so one branch covers both file kinds.
      return { config: (parseYaml(text) ?? {}) as UserConfig, path };
    } catch {
      continue;
    }
  }
  return { config: {} };
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
