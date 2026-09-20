import { expect } from 'vitest';
import { LintGraph, parseWorkflow } from 'workflow-lint-core';
import type { NodeTypePack } from 'workflow-lint-node-types';

export const n = (
  name: string,
  type: string,
  typeVersion = 1,
  position: [number, number] = [0, 0],
) => ({ name, type, typeVersion, position, parameters: {} });

export const edge = (to: string, index = 0) => ({ node: to, type: 'main', index });

export const graphOf = (pack: NodeTypePack, nodes: object[], connections: object): LintGraph => {
  const { workflow, errors } = parseWorkflow(
    JSON.stringify({ nodes, connections, settings: {} }),
    'w.json',
  );
  expect(errors).toEqual([]);
  return new LintGraph(workflow!, pack);
};
