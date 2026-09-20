import { describe, it, expect } from 'vitest';
import { wf, trigger } from './wf.js';

describe('wf helper', () => {
  it('builds a single-node workflow with no connections', () => {
    const w = wf([trigger]);
    expect(w.nodes).toHaveLength(1);
    expect(w.nodes[0]!.name).toBe('When clicking Test');
    expect(w.connections).toEqual({});
  });

  it('fills in typeVersion, parameters and position defaults', () => {
    const w = wf([trigger, { name: 'A', type: 'n8n-nodes-base.set' }]);
    expect(w.nodes[1]).toMatchObject({ typeVersion: 1, parameters: {}, position: [192, 192] });
  });

  it('wires simple and indexed edges', () => {
    const w = wf(
      [trigger, { name: 'A', type: 'n8n-nodes-base.set' }, { name: 'B', type: 'n8n-nodes-base.set' }],
      [['When clicking Test', 'A'], ['A', 'B', 1, 0]],
    );
    expect(w.connections['When clicking Test']).toEqual({
      main: [[{ node: 'A', type: 'main', index: 0 }]],
    });
    expect(w.connections['A']!.main).toEqual([[], [{ node: 'B', type: 'main', index: 0 }]]);
  });

  it('carries settings through', () => {
    expect(wf([trigger], [], { executionOrder: 'v1' }).settings).toEqual({ executionOrder: 'v1' });
  });
});
