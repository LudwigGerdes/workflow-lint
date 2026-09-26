import type { INode } from 'n8n-workflow';
import type { LintGraph } from './graph.js';
import type { Finding } from './types.js';

/**
 * n8n workflows have no comments, so directives live in a node's `notes` field
 * or in a sticky note's content:
 *
 *   workflow-lint-disable naming/no-default-node-name -- reason
 *   workflow-lint-disable naming, structure/merge-for-reconvergence
 *   workflow-lint-disable-file *
 */
const DIRECTIVE = /^workflow-lint-disable(-file)?\s+([\w/*-]+(?:\s*,\s*[\w/*-]+)*)(?:\s+--\s+(.*))?$/;

/** One directive as written, and the nodes it covers. */
export interface Directive {
  /** `node:<name>` or `sticky:<name>`. */
  location: string;
  /** Whole document (`-disable-file`) rather than the nodes listed. */
  file: boolean;
  tokens: string[];
  reason?: string;
  /** Node names covered when `file` is false. */
  nodes: string[];
}

export interface Disables {
  directives: Directive[];
}

const parseDirective = (line: string): { file: boolean; tokens: string[]; reason?: string } | undefined => {
  const m = DIRECTIVE.exec(line.trim());
  if (!m) return undefined;
  const reason = m[3]?.trim();
  return {
    file: m[1] !== undefined,
    tokens: m[2]!
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0),
    ...(reason ? { reason } : {}),
  };
};

export function collectDisables(graph: LintGraph): Disables {
  const directives: Directive[] = [];

  for (const node of graph.nodes) {
    const notes = (node as INode & { notes?: unknown }).notes;
    if (typeof notes !== 'string') continue;
    for (const line of notes.split('\n')) {
      const d = parseDirective(line);
      if (d) directives.push({ location: `node:${node.name}`, ...d, nodes: [node.name] });
    }
  }

  for (const sticky of graph.stickies) {
    const content = (sticky.parameters as { content?: unknown }).content;
    if (typeof content !== 'string') continue;
    // The directive must be the first line that is neither blank nor a heading.
    const first = content
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !l.startsWith('#'));
    if (first === undefined) continue;
    const d = parseDirective(first);
    if (d) {
      directives.push({
        location: `sticky:${sticky.name}`,
        ...d,
        nodes: graph.nodesInside(sticky).map((n) => n.name),
      });
    }
  }

  return { directives };
}

/** A token matches a rule id exactly, its department, or `*`. */
const covers = (tokens: string[], ruleId: string): boolean =>
  tokens.includes('*') || tokens.includes(ruleId) || tokens.includes(ruleId.split('/')[0]!);

/** The first directive that names this finding, if any. */
export function disabledBy(finding: Finding, disables: Disables): Directive | undefined {
  return disables.directives.find((d) => {
    if (!covers(d.tokens, finding.ruleId)) return false;
    if (d.file) return true;
    return finding.nodeName !== undefined && d.nodes.includes(finding.nodeName);
  });
}

export function isDisabled(finding: Finding, disables: Disables): boolean {
  return disabledBy(finding, disables) !== undefined;
}
