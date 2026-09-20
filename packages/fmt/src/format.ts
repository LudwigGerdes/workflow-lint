import { Fixer, LintGraph, applyPatches, type LintWorkflow, type WorkflowJson } from 'workflow-lint-core';
import type { NodeTypePack } from 'workflow-lint-node-types';
import { classify } from './classify.js';
import { positionsFor, stickyRects, type Move, type StickyRect } from './layout.js';
import { resolveOptions, type FormatOptions } from './options.js';

export interface FormatResult {
  /** A new document; the input is never mutated. */
  json: WorkflowJson;
  /** What moved, for --check and layout/formatted. */
  moves: Move[];
  /** Stickies resized, only when the `stickies` option is on. */
  stickies: StickyRect[];
  changed: boolean;
}

/**
 * Lay out a workflow. Deterministic and idempotent: formatting an already
 * formatted document returns it unchanged, with no moves.
 */
export function format(
  workflow: LintWorkflow,
  pack: NodeTypePack,
  options: Partial<FormatOptions> = {},
): FormatResult {
  const resolved = resolveOptions(options);
  const graph = new LintGraph(workflow, pack);
  const moves = positionsFor(graph, classify(graph), resolved);

  const moved = new Map(moves.map((move) => [move.name, move.position]));
  const finalPosition = (name: string): [number, number] =>
    moved.get(name) ?? graph.node(name)?.position ?? [0, 0];
  const stickies = resolved.stickies ? stickyRects(graph, finalPosition, resolved) : [];

  const fixer = new Fixer();
  // Reuse the phase 0 patch machinery, so one code path owns document mutation.
  const json = applyPatches(workflow.json, [
    ...moves.map((move) => fixer.moveNode(move.name, move.position)),
    ...stickies.map((sticky) => fixer.resizeSticky(sticky.name, sticky.rect)),
  ]);

  return { json, moves, stickies, changed: moves.length > 0 || stickies.length > 0 };
}
