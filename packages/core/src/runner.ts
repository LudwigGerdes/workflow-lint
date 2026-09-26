import type { INode } from 'n8n-workflow';
import { loadPack, resolveVersion, type NodeTypePack } from 'workflow-lint-node-types';
import { applyPatches } from './fixer.js';
import { LintGraph } from './graph.js';
import { parseWorkflow } from './parse.js';
import { matchesNode, parseSelector, type Selector } from './selectors.js';
import { createN8nServices, createRuleContext } from './context.js';
import { collectDisables, disabledBy } from './disables.js';
import { applyBaseline, type Baseline } from './baseline.js';
import type {
  ConnectionRef,
  DirectiveReport,
  ResolvedVersionInfo,
  Finding,
  FixType,
  LintResult,
  LintWorkflow,
  Patch,
  ResolvedConfig,
  SelectorHandlers,
  SelectorTarget,
} from './types.js';

/** Upper bound on fix passes, matching ESLint's own guard against fix loops. */
export const MAX_FIX_PASSES = 10;

interface CompiledHandler {
  selector: Selector;
  handler: (target: SelectorTarget) => void;
}

const compile = (handlers: SelectorHandlers): CompiledHandler[] =>
  Object.entries(handlers).map(([selector, handler]) => ({
    selector: parseSelector(selector),
    handler,
  }));

const connectionRefs = (graph: LintGraph): ConnectionRef[] =>
  graph.nodes.flatMap((n) =>
    graph.outgoing(n.name).map((o) => ({
      from: n.name,
      fromOutput: o.output,
      to: o.to,
      toInput: o.input,
      type: o.type,
    })),
  );

/** Run every enabled rule over one workflow and return its findings, sorted. */
function runRules(
  workflow: LintWorkflow,
  config: ResolvedConfig,
  pack: NodeTypePack,
  n8nVersion: ResolvedVersionInfo,
  inlineConfig: boolean,
): { findings: Finding[]; directives: DirectiveReport[] } {
  const graph = new LintGraph(workflow, pack);
  const n8n = createN8nServices(graph, pack);
  const findings: Finding[] = [];

  const compiled: CompiledHandler[] = [];
  for (const [, resolved] of config.rules) {
    const ctx = createRuleContext({
      meta: resolved.rule.meta,
      options: resolved.options,
      severity: resolved.severity,
      settings: config.settings,
      n8nVersion,
      graph,
      workflow,
      n8n,
      emit: (f) => findings.push(f),
    });
    compiled.push(...compile(resolved.rule.create(ctx)));
  }

  const forKind = (kind: Selector['kind']) => compiled.filter((c) => c.selector.kind === kind);

  for (const c of forKind('Workflow')) c.handler(graph.workflow);

  const nodeHandlers = [...forKind('Node'), ...forKind('StickyNote')];
  if (nodeHandlers.length > 0) {
    for (const node of workflow.json.nodes) {
      for (const c of nodeHandlers) {
        if (matchesNode(c.selector, node as INode)) c.handler(node as INode);
      }
    }
  }

  const connectionHandlers = forKind('Connection');
  if (connectionHandlers.length > 0) {
    for (const ref of connectionRefs(graph)) {
      for (const c of connectionHandlers) c.handler(ref);
    }
  }

  for (const c of forKind('Workflow:exit')) c.handler(graph.workflow);

  const disables = collectDisables(graph);
  const counts = disables.directives.map(() => ({ suppressed: 0, blocked: 0 }));
  const kept = findings.filter((f) => {
    if (!inlineConfig) return true;
    const by = disabledBy(f, disables);
    if (by === undefined) return true;
    const count = counts[disables.directives.indexOf(by)]!;
    // A locked rule stays reported; the directive is counted as blocked so
    // the attempt shows up in the report rather than vanishing.
    if (config.locked?.has(f.ruleId)) {
      count.blocked += 1;
      return true;
    }
    count.suppressed += 1;
    return false;
  });
  const directives: DirectiveReport[] = disables.directives.map((d, i) => ({
    location: d.location,
    rules: d.tokens,
    ...(d.reason !== undefined ? { reason: d.reason } : {}),
    suppressed: counts[i]!.suppressed,
    blocked: counts[i]!.blocked,
    ignored: !inlineConfig,
  }));
  return {
    findings: kept.sort(
      (a, b) => (a.loc?.line ?? 0) - (b.loc?.line ?? 0) || a.ruleId.localeCompare(b.ruleId),
    ),
    directives,
  };
}

