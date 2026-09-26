import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import {
  BASELINE_FILE,
  buildIgnore,
  generateBaseline,
  isAutofixable,
  lint,
  loadConfig,
  parseBaseline,
  resolveConfig,
  serializeBaseline,
  type Baseline,
  type LintResult,
  type FixType,
  type ReportedSeverity,
  type RuleClass,
  type Rule,
  type LoadedConfig,
} from 'workflow-lint-core';
import { resolveVersion } from 'workflow-lint-node-types';
import { rules as n8nRules } from 'workflow-lint-plugin-n8n';
import { rules as standardsRules } from 'workflow-lint-plugin-standards';
import {
  discover,
  reportIgnored,
  reportMissingReasons,
  reportSkipped,
  UsageError,
} from '../files.js';
import { notAWorkflow, peek } from '../workflow-file.js';
import { stylish } from '../reporters/stylish.js';
import { json as jsonReporter } from '../reporters/json.js';
import { sarif } from '../reporters/sarif.js';
import { junit } from '../reporters/junit.js';
import { githubActions } from '../reporters/github-actions.js';
import { canvasOverlay } from '../reporters/canvas-overlay.js';
import { listDifferent } from '../reporters/list.js';
import { createLogger, DEFAULT_LOG_LEVEL, isLogLevel, LOG_LEVELS } from '../log.js';
import { summarise, type DirectiveSummary } from '../reporters/summary.js';

export interface LintCommandOptions {
  config?: string;
  format: string;
  failOn: string;
  n8nVersion?: string;
  fix?: boolean;
  fixUnsafe?: boolean;
  rule: string[];
  quiet?: boolean;
  maxWarnings?: string;
  errorOnUnmatchedPattern?: boolean;
  /** False when `--no-ignore` is passed: lint everything, ignore rules aside. */
  ignore?: boolean;
  /** False when `--no-inline-config` is passed: directives in notes and stickies are not applied. */
  inlineConfig?: boolean;
  /** Print only the paths of files that fail the run, one per line. */
  listDifferent?: boolean;
  /** Diagnostic verbosity: silent, error, warn, log or debug. */
  logLevel?: string;
  /** Comma-separated change kinds --fix may apply: params, layout, connections. */
  fixType?: string;
  /** Fail when a finding remains that --fix could have dealt with. */
  requireFixableClean?: boolean;
  /** Run only rules of this class: stylistic or quality. */
  class?: string;
  /** Let stylistic findings fail the run; by default they never do. */
  failOnStylistic?: boolean;
  genBaseline?: boolean;
  ignoreBaseline?: boolean;
  baseline?: string;
}

export interface LintDeps {
  write: (text: string) => void;
  writeErr: (text: string) => void;
  cwd: string;
  readStdin: () => Promise<string>;
}

const SEVERITY_RANK: Record<ReportedSeverity, number> = { info: 1, warn: 2, error: 3 };
const FORMATS = ['stylish', 'json', 'sarif', 'junit', 'github-actions', 'canvas-overlay'] as const;
const FIX_TYPES = ['params', 'layout', 'connections'] as const;
const RULE_CLASSES = ['stylistic', 'quality'] as const;
const STDIN = '<stdin>';
const CHUNK = 8;

/** The rules that ship in the package. Plugins named in the config add to these. */
export const builtinRules = (): Rule[] => [...n8nRules, ...standardsRules];

export const buildRegistry = (): Map<string, Rule> =>
  new Map(builtinRules().map((r) => [r.meta.id, r]));

/**
 * Inline directives are the one suppression nobody reviews in a config diff,
 * so the run says what they did: a directive that suppressed nothing is stale
 * or mistyped, and one that named a locked rule did not work.
 */
function reportDirectives(d: DirectiveSummary, log: { log: (t: string) => void }): void {
  if (d.unused > 0) {
    log.log(`workflow-lint: ${d.unused} inline directive(s) suppress nothing — stale, or the rule id is mistyped\n`);
  }
  if (d.blocked > 0) {
    log.log(`workflow-lint: ${d.blocked} finding(s) kept despite an inline directive: the rule is locked\n`);
  }
  if (d.ignored > 0) {
    log.log(`workflow-lint: ${d.ignored} inline directive(s) not applied (--no-inline-config)\n`);
  }
}

/**
 * The config file (nearest, or `--config`), its `extends` chain and its
 * plugins, with `--n8n-version` laid over the top.
 */
export async function readUserConfig(options: { config?: string; n8nVersion?: string }, cwd: string): Promise<LoadedConfig> {
  const loaded = await loadConfig({
    cwd,
    ...(options.config ? { path: options.config } : {}),
    rules: builtinRules(),
  });
  if (options.n8nVersion) {
    loaded.config.settings = { ...loaded.config.settings, n8nVersion: options.n8nVersion };
  }
  return loaded;
}

