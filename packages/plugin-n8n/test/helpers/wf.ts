import type { WorkflowJson } from 'workflow-lint-core';

export interface TestNode {
  name: string;
  type: string;
  typeVersion?: number;
  parameters?: Record<string, unknown>;
  position?: [number, number];
  disabled?: boolean;
  notes?: string;
}

/** `[from, to]`, `[from, to, fromOutput, toInput]`, or with a connection type. */
export type TestEdge = [string, string, number?, number?, string?];

export function wf(
  nodes: TestNode[],
  edges: TestEdge[] = [],
  settings: Record<string, unknown> = {},
): WorkflowJson {
  const connections: Record<string, Record<string, Array<Array<{ node: string; type: string; index: number }>>>> = {};
  for (const [from, to, out = 0, inp = 0, type = 'main'] of edges) {
    connections[from] ??= {};
    const byType = (connections[from]![type] ??= []);
    while (byType.length <= out) byType.push([]);
    byType[out]!.push({ node: to, type, index: inp });
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

export const trigger: TestNode = {
  name: 'When clicking Test',
  type: 'n8n-nodes-base.manualTrigger',
  typeVersion: 1,
};

export const httpOk: TestNode = {
  name: 'GET Users - Fetch active',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  parameters: { url: 'https://api.acme.test/users', options: {} },
};