export interface LintOptions {
  fix?: boolean;
  fixUnsafe?: boolean;
  /**
   * Restrict autofix to these change kinds. Empty or absent means every kind.
   * Lets CI apply cosmetic fixes while leaving behaviour-changing ones to a
   * human.
   */
  fixTypes?: FixType[];
  /** Suppress findings already recorded in this baseline under `baselineKey`. */
  baseline?: Baseline;
  baselineKey?: string;
  /**
   * False turns off inline `workflow-lint-disable` directives. They are still
   * parsed and reported, so the run says what it refused to honour.
   */
  inlineConfig?: boolean;
}

/**
 * Lint one workflow document. With `fix`, applies patches and re-lints until
 * the document stops changing (or {@link MAX_FIX_PASSES} is reached), then
 * returns the findings of the final pass alongside the fixed JSON.
 */
export async function lint(
  input: { text: string; path: string },
  config: ResolvedConfig,
  opts: LintOptions = {},
): Promise<LintResult> {
  const parsed = parseWorkflow(input.text, input.path);
  if (!parsed.workflow) {
    return { path: input.path, findings: [], parseErrors: parsed.errors };
  }

  const requested = config.settings.n8nVersion;
  const resolved = resolveVersion(requested);
  const n8nVersion: ResolvedVersionInfo = {
    ...(requested !== undefined ? { requested } : {}),
    resolved: resolved.version,
    exact: resolved.exact,
    ...(resolved.note !== undefined ? { note: resolved.note } : {}),
  };
  const pack = await loadPack(resolved.version);

  let current = parsed.workflow;
  const baselined = (result: LintResult): LintResult =>
    opts.baseline ? applyBaseline(result, opts.baseline, opts.baselineKey ?? input.path) : result;

  const inlineConfig = opts.inlineConfig !== false;
  let { findings, directives } = runRules(current, config, pack, n8nVersion, inlineConfig);
  if (!opts.fix) return baselined({ path: input.path, findings, parseErrors: [], directives });

  const typeAllowed = (ruleId: string): boolean => {
    if (!opts.fixTypes || opts.fixTypes.length === 0) return true;
    const kind = config.rules.get(ruleId)?.rule.meta.fixable;
    return kind !== null && kind !== undefined && opts.fixTypes.includes(kind);
  };

  let passes = 1;
  while (passes < MAX_FIX_PASSES) {
    const patches: Patch[] = findings
      .filter(
        (f) =>
          f.fix &&
          (opts.fixUnsafe || f.fixSafety !== 'unsafe') &&
          config.rules.get(f.ruleId)?.fix !== false &&
          typeAllowed(f.ruleId),
      )
      .flatMap((f) => f.fix!);
    if (patches.length === 0) break;

    const next = applyPatches(current.json, patches);
    if (JSON.stringify(next) === JSON.stringify(current.json)) break;

    const reparsed = parseWorkflow(JSON.stringify(next, null, 2), input.path);
    if (!reparsed.workflow) break;

    current = reparsed.workflow;
    ({ findings, directives } = runRules(current, config, pack, n8nVersion, inlineConfig));
    passes += 1;
  }

  return baselined({
    path: input.path,
    findings,
    parseErrors: [],
    fixedJson: current.json,
    fixPasses: passes,
    directives,
  });
}

/**
 * Could `--fix` have dealt with this finding?
 *
 * False once the config sets `fix: false` for the rule, which is what makes
 * that entry a valid, recorded exception: you have declared this one is not
 * the machine's to fix, so `--require-fixable-clean` stops demanding it.
 */
export function isAutofixable(finding: Finding, config: ResolvedConfig): boolean {
  if (!finding.fix || finding.fix.length === 0) return false;
  return config.rules.get(finding.ruleId)?.fix !== false;
}
