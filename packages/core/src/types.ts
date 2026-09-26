import type { IConnections, INode } from 'n8n-workflow';

export type Severity = 'off' | 'info' | 'warn' | 'error';
export type ReportedSeverity = Exclude<Severity, 'off'>;

export interface Location {
  line: number;
  column: number;
}

export type Patch =
  | { op: 'setParameter'; node: string; path: string; value: unknown }
  | { op: 'deleteParameter'; node: string; path: string }
  | { op: 'renameNode'; from: string; to: string }
  | { op: 'moveNode'; node: string; position: [number, number] }
  | { op: 'resizeSticky'; node: string; rect: { x: number; y: number; width: number; height: number } }
  | { op: 'addConnection'; from: string; fromOutput: number; to: string; toInput: number; type?: string }
  | { op: 'removeConnection'; from: string; fromOutput: number; to: string; toInput: number; type?: string }
  | { op: 'setNodeField'; node: string; field: NodeField; value: unknown }
  | { op: 'setSetting'; key: string; value: unknown };

/**
 * Node-level fields a fix may set. These live on the node itself, not in its
 * parameters — `retryOnFail` and friends are node properties in n8n's schema.
 * `name` is excluded on purpose: renaming must go through `renameNode`, which
 * also rewrites connections and expression references.
 */
export type NodeField =
  | 'typeVersion'
  | 'disabled'
  | 'notes'
  | 'onError'
  | 'retryOnFail'
  | 'maxTries'
  | 'waitBetweenTries'
  | 'alwaysOutputData'
  | 'executeOnce';

export interface Finding {
  ruleId: string;
  severity: ReportedSeverity;
  message: string;
  messageId?: string;
  path: string;
  nodeName?: string;
  nodeId?: string;
  loc?: Location;
  /** The values interpolated into `message`; asserted by RuleTester. */
  data?: Record<string, string | number>;
  fix?: Patch[];
  fixSafety?: 'safe' | 'unsafe';
}

export interface WorkflowJson {
  id?: string;
  name?: string;
  nodes: INode[];
  connections: IConnections;
  settings?: Record<string, unknown>;
  tags?: Array<string | { name: string }>;
  pinData?: unknown;
  meta?: unknown;
}

export interface SourceMap {
  node(name: string): Location | undefined;
  workflow(): Location;
  setting(key: string): Location | undefined;
}

export interface LintWorkflow {
  json: WorkflowJson;
  path: string;
  sourceMap: SourceMap;
}

export interface ParseError {
  message: string;
  loc?: Location;
}

// ---------------------------------------------------------------------------
// Rules, context and results
// ---------------------------------------------------------------------------

import type { INodeIssues, INodeTypeDescription, Workflow } from 'n8n-workflow';
import type { NodeTypePack } from 'workflow-lint-node-types';
import type { LintGraph } from './graph.js';
import type { Fixer } from './fixer.js';

/** A single connection edge, the target of a `Connection` selector. */
export interface ConnectionRef {
  from: string;
  fromOutput: number;
  to: string;
  toInput: number;
  type: string;
}

/**
 * What kind of judgement a rule makes, orthogonal to its department.
 *
 * `stylistic` rules concern how a workflow *looks* on the canvas — composition,
 * naming shape, spacing. They are advisory by default and never fail a run
 * unless `--fail-on-stylistic` is passed, because formatting is not a build
 * failure. `quality` rules concern whether the workflow is *correct or safe*,
 * and they block.
 *
 * Department is not a reliable proxy. `naming/agent-tool-snake-case` lives in
 * `naming` but is functional — tool names reach the model as identifiers — so
 * it is `quality`.
 */
export type RuleClass = 'stylistic' | 'quality';

export interface RuleMeta {
  id: string;
  type: 'problem' | 'suggestion';
  class: RuleClass;
  docs: {
    description: string;
    recommended: ReportedSeverity | false;
    url?: string;
  };
  fixable: 'params' | 'layout' | 'connections' | null;
  fixSafety?: 'safe' | 'unsafe';
  /** JSON-schema-ish description of the rule's options. */
  schema?: unknown;
  messages: Record<string, string>;
}

export type SelectorTarget = INode | Workflow | ConnectionRef;
export type SelectorHandlers = Record<string, (target: SelectorTarget) => void>;

export interface ReportDescriptor {
  node?: INode | string;
  connection?: ConnectionRef;
  workflow?: true;
  messageId: string;
  data?: Record<string, string | number>;
  fix?: (f: Fixer) => Patch | Patch[];
}

