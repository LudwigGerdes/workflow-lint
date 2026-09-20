import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadPack, bundledVersions, type NodeTypePack } from 'workflow-lint-node-types';
import { parseWorkflow } from '../src/parse.js';
import { LintGraph } from '../src/graph.js';

const read = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const graphOf = (text: string, pack: NodeTypePack, path = 'x.json') => {
  const { workflow, errors } = parseWorkflow(text, path);
  expect(errors).toEqual([]);
  return new LintGraph(workflow!, pack);
};

let pack: NodeTypePack;
beforeAll(async () => {
  pack = await loadPack(bundledVersions().at(-1)!);
});

describe('LintGraph', () => {
  it('separates stickies from nodes', () => {
    const g = graphOf(read('basic.json'), pack);
    expect(g.nodes).toHaveLength(3);
    expect(g.stickies).toHaveLength(1);
    expect(g.node('Edit Fields')?.type).toBe('n8n-nodes-base.set');
  });

  it('traverses children and parents', () => {
    const g = graphOf(read('basic.json'), pack);
    expect(g.children('HTTP Request')).toEqual(['Edit Fields']);
    expect(g.parents('Edit Fields')).toEqual(['HTTP Request']);
  });

  it('lists outgoing and incoming connections', () => {
    const g = graphOf(read('basic.json'), pack);
    expect(g.outgoing('Manual Trigger')).toEqual([
      { output: 0, type: 'main', to: 'HTTP Request', input: 0 },
    ]);
    expect(g.incoming('Edit Fields')).toEqual([
      { from: 'HTTP Request', output: 0, type: 'main', input: 0 },
    ]);
  });

  it('finds triggers', () => {
    const g = graphOf(read('basic.json'), pack);
    expect(g.triggers().map((n) => n.name)).toEqual(['Manual Trigger']);
  });

  it('detects cycles', () => {
    expect(graphOf(read('basic.json'), pack).cycles()).toEqual([]);
    const cycles = graphOf(read('loop.json'), pack).cycles();
    expect(cycles).toHaveLength(1);
    expect([...cycles[0]!].sort()).toEqual(['Loop Body', 'Loop Over Items']);
  });

  it('computes sticky bounds and contained nodes', () => {
    const g = graphOf(read('basic.json'), pack);
    const sticky = g.stickies[0]!;
    expect(g.bounds(sticky)).toEqual({ x: 0, y: 0, width: 400, height: 200 });
    expect(g.nodesInside(sticky).map((n) => n.name)).toContain('Manual Trigger');
  });

  it('tolerates unknown node types', () => {
    const text = JSON.stringify({
      nodes: [
        { name: 'Weird', type: 'n8n-nodes-base.doesNotExist', typeVersion: 1, position: [0, 0], parameters: {} },
      ],
      connections: {},
    });
    const g = graphOf(text, pack);
    expect(g.describe(g.node('Weird')!)).toBeUndefined();
    expect(g.triggers()).toEqual([]);
  });

  it('does not mutate the parsed workflow with node defaults', () => {
    const { workflow } = parseWorkflow(read('basic.json'), 'basic.json');
    new LintGraph(workflow!, pack);
    const httpNode = workflow!.json.nodes.find((n) => n.name === 'HTTP Request')!;
    expect(Object.keys(httpNode.parameters).sort()).toEqual(['options', 'url']);
  });
});
