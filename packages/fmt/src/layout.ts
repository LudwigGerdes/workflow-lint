import type { LintGraph } from 'workflow-lint-core';
import type { Placement } from './classify.js';
import type { FormatOptions } from './options.js';

/**
 * Which composition principle a move restores. Positions are computed
 * holistically, so this is derived at emission from the node's role and which
 * axis actually moved — enough to say *why* a workflow is not formatted,
 * rather than only how many nodes would shift.
 */
export type MoveReason = 'spacing' | 'symmetry' | 'alignment' | 'subnode';

export interface Move {
  name: string;
  position: [number, number];
  /** Non-empty: a move exists only because at least one axis is off. */
  reasons: MoveReason[];
}

/**
 * A sub-node's x and y are both set from its consumer, so neither axis means
 * spacing or alignment on its own. Otherwise x is the main-path gap, and y is
 * branch symmetry for an arm and row alignment for anything else.
 */
const reasonsFor = (role: string | undefined, dx: boolean, dy: boolean): MoveReason[] => {
  if (role === 'subnode') return ['subnode'];
  const reasons: MoveReason[] = [];
  if (dx) reasons.push('spacing');
  if (dy) reasons.push(role === 'branch' ? 'symmetry' : 'alignment');
  return reasons;
};

export interface StickyRect {
  name: string;
  rect: { x: number; y: number; width: number; height: number };
}

/** Horizontal margins around the enclosed nodes, in canvas units. */
const STICKY_LEFT_MARGIN = 48;
const STICKY_WIDTH_MARGIN = 288;

/**
 * Assign positions from a classification.
 *
 * The formatter normalises *relative* geometry, never absolute placement:
 * each entry node keeps exactly where the author put it, and everything
 * downstream is laid out relative to it. Forcing a global origin would move
 * every workflow whose canvas simply starts somewhere else, which is churn
 * rather than formatting.
 *
 * Only nodes whose position actually changes come back, and `unrecognised`
 * placements never do.
 */
