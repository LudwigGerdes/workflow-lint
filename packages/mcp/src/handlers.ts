import {
  lint,
  loadConfig,
  renderRuleDoc,
  resolveConfig,
  type Finding,
  type ReportedSeverity,
  type Rule,
  type WorkflowJson,
} from 'workflow-lint-core';
import { formatText } from 'workflow-lint-fmt';
import { resolveSource, type SourceDeps, type WorkflowSource } from './source.js';

export interface HandlerDeps extends SourceDeps {
  /** The built-in rules. The config's plugins add to them. */
  registry: Map<string, Rule>;
  /** Pinned version to lint against; unpinned, version findings are advisory. */
  n8nVersion?: string;
  /** An explicit config file, relative to cwd; otherwise the nearest one is read. */
  configPath?: string;
}

/**
 * The same config the CLI would use from this cwd, read on every call so an
 * edit to the file is seen without restarting the server.
 */
const loadFor = (deps: HandlerDeps) =>
  loadConfig({
    cwd: deps.cwd,
    ...(deps.configPath !== undefined ? { path: deps.configPath } : {}),
    rules: [...deps.registry.values()],
  });

const configFor = async (deps: HandlerDeps) => {
  const { config, registry, presets } = await loadFor(deps);
  if (deps.n8nVersion !== undefined) {
    config.settings = { ...config.settings, n8nVersion: deps.n8nVersion };
  }
  return resolveConfig(config, registry, undefined, presets);
};

export interface Summary {
  errors: number;
  warnings: number;
  infos: number;
}

/** Same shape the CLI's json reporter emits, so both surfaces read alike. */
const summarise = (findings: Finding[]): Summary => {
  const summary: Summary = { errors: 0, warnings: 0, infos: 0 };
  for (const finding of findings) {
    if (finding.severity === 'error') summary.errors += 1;
    else if (finding.severity === 'warn') summary.warnings += 1;
    else summary.infos += 1;
  }
  return summary;
};

export interface RuleSummary {
  id: string;
  recommended: ReportedSeverity | false;
  fixable: string | null;
  fixSafety: string | null;
  description: string;
}

/** Every rule this server enforces, so an agent can see the vocabulary. */
export async function listRules(deps: HandlerDeps): Promise<{ rules: RuleSummary[] }> {
  const { registry } = await loadFor(deps);
  const rules = [...registry.values()]
    .sort((a, b) => a.meta.id.localeCompare(b.meta.id))
    .map((rule) => ({
      id: rule.meta.id,
      recommended: rule.meta.docs.recommended,
      fixable: rule.meta.fixable,
      fixSafety: rule.meta.fixSafety ?? null,
      description: rule.meta.docs.description,
    }));
  return { rules };
}

/** The generated reference page for one rule, from its metadata. */
export async function explainRule(
  deps: HandlerDeps,
  input: { ruleId: string },
): Promise<{ ruleId: string; markdown: string }> {
  const { registry } = await loadFor(deps);
  const rule = registry.get(input.ruleId);
  if (!rule) throw new Error(`unknown rule "${input.ruleId}"`);
  return { ruleId: rule.meta.id, markdown: renderRuleDoc(rule) };
}

export interface LintResultPayload {
  path: string;
  findings: Finding[];
  summary: Summary;
}

export async function lintWorkflow(
  deps: HandlerDeps,
  input: WorkflowSource,
): Promise<LintResultPayload> {
  const { text, path } = await resolveSource(deps, input);
  const result = await lint({ text, path }, await configFor(deps));
  // A document that will not parse is an error result, never a clean summary:
  // an agent reads `summary.errors: 0` as "passing" and stops looking.
  if (result.parseErrors.length > 0) {
    throw new Error(`cannot lint ${path}: ${result.parseErrors.map((e) => e.message).join('; ')}`);
  }
  return {
    path,
    findings: result.findings,
    summary: summarise(result.findings),
  };
}

export async function fixWorkflow(
  deps: HandlerDeps,
  input: WorkflowSource & { unsafe?: boolean },
): Promise<{ path: string; json: WorkflowJson; changed: boolean; remaining: Finding[] }> {
  const { text, path } = await resolveSource(deps, input);
  const result = await lint({ text, path }, await configFor(deps), {
    fix: true,
    ...(input.unsafe ? { fixUnsafe: true } : {}),
  });
  if (!result.fixedJson) {
    throw new Error(`cannot fix ${path}: ${result.parseErrors.map((e) => e.message).join('; ')}`);
  }
  const before = JSON.parse(text) as unknown;
  return {
    path,
    json: result.fixedJson,
    changed: JSON.stringify(result.fixedJson) !== JSON.stringify(before),
    remaining: result.findings,
  };
}

export async function formatWorkflow(
  deps: HandlerDeps,
  input: WorkflowSource & { stickies?: boolean },
): Promise<{ path: string; json: WorkflowJson; moved: number; changed: boolean }> {
  const { text, path } = await resolveSource(deps, input);
  const { parseErrors, result } = await formatText(
    { text, path },
    {
      ...(deps.n8nVersion !== undefined ? { n8nVersion: deps.n8nVersion } : {}),
      ...(input.stickies ? { stickies: true } : {}),
    },
  );
  if (!result) {
    throw new Error(`cannot format ${path}: ${parseErrors.map((e) => e.message).join('; ')}`);
  }
  return { path, json: result.json, moved: result.moves.length, changed: result.changed };
}
