import type { RuleContext } from 'workflow-lint-core';

/** Every node reachable from `start` following main connections. */
export function reachableMain(ctx: RuleContext, start: string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const edge of ctx.graph.outgoing(current)) {
      if (edge.type === 'main') queue.push(edge.to);
    }
  }
  return seen;
}

/**
 * The body of a SplitInBatches loop: what its "loop" output (index 1) reaches
 * that can reach the loop node again.
 */
export function loopBody(ctx: RuleContext, loop: string): string[] {
  const entry = ctx.graph
    .outgoing(loop)
    .filter((e) => e.type === 'main' && e.output === 1)
    .map((e) => e.to);
  return [...reachableMain(ctx, entry)].filter(
    (name) => name !== loop && reachableMain(ctx, [name]).has(loop),
  );
}