/** Run the lint command and return the process exit code. */
export async function runLint(
  paths: string[],
  options: LintCommandOptions,
  deps: LintDeps,
): Promise<number> {
  const { cwd } = deps;
  const started = Date.now();

  const level = options.logLevel ?? DEFAULT_LOG_LEVEL;
  if (!isLogLevel(level)) {
    throw new UsageError(
      `unknown --log-level "${level}"; expected one of ${LOG_LEVELS.join(', ')}`,
    );
  }
  const log = createLogger(level, deps.writeErr);

  if (!FORMATS.includes(options.format as (typeof FORMATS)[number])) {
    throw new UsageError(
      `unknown format "${options.format}"; expected one of ${FORMATS.join(', ')}`,
    );
  }
  if (!(options.failOn in SEVERITY_RANK)) {
    throw new UsageError(`unknown --fail-on "${options.failOn}"; expected info, warn or error`);
  }
  if (
    options.class !== undefined &&
    !RULE_CLASSES.includes(options.class as (typeof RULE_CLASSES)[number])
  ) {
    throw new UsageError(
      `unknown --class "${options.class}"; expected one of ${RULE_CLASSES.join(', ')}`,
    );
  }

  const fixTypes = (options.fixType ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  for (const t of fixTypes) {
    if (!FIX_TYPES.includes(t as (typeof FIX_TYPES)[number])) {
      throw new UsageError(
        `unknown --fix-type "${t}"; expected one of ${FIX_TYPES.join(', ')}`,
      );
    }
  }

  const { config: userConfig, path: configPath, registry, presets } = await readUserConfig(options, cwd);
  for (const id of options.rule) {
    if (!registry.has(id)) throw new UsageError(`unknown rule "${id}"`);
  }
  log.debug(
    `workflow-lint: config ${configPath ? relative(cwd, configPath) || configPath : '(none; using workflow-lint:recommended)'}\n`,
  );

  const baselinePath = resolve(cwd, options.baseline ?? BASELINE_FILE);
  let baseline: Baseline | undefined;
  if (!options.genBaseline && !options.ignoreBaseline && existsSync(baselinePath)) {
    baseline = parseBaseline(await readFile(baselinePath, 'utf8'));
  }

  const targets: Array<{ text: string; path: string; file?: string; explicit: boolean }> = [];
  if (paths.includes('-')) {
    targets.push({ text: await deps.readStdin(), path: STDIN, explicit: true });
  }
  const skipped: string[] = [];
  const unmatched =
    options.errorOnUnmatchedPattern === false
      ? { errorOnUnmatched: false, onUnmatched: (p: string) => skipped.push(p) }
      : {};
  const matcher = await buildIgnore({
    root: cwd,
    ...(userConfig.ignore ? { patterns: userConfig.ignore } : {}),
    ...(options.ignore === false ? { gitignore: false } : {}),
  });
  const { files, ignored, explicit } = await discover(
    paths.filter((p) => p !== '-'),
    cwd,
    { ...unmatched, ...(options.ignore === false ? {} : { ignore: matcher }) },
  );
  for (const file of files) {
    targets.push({
      text: await readFile(file, 'utf8'),
      path: relative(cwd, file) || file,
      file,
      explicit: explicit.has(file),
    });
  }

  reportSkipped(skipped, log);
  reportIgnored(ignored, log);
  reportMissingReasons(userConfig, log);

  const requested = userConfig.settings?.n8nVersion;
  const bundle = resolveVersion(requested);
  // Three distinct cases, and conflating them is what makes this line useless:
  // nothing pinned is not the same as a pin we could not honour.
  const how =
    requested === undefined
      ? 'no version pinned; latest bundled'
      : bundle.exact
        ? `exact match for ${requested}`
        : `nearest to requested ${requested}`;
  log.debug(`workflow-lint: node-types bundle ${bundle.version} (${how})\n`);
  // An explicit pin we could not honour changes what the rules see, quietly.
  // That is the likeliest reason a rule "does not fire", so it earns a warning.
  if (requested !== undefined && !bundle.exact && bundle.note !== undefined) {
    log.warn(`workflow-lint: ${bundle.note}\n`);
  }
  log.debug(`workflow-lint: ${targets.length} file(s), ${registry.size} rules registered\n`);

  const stillFixable = new Set<string>();

  const lintOne = async (target: (typeof targets)[number]): Promise<LintResult | undefined> => {
    const info = peek(target.text);
    // A scan skips JSON that is not a workflow; a file named by the user is
    // reported, so `workflow-lint lint thing.json` never passes having checked nothing.
    if (!info.isWorkflow) return target.explicit ? notAWorkflow(target.path) : undefined;

    const resolved = resolveConfig(
      userConfig,
      registry,
      {
        path: target.path,
        ...(info.tags ? { tags: info.tags } : {}),
        ...(info.name ? { name: info.name } : {}),
      },
      presets,
    );
    if (options.rule.length > 0) {
      for (const id of [...resolved.rules.keys()]) {
        if (!options.rule.includes(id)) resolved.rules.delete(id);
      }
    }
    if (options.class !== undefined) {
      for (const [id, r] of [...resolved.rules]) {
        if (r.rule.meta.class !== options.class) resolved.rules.delete(id);
      }
    }

    const result = await lint({ text: target.text, path: target.path }, resolved, {
      ...(options.fix ? { fix: true } : {}),
      ...(options.fixUnsafe ? { fix: true, fixUnsafe: true } : {}),
      ...(baseline ? { baseline, baselineKey: target.path } : {}),
      ...(fixTypes.length > 0 ? { fixTypes: fixTypes as FixType[] } : {}),
      ...(options.inlineConfig === false ? { inlineConfig: false } : {}),
    });

    if (options.requireFixableClean) {
      // `resolved` is this file's config, so a path-scoped `fix: false`
      // override counts as the recorded exception it is meant to be.
      for (const f of result.findings) {
        if (isAutofixable(f, resolved)) stillFixable.add(target.path);
      }
    }

    if ((options.fix || options.fixUnsafe) && result.fixedJson && target.file) {
      const fixed = `${JSON.stringify(result.fixedJson, null, 2)}\n`;
      if (fixed !== target.text) await writeFile(target.file, fixed, 'utf8');
    }
    return result;
  };

  const results: LintResult[] = [];
  for (let i = 0; i < targets.length; i += CHUNK) {
    const batch = await Promise.all(targets.slice(i, i + CHUNK).map(lintOne));
    for (const r of batch) if (r) results.push(r);
  }

  log.debug(`workflow-lint: linted ${results.length} workflow(s) in ${Date.now() - started}ms\n`);

  if (options.genBaseline) {
    const generated = generateBaseline(results, (r) => r.path);
    await writeFile(baselinePath, serializeBaseline(generated), 'utf8');
    const count = Object.values(generated.entries).reduce((a, b) => a + b, 0);
    if (!log.silent) deps.write(
      `Wrote ${relative(cwd, baselinePath) || baselinePath} with ${count} finding${count === 1 ? '' : 's'}\n`,
    );
    return 0;
  }

  const reported = options.quiet
    ? results.map((r) => ({ ...r, findings: r.findings.filter((f) => f.severity === 'error') }))
    : results;

  // SARIF suggested fixes need the original text to apply patches to.
  const sources = new Map(targets.map((t) => [t.path, t.text]));
  const failOn = options.failOn as ReportedSeverity;
  const classOf = (ruleId: string): RuleClass | undefined => registry.get(ruleId)?.meta.class;
  /**
   * Formatting is not a build failure: a stylistic finding never fails the run
   * unless asked to. Everything downstream — the exit code and `-l` — reads
   * this one predicate, so they cannot disagree.
   */
  const canFail = (ruleId: string): boolean =>
    options.failOnStylistic === true || classOf(ruleId) !== 'stylistic';
  const blocks = (f: { ruleId: string; severity: ReportedSeverity }): boolean =>
    SEVERITY_RANK[f.severity] >= SEVERITY_RANK[failOn] && canFail(f.ruleId);
  const output = options.listDifferent
    ? listDifferent(reported, { blocks })
    : options.format === 'json'
      ? jsonReporter(reported)
      : options.format === 'sarif'
        ? sarif(reported, { rules: registry, sources })
        : options.format === 'junit'
          ? junit(reported, { failOn })
          : options.format === 'github-actions'
            ? githubActions(reported)
            : options.format === 'canvas-overlay'
              ? canvasOverlay(reported)
              : stylish(reported);
  if (!log.silent && output.length > 0) deps.write(output);

  // A document that will not parse cannot be linted, so it outranks findings.
  if (results.some((r) => r.parseErrors.length > 0)) return 2;

  if (options.requireFixableClean && stillFixable.size > 0) {
    const n = stillFixable.size;
    log.error(
      `workflow-lint: ${n} file${n === 1 ? ' still carries' : 's still carry'} a finding that --fix could resolve:\n` +
        [...stillFixable].sort().map((p) => `  ${p}\n`).join('') +
        `  Fix ${n === 1 ? 'it' : 'them'}: workflow-lint --fix\n` +
        `  Or record the exception — set fix: false for the rule, turn it off, or baseline it.\n`,
    );
    return 1;
  }

  const summary = summarise(reported);
  reportDirectives(summary.directives, log);
  const failing = reported.flatMap((r) => r.findings).filter(blocks);
  if (failing.length > 0) return 1;

  if (options.maxWarnings !== undefined) {
    // Counted with the same predicate as the exit code. A stylistic warning
    // that cannot fail the run must not fail it through the warning budget
    // either, or "formatting is not a build failure" is only half true.
    const budget = reported
      .flatMap((r) => r.findings)
      .filter((f) => f.severity === 'warn' && canFail(f.ruleId)).length;
    if (budget > Number(options.maxWarnings)) {
      log.warn(`${budget} warnings exceed the --max-warnings limit of ${options.maxWarnings}\n`);
      return 1;
    }
  }
  return 0;
}
