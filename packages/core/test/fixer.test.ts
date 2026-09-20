import { describe, it, expect } from 'vitest';
import { Fixer, applyPatches } from '../src/fixer.js';
import type { WorkflowJson } from '../src/types.js';

const f = new Fixer();

const wf = (): WorkflowJson =>
  ({
    nodes: [
      {
        name: 'HTTP Request',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [0, 0],
        parameters: { url: 'https://example.com' },
      },
      {
        name: 'Edit Fields',
        type: 'n8n-nodes-base.set',
        typeVersion: 3.4,
        position: [192, 0],
        parameters: { value: "={{ $('HTTP Request').item.json.id }}", keep: 1, drop: 2 },
      },
      {
        name: 'Sticky Note',
        type: 'n8n-nodes-base.stickyNote',
        typeVersion: 1,
        position: [0, -100],
        parameters: { content: '## Hi' },
      },
    ],
    connections: {
      'HTTP Request': { main: [[{ node: 'Edit Fields', type: 'main', index: 0 }]] },
    },
    settings: { executionOrder: 'v1' },
  }) as unknown as WorkflowJson;

const nodeNamed = (j: WorkflowJson, n: string) => j.nodes.find((x) => x.name === n)!;

describe('applyPatches', () => {
  it('setParameter creates intermediate objects', () => {
    const out = applyPatches(wf(), [f.setParameter('HTTP Request', 'options.retry.maxTries', 3)]);
    expect(nodeNamed(out, 'HTTP Request').parameters).toMatchObject({
      url: 'https://example.com',
      options: { retry: { maxTries: 3 } },
    });
  });

  it('setParameter writes through array indexes', () => {
    const out = applyPatches(wf(), [f.setParameter('Edit Fields', 'a.b[0].c', 7)]);
    expect(nodeNamed(out, 'Edit Fields').parameters['a']).toEqual({ b: [{ c: 7 }] });
  });

  it('deleteParameter removes only the target', () => {
    const out = applyPatches(wf(), [f.deleteParameter('Edit Fields', 'drop')]);
    const p = nodeNamed(out, 'Edit Fields').parameters;
    expect(p['drop']).toBeUndefined();
    expect(p['keep']).toBe(1);
  });

  it('renameNode rewrites name, both connection sides and expressions', () => {
    const out = applyPatches(wf(), [f.renameNode('HTTP Request', 'GET Users')]);
    expect(nodeNamed(out, 'GET Users')).toBeDefined();
    expect(out.connections['HTTP Request']).toBeUndefined();
    expect(out.connections['GET Users']).toBeDefined();
    expect(nodeNamed(out, 'Edit Fields').parameters['value']).toBe(
      "={{ $('GET Users').item.json.id }}",
    );
  });

  it('renameNode rewrites $node[] and $items() references', () => {
    const base = wf();
    nodeNamed(base, 'Edit Fields').parameters['other'] =
      '={{ $node["HTTP Request"].json.a + $items("HTTP Request", 0).length }}';
    const out = applyPatches(base, [f.renameNode('HTTP Request', 'GET Users')]);
    expect(nodeNamed(out, 'Edit Fields').parameters['other']).toBe(
      '={{ $node["GET Users"].json.a + $items("GET Users", 0).length }}',
    );
  });

  it('renameNode retargets incoming connections', () => {
    const out = applyPatches(wf(), [f.renameNode('Edit Fields', 'Shape Payload')]);
    expect(out.connections['HTTP Request']!['main']![0]![0]!.node).toBe('Shape Payload');
  });

  it('addConnection creates missing arrays and appends', () => {
    const out = applyPatches(wf(), [f.addConnection('Edit Fields', 1, 'HTTP Request', 0)]);
    const main = out.connections['Edit Fields']!['main']!;
    expect(main[0]).toEqual([]);
    expect(main[1]).toEqual([{ node: 'HTTP Request', type: 'main', index: 0 }]);
  });

  it('removeConnection deletes and prunes emptied structures', () => {
    const out = applyPatches(wf(), [f.removeConnection('HTTP Request', 0, 'Edit Fields', 0)]);
    expect(out.connections['HTTP Request']).toBeUndefined();
  });

  it('moveNode and resizeSticky set geometry', () => {
    const out = applyPatches(wf(), [
      f.moveNode('Edit Fields', [384, 192]),
      f.resizeSticky('Sticky Note', { x: 10, y: 20, width: 400, height: 200 }),
    ]);
    expect(nodeNamed(out, 'Edit Fields').position).toEqual([384, 192]);
    const sticky = nodeNamed(out, 'Sticky Note');
    expect(sticky.position).toEqual([10, 20]);
    expect(sticky.parameters).toMatchObject({ width: 400, height: 200 });
  });

  it('setSetting writes into settings', () => {
    const out = applyPatches(wf(), [f.setSetting('errorWorkflow', 'wf-1')]);
    expect(out.settings).toMatchObject({ executionOrder: 'v1', errorWorkflow: 'wf-1' });
  });

  it('does not mutate its input', () => {
    const input = wf();
    const snapshot = structuredClone(input);
    applyPatches(input, [
      f.setParameter('HTTP Request', 'options.x', 1),
      f.renameNode('HTTP Request', 'GET Users'),
    ]);
    expect(input).toEqual(snapshot);
  });
});

describe('setNodeField', () => {
  it('writes node-level fields, not parameters', () => {
    const out = applyPatches(wf(), [
      f.setNodeField('HTTP Request', 'typeVersion', 4.4),
      f.setNodeField('HTTP Request', 'retryOnFail', true),
    ]);
    const node = nodeNamed(out, 'HTTP Request');
    expect(node.typeVersion).toBe(4.4);
    expect((node as unknown as { retryOnFail?: boolean }).retryOnFail).toBe(true);
    expect(node.parameters['typeVersion']).toBeUndefined();
  });
});
