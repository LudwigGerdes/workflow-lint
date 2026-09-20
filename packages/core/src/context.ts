import { getNodeParametersIssues, isDefaultNodeName, isTool as n8nIsTool } from './n8n.js';
import type { INode } from 'n8n-workflow';
import type { NodeTypePack } from 'workflow-lint-node-types';
import { Fixer } from './fixer.js';
import type { LintGraph } from './graph.js';
import type {
  Finding,
  LintWorkflow,
  N8nServices,
  Patch,
  ReportDescriptor,
  ReportedSeverity,
  ResolvedSettings,
  ResolvedVersionInfo,
  RuleContext,
  RuleMeta,
} from './types.js';

/**
 * n8n's own semantics, resolved against the bundled pack. Every service
 * tolerates a node whose type is not in the pack, returning a neutral answer
 * rather than throwing — an unknown node must never break a lint run.
 */
export function createN8nServices(graph: LintGraph, pack: NodeTypePack): N8nServices {
  const describe = (node: INode) => graph.describe(node);
  return {
    pack,
    nodeType: describe,
    parameterIssues: (node) => {
      const d = describe(node);
      return d ? getNodeParametersIssues(d.properties, node, d) : null;
    },
    isDefaultName: (node) => {
      const d = describe(node);
      return d ? isDefaultNodeName(node.name, d, node.parameters) : false;
    },
    isTrigger: (node) => graph.isTrigger(node),
    isSubNode: (node) => graph.isSubNode(node),
    isTool: (node) => {
      const d = describe(node);
      return d ? n8nIsTool(d, node.parameters) : false;
    },
    versions: (nodeType) => pack.versionsOf(nodeType),
  };
}

const interpolate = (template: string, data?: Record<string, string | number>): string =>
  template.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) =>
    data && key in data ? String(data[key]) : whole,
  );

export interface RuleContextDeps {
  meta: RuleMeta;
  options: unknown;
  severity: ReportedSeverity;
  settings: ResolvedSettings;
  n8nVersion: ResolvedVersionInfo;
  graph: LintGraph;
  workflow: LintWorkflow;
  n8n: N8nServices;
  emit: (finding: Finding) => void;
}

export function createRuleContext(deps: RuleContextDeps): RuleContext {
  const { meta, graph, workflow, emit } = deps;
  const fixer = new Fixer();

  return {
    id: meta.id,
    options: deps.options,
    settings: deps.settings,
    n8nVersion: deps.n8nVersion,
    graph,
    workflow,
    n8n: deps.n8n,
    report(descriptor: ReportDescriptor): void {
      const node =
        typeof descriptor.node === 'string' ? graph.node(descriptor.node) : descriptor.node;
      const template = meta.messages[descriptor.messageId] ?? descriptor.messageId;
      const fixes: Patch[] | undefined = descriptor.fix
        ? [descriptor.fix(fixer)].flat()
        : undefined;

      const loc = node
        ? workflow.sourceMap.node(node.name)
        : descriptor.connection
          ? workflow.sourceMap.node(descriptor.connection.from)
          : workflow.sourceMap.workflow();

      emit({
        ruleId: meta.id,
        severity: deps.severity,
        message: interpolate(template, descriptor.data),
        messageId: descriptor.messageId,
        path: workflow.path,
        nodeName: node?.name,
        nodeId: node?.id,
        loc,
        ...(descriptor.data ? { data: descriptor.data } : {}),
        ...(fixes && fixes.length > 0
          ? { fix: fixes, fixSafety: meta.fixSafety ?? 'safe' }
          : {}),
      });
    },
  };
}
