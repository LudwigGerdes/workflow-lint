import { describe, it, expect, beforeAll } from 'vitest';
import { parseWorkflow, type LintWorkflow } from 'workflow-lint-core';
import { bundledVersions, loadPack, type NodeTypePack } from 'workflow-lint-node-types';
import { format } from '../src/format.js';
import { edge, n } from './helpers.js';

let pack: NodeTypePack;
beforeAll(async () => {
  pack = await loadPack(bundledVersions().at(-1)!);
});

const workflowOf = (nodes: object[], connections: object): LintWorkflow => {
  const { workflow, errors } = parseWorkflow(
    JSON.stringify({ nodes, connections, settings: {} }, null, 2),
    'w.json',
  );
  expect(errors).toEqual([]);
  return workflow!;
};

const chain = () =>
  workflowOf(
    [
      n('Trigger', 'n8n-nodes-base.manualTrigger', 1, [0, 192]),
      n('A', 'n8n-nodes-base.set', 3.4),
      n('B', 'n8n-nodes-base.set', 3.4),
    ],
    { Trigger: { main: [[edge('A')]] }, A: { main: [[edge('B')]] } },
  );

const loop = () =>
  workflowOf(
    [
      n('Trigger', 'n8n-nodes-base.manualTrigger', 1, [0, 192]),
      n('Loop', 'n8n-nodes-base.splitInBatches', 3, [777, 333]),
      n('Body', 'n8n-nodes-base.set', 3.4, [888, 444]),
    ],
    {
      Trigger: { main: [[edge('Loop')]] },
      Loop: { main: [[], [edge('Body')]] },
      Body: { main: [[edge('Loop')]] },
    },
  );

describe('format', () => {
  it('does not mutate its input', () => {
    const workflow = chain();
    const before = structuredClone(workflow.json);
    format(workflow, pack);
    expect(workflow.json).toEqual(before);
  });

  it('lays the chain out on the grid', () => {
    const { json, changed } = format(chain(), pack);
    expect(changed).toBe(true);
    expect(json.nodes.map((x) => x.position)).toEqual([
      [0, 192],
      [192, 192],
      [384, 192],
    ]);
  });

  it('is idempotent', () => {
    const workflow = chain();
    const once = format(workflow, pack);
    const twice = format({ ...workflow, json: once.json }, pack);
    expect(twice.json).toEqual(once.json);
    expect(twice.changed).toBe(false);
    expect(twice.moves).toEqual([]);
  });

  it('leaves unrecognised nodes exactly where they were', () => {
    const { json } = format(loop(), pack);
    const at = new Map(json.nodes.map((x) => [x.name, x.position]));
    expect(at.get('Loop')).toEqual([777, 333]);
    expect(at.get('Body')).toEqual([888, 444]);
  });

  it('honours option overrides', () => {
    const { json } = format(chain(), pack, { spacing: 240 });
    expect(json.nodes.map((x) => x.position)).toEqual([
      [0, 192],
      [240, 192],
      [480, 192],
    ]);
  });
});

const sticky = (name: string, position: [number, number], width: number, height: number) => ({
  name,
  type: 'n8n-nodes-base.stickyNote',
  typeVersion: 1,
  position,
  parameters: { content: '## Stage', width, height },
});

describe('sticky geometry', () => {
  // A sticky loosely covering the two chain nodes at their pre-format spots.
  const withSticky = () =>
    workflowOf(
      [
        sticky('Stage', [-100, 0], 900, 600),
        n('Trigger', 'n8n-nodes-base.manualTrigger', 1, [0, 192]),
        n('A', 'n8n-nodes-base.set', 3.4),
      ],
      { Trigger: { main: [[edge('A')]] } },
    );

  it('is left alone by default', () => {
    const { json, stickies } = format(withSticky(), pack);
    expect(stickies).toEqual([]);
    const note = json.nodes.find((x) => x.name === 'Stage')!;
    expect(note.position).toEqual([-100, 0]);
    expect(note.parameters).toMatchObject({ width: 900, height: 600 });
  });

  it('wraps the enclosed nodes at their final positions when enabled', () => {
    const { json, stickies } = format(withSticky(), pack, { stickies: true });
    expect(stickies).toHaveLength(1);
    const note = json.nodes.find((x) => x.name === 'Stage')!;
    // nodes end at [0,192] and [192,192]
    expect(note.position).toEqual([-48, 80]);
    expect(note.parameters).toMatchObject({ width: 480, height: 172 });
  });

  it('stays idempotent with stickies enabled', () => {
    const workflow = withSticky();
    const once = format(workflow, pack, { stickies: true });
    const twice = format({ ...workflow, json: once.json }, pack, { stickies: true });
    expect(twice.json).toEqual(once.json);
    expect(twice.changed).toBe(false);
  });

  it('leaves a sticky that encloses nothing', () => {
    const workflow = workflowOf(
      [sticky('Empty', [5000, 5000], 200, 100), n('Trigger', 'n8n-nodes-base.manualTrigger', 1, [0, 192])],
      {},
    );
    expect(format(workflow, pack, { stickies: true }).stickies).toEqual([]);
  });

  it('leaves a sticky whose new bounds would swallow a neighbour', () => {
    // B sits one column past A, inside the width margin the resize would add.
    const workflow = workflowOf(
      [
        sticky('Stage', [-100, 100], 400, 200),
        n('Trigger', 'n8n-nodes-base.manualTrigger', 1, [0, 192]),
        n('A', 'n8n-nodes-base.set', 3.4),
        n('B', 'n8n-nodes-base.set', 3.4),
      ],
      { Trigger: { main: [[edge('A')]] }, A: { main: [[edge('B')]] } },
    );
    expect(format(workflow, pack, { stickies: true }).stickies).toEqual([]);
  });
});