/** n8n's own semantics, exposed to rules like typescript-eslint's parserServices. */
export interface N8nServices {
  pack: NodeTypePack;
  nodeType(node: INode): INodeTypeDescription | undefined;
  parameterIssues(node: INode): INodeIssues | null;
  isDefaultName(node: INode): boolean;
  isTrigger(node: INode): boolean;
  isSubNode(node: INode): boolean;
  isTool(node: INode): boolean;
  versions(nodeType: string): { versions: number[]; defaultVersion: number } | undefined;
}

export interface ResolvedSettings {
  n8nVersion?: string;
}

/** How the requested n8n version resolved against the bundled packs. */
export interface ResolvedVersionInfo {
  requested?: string;
  resolved: string;
  exact: boolean;
  note?: string;
}

export interface RuleContext {
  id: string;
  options: unknown;
  settings: ResolvedSettings;
  /** The resolved node-type pack version; `exact` is false when inferred. */
  n8nVersion: ResolvedVersionInfo;
  graph: LintGraph;
  workflow: LintWorkflow;
  n8n: N8nServices;
  report(descriptor: ReportDescriptor): void;
}

export interface Rule {
  meta: RuleMeta;
  create(ctx: RuleContext): SelectorHandlers;
}

/** The kind of change a fixer makes, from the rule's own `meta.fixable`. */
export type FixType = 'params' | 'layout' | 'connections';

export interface ResolvedRule {
  rule: Rule;
  severity: ReportedSeverity;
  options: unknown;
  /**
   * False when the config opts this rule out of autofix. The rule still
   * reports; `--fix` simply will not touch it. Some fixers change runtime
   * behaviour — adding retries, reordering execution — and a fleet may want
   * those flagged for a human rather than applied by a machine.
   */
  fix?: boolean;
}

export interface ResolvedConfig {
  settings: ResolvedSettings;
  rules: Map<string, ResolvedRule>;
}

export interface LintResult {
  path: string;
  findings: Finding[];
  parseErrors: ParseError[];
  fixedJson?: WorkflowJson;
  fixPasses?: number;
}

/**
 * One `ignore:` entry. The bare string is the common form; the object form
 * exists so a permanent exception can say why it is there.
 */
export type IgnoreEntry = string | { path: string; reason?: string };

/** A user-authored configuration, from `workflow-lint.config.yaml` or a preset. */
export interface UserConfig {
  /**
   * Presets (`workflow-lint:recommended`, or one a plugin exports), local
   * files (`./base.yaml`, resolved against this file) and npm packages
   * (`@acme/workflow-lint-config`, a module exporting a config or a package
   * whose `main` is a YAML file). Applied in order; this file's own settings
   * come last.
   */
  extends?: string[];
  /**
   * Rule plugins: a local module (`./rules/index.mjs`, resolved against this
   * file) or an npm package, exporting `rules: Rule[]` and optionally
   * `presets`. Their rules become available to `rules` and `departments`
   * under their own ids.
   */
  plugins?: string[];
  settings?: ResolvedSettings;
  /**
   * Gitignore-syntax patterns for files never to lint. A directory scan skips
   * them; naming one explicitly on the command line still lints it.
   *
   * Reach for `--gen-baseline` instead when the goal is to quiet existing
   * findings — a baseline keeps watching for *new* ones, where `ignore` stops
   * looking altogether.
   */
  ignore?: IgnoreEntry[];
  rules?: Record<string, Severity | [Severity, unknown]>;
  departments?: Record<string, Severity>;
  /**
   * Per-rule autofix opt-out: `{ "reliability/http-retry-config": false }`.
   * The rule keeps reporting; only its fixer is withheld. This is also the
   * recorded exception that satisfies `--require-fixable-clean`.
   */
  fix?: Record<string, boolean>;
  overrides?: Array<{
    files?: string[];
    workflows?: { tags?: string[]; name?: string };
    /**
     * Target settings for the matched files — above all `n8nVersion`. The same
     * workflow legitimately exists at different versions in different
     * directories, so a single repo-wide pin cannot describe a fleet.
     */
    settings?: ResolvedSettings;
    /** Why this exception exists. Optional, but counted when absent. */
    reason?: string;
    rules?: Record<string, Severity | [Severity, unknown]>;
    departments?: Record<string, Severity>;
    fix?: Record<string, boolean>;
  }>;
}