export function positionsFor(
  graph: LintGraph,
  placements: Map<string, Placement>,
  options: FormatOptions,
): Move[] {
  const { spacing, branchOffset, clawOffset } = options;
  const target = new Map<string, [number, number]>();

  // Which output indices each decision uses, so arms spread symmetrically
  // about their own decision however many there are.
  const armsOf = new Map<string, number[]>();
  for (const placement of placements.values()) {
    if (placement.role !== 'branch' || !placement.branchOf) continue;
    const { decision, output } = placement.branchOf;
    const outputs = armsOf.get(decision) ?? [];
    if (!outputs.includes(output)) outputs.push(output);
    armsOf.set(decision, outputs);
  }
  for (const outputs of armsOf.values()) outputs.sort((a, b) => a - b);

  const mainOut = (name: string) => graph.outgoing(name).filter((e) => e.type === 'main');
  const mainIn = (name: string) => graph.incoming(name).filter((e) => e.type === 'main');

  const positioned = [...placements.values()].filter(
    (p) => p.role !== 'unrecognised' && p.role !== 'subnode',
  );

  // Each entry node anchors its own component; the rest inherit that origin.
  const origin = new Map<string, [number, number]>();
  const ordered = [...positioned].sort((a, b) => a.column - b.column);
  for (const placement of ordered) {
    const node = graph.node(placement.name);
    if (!node) continue;
    const parents = mainIn(placement.name)
      .map((e) => origin.get(e.from))
      .filter((o): o is [number, number] => o !== undefined);
    origin.set(placement.name, parents[0] ?? [node.position[0], node.position[1]]);
  }

  for (const placement of ordered) {
    const { name, role, column } = placement;
    const anchor = origin.get(name);
    if (!anchor) continue;

    const x = anchor[0] + column * spacing;
    let y: number;

    if (role === 'branch' && placement.branchOf) {
      // An arm hangs off its own decision node, not off a global trunk.
      const decision = target.get(placement.branchOf.decision);
      const base = decision ? decision[1] : anchor[1];
      const outputs = armsOf.get(placement.branchOf.decision) ?? [placement.branchOf.output];
      const index = outputs.indexOf(placement.branchOf.output);
      y = base + Math.round((index - (outputs.length - 1) / 2) * branchOffset * 2);
    } else {
      const parentRows = mainIn(name)
        .map((e) => target.get(e.from)?.[1])
        .filter((row): row is number => row !== undefined);
      if (parentRows.length === 0) {
        y = anchor[1];
      } else if (parentRows.length === 1) {
        // A chain keeps its row, so the rest of an arm stays on that arm.
        y = parentRows[0]!;
      } else {
        // Where paths come back together — a Merge, typically — the node sits
        // centred between them, which is the originating decision's row when
        // the arms are symmetric.
        y = Math.round(parentRows.reduce((a, b) => a + b, 0) / parentRows.length);
      }
    }

    target.set(name, [x, y]);
  }

  // Sub-nodes hang off their consumer's final position, so they are placed
  // after everything else. Several sharing a consumer spread along x, ordered
  // by where they already sit so the result is stable.
  const subnodesOf = new Map<string, string[]>();
  for (const placement of placements.values()) {
    if (placement.role !== 'subnode' || !placement.consumerOf) continue;
    subnodesOf.set(placement.consumerOf, [
      ...(subnodesOf.get(placement.consumerOf) ?? []),
      placement.name,
    ]);
  }

  for (const [consumer, subnodes] of subnodesOf) {
    const consumerAt = target.get(consumer) ?? graph.node(consumer)?.position;
    if (!consumerAt) continue;
    const bySpot = [...subnodes].sort(
      (a, b) => (graph.node(a)?.position[0] ?? 0) - (graph.node(b)?.position[0] ?? 0),
    );
    bySpot.forEach((name, index) => {
      target.set(name, [consumerAt[0] + index * spacing, consumerAt[1] + clawOffset]);
    });
  }

  // Emit in document order, and only where something actually moves.
  const moves: Move[] = [];
  for (const node of graph.nodes) {
    const position = target.get(node.name);
    if (!position) continue;
    const dx = node.position[0] !== position[0];
    const dy = node.position[1] !== position[1];
    if (!dx && !dy) continue;
    moves.push({
      name: node.name,
      position,
      reasons: reasonsFor(placements.get(node.name)?.role, dx, dy),
    });
  }
  return moves;
}

/**
 * Resize each sticky to encompass the nodes it already contains, measured at
 * their *final* positions so the sticky still wraps them after formatting.
 *
 * Membership is decided once, from the sticky's original bounds. If the
 * resized sticky would then swallow a node that was not a member, the sticky
 * is left alone: growing it would change membership on the next run and break
 * idempotency, and guessing is worse than leaving the author's geometry.
 */
export function stickyRects(
  graph: LintGraph,
  finalPosition: (name: string) => [number, number],
  options: FormatOptions,
): StickyRect[] {
  const rects: StickyRect[] = [];

  for (const sticky of graph.stickies) {
    const members = graph.nodesInside(sticky);
    if (members.length === 0) continue;

    const points = members.map((m) => finalPosition(m.name));
    const minX = Math.min(...points.map((p) => p[0]));
    const maxX = Math.max(...points.map((p) => p[0]));
    const minY = Math.min(...points.map((p) => p[1]));
    const maxY = Math.max(...points.map((p) => p[1]));

    const rect = {
      x: minX - STICKY_LEFT_MARGIN,
      y: minY - options.stickyPadding.top,
      width: maxX - minX + STICKY_WIDTH_MARGIN,
      height: maxY - minY + options.stickyPadding.top + options.stickyPadding.bottom,
    };

    const memberNames = new Set(members.map((m) => m.name));
    const wouldSwallow = graph.nodes.some((node) => {
      if (memberNames.has(node.name)) return false;
      const [x, y] = finalPosition(node.name);
      return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
    });
    if (wouldSwallow) continue;

    const current = graph.bounds(sticky);
    if (
      current.x === rect.x &&
      current.y === rect.y &&
      current.width === rect.width &&
      current.height === rect.height
    ) {
      continue;
    }
    rects.push({ name: sticky.name, rect });
  }

  return rects;
}
