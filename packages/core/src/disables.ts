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
const DIRECTIVE = /^workflow-lint-disable(-file)?\s+([\w/*-]+(?:\s*,\s*[\w/*-]+)*)(?:\s+--\s+.*)?$/;

export interface Disables {
  /** Rule ids, departments or `*` disabled for the whole document. */
  file: Set<string>;
  byNode: Map<string, Set<string>>;
}

const parseDirective = (line: string): { file: boolean; tokens: string[] } | undefined => {
  const m = DIRECTIVE.exec(line.trim());
  if (!m) return undefined;
  return {
    file: m[1] !== undefined,
    tokens: m[2]!
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0),
  };
};

export function collectDisables(graph: LintGraph): Disables {
  const file = new Set<string>();
  const byNode = new Map<string, Set<string>>();

  const addToNode = (name: string, tokens: string[]): void => {
    const set = byNode.get(name) ?? new Set<string>();
    for (const t of tokens) set.add(t);
    byNode.set(name, set);
  };
  const absorb = (directive: { file: boolean; tokens: string[] }, names: string[]): void => {
    if (directive.file) for (const t of directive.tokens) file.add(t);
    else for (const n of names) addToNode(n, directive.tokens);
  };

  for (const node of graph.nodes) {
    const notes = (node as INode & { notes?: unknown }).notes;
    if (typeof notes !== 'string') continue;
    for (const line of notes.split('\n')) {
      const d = parseDirective(line);
      if (d) absorb(d, [node.name]);
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
    if (d) absorb(d, graph.nodesInside(sticky).map((n) => n.name));
  }

  return { file, byNode };
}

/** A token matches a rule id exactly, its department, or `*`. */
const covers = (tokens: Set<string>, ruleId: string): boolean =>
  tokens.has('*') || tokens.has(ruleId) || tokens.has(ruleId.split('/')[0]!);

export function isDisabled(finding: Finding, disables: Disables): boolean {
  if (covers(disables.file, finding.ruleId)) return true;
  if (finding.nodeName === undefined) return false;
  const tokens = disables.byNode.get(finding.nodeName);
  return tokens !== undefined && covers(tokens, finding.ruleId);
}
