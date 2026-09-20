import type { LintGraph } from 'workflow-lint-core';

export type Role = 'trunk' | 'branch' | 'merge' | 'subnode' | 'unrecognised';

export interface Placement {
  name: string;
  role: Role;
  /** Column index along the main flow; the first trunk node is 0. */
  column: number;
  /** Which decision node this arm hangs off, and on which output. */
  branchOf?: { decision: string; output: number };
  /** For a sub-node: the node it feeds. */
  consumerOf?: string;
}

const DECISION = new Set(['n8n-nodes-base.if', 'n8n-nodes-base.switch']);
const MERGE = 'n8n-nodes-base.merge';

/**
 * Recognise the structures the formatter knows how to place. Anything it
 * cannot classify comes back `unrecognised`, and the formatter leaves those
 * nodes exactly where they are — spec 2.5's escape hatch, and what keeps the
 * formatter from scrambling shapes it does not understand.
 */
export function classify(graph: LintGraph): Map<string, Placement> {
  const placements = new Map<string, Placement>();
  const unrecognised = (name: string): Placement => ({ name, role: 'unrecognised', column: 0 });
  for (const node of graph.nodes) placements.set(node.name, unrecognised(node.name));

  const mainIn = (name: string) => graph.incoming(name).filter((e) => e.type === 'main');
  const mainOut = (name: string) => graph.outgoing(name).filter((e) => e.type === 'main');

  // A node caught in a cycle has no well-defined column, so it is left alone.
  const cyclic = new Set(graph.cycles().flat());

  // Sub-nodes attach sideways: no main input, but an ai_* edge into a consumer.
  const subnodes = new Set<string>();
  for (const node of graph.nodes) {
    if (cyclic.has(node.name) || mainIn(node.name).length > 0) continue;
    const attachment = graph.outgoing(node.name).find((e) => e.type !== 'main');
    if (!attachment) continue;
    subnodes.add(node.name);
    placements.set(node.name, {
      name: node.name,
      role: 'subnode',
      column: 0,
      consumerOf: attachment.to,
    });
  }

  const candidates = new Set(
    graph.nodes.map((n) => n.name).filter((name) => !cyclic.has(name) && !subnodes.has(name)),
  );
  const predecessors = (name: string) => mainIn(name).filter((e) => candidates.has(e.from));
  const successors = (name: string) => mainOut(name).filter((e) => candidates.has(e.to));

  const roots = [...candidates].filter((name) => predecessors(name).length === 0);
  // No entry point means no structure to recognise.
  if (roots.length === 0) return placements;

  // Longest path from a root, so a node reachable two ways sits past both.
  const column = new Map<string, number>();
  const indegree = new Map<string, number>();
  for (const name of candidates) indegree.set(name, predecessors(name).length);

  const queue = [...roots];
  for (const root of roots) column.set(root, 0);
  const ordered: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    ordered.push(current);
    for (const edge of successors(current)) {
      column.set(edge.to, Math.max(column.get(edge.to) ?? 0, (column.get(current) ?? 0) + 1));
      const remaining = (indegree.get(edge.to) ?? 0) - 1;
      indegree.set(edge.to, remaining);
      if (remaining === 0) queue.push(edge.to);
    }
  }

  for (const name of ordered) {
    const node = graph.node(name);
    if (!node) continue;
    const incoming = predecessors(name);
    const at = column.get(name) ?? 0;

    if (node.type === MERGE && incoming.length >= 2) {
      placements.set(name, { name, role: 'merge', column: at });
      continue;
    }

    const only = incoming.length === 1 ? incoming[0]! : undefined;
    const decision = only ? graph.node(only.from) : undefined;
    if (only && decision && DECISION.has(decision.type)) {
      placements.set(name, {
        name,
        role: 'branch',
        column: at,
        branchOf: { decision: only.from, output: only.output },
      });
      continue;
    }

    placements.set(name, { name, role: 'trunk', column: at });
  }

  // A node that fans out to several children without being a decision node
  // stacks them vertically by a convention the formatter does not model (the
  // corpus uses its own offsets for these). Placing them all on one row would
  // put them on top of each other, so that whole subtree is left alone.
  const spread = new Set<string>();
  for (const name of candidates) {
    const node = graph.node(name);
    if (!node || DECISION.has(node.type)) continue;
    const children = mainOut(name).filter((e) => candidates.has(e.to));
    if (new Set(children.map((e) => e.to)).size < 2) continue;
    const queue = children.map((e) => e.to);
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (spread.has(current)) continue;
      spread.add(current);
      for (const edge of mainOut(current)) queue.push(edge.to);
    }
  }
  for (const name of spread) {
    if (placements.has(name)) placements.set(name, unrecognised(name));
  }

  return placements;
}
