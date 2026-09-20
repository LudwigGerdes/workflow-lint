import type { WorkflowJson } from 'workflow-lint-core';

export interface TestNode {
  name: string;
  type: string;
  typeVersion?: number;
  parameters?: Record<string, unknown>;
  position?: [number, number];
  disabled?: boolean;
  notes?: string;
  onError?: string;
  continueOnFail?: boolean;
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
}

/**
 * An edge is `[from, to]`, or `[from, to, fromOutput, toInput]`.
 *
 * Typed with optional tuple members rather than the plan's union of a 2-tuple
 * and a 4-tuple: destructuring that union fails to compile, because the
 * 2-tuple has no element at index 2.
 */
export type TestEdge = [string, string, number?, number?];

export function wf(
  nodes: TestNode[],
  edges: TestEdge[] = [],
  settings: Record<string, unknown> = {},
): WorkflowJson {
  const connections: Record<
    string,
    { main: Array<Array<{ node: string; type: 'main'; index: number }>> }
  > = {};
  for (const [from, to, out = 0, inp = 0] of edges) {
    connections[from] ??= { main: [] };
    const main = connections[from]!.main;
    while (main.length <= out) main.push([]);
    main[out]!.push({ node: to, type: 'main', index: inp });
  }
  return {
    nodes: nodes.map((n, i) => ({
      typeVersion: 1,
      parameters: {},
      position: [i * 192, 192] as [number, number],
      ...n,
    })),
    connections,
    settings,
  } as unknown as WorkflowJson;
}

/** A trigger with a non-default name, so it never trips naming rules. */
export const trigger: TestNode = {
  name: 'When clicking Test',
  type: 'n8n-nodes-base.manualTrigger',
  typeVersion: 1,
};
