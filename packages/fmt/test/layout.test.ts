import { describe, it, expect, beforeAll } from 'vitest';
import type { LintGraph } from 'workflow-lint-core';
import { bundledVersions, loadPack, type NodeTypePack } from 'workflow-lint-node-types';
import { classify } from '../src/classify.js';
import { positionsFor } from '../src/layout.js';
import { DEFAULT_OPTIONS } from '../src/options.js';
import { edge, graphOf as build, n } from './helpers.js';

let pack: NodeTypePack;
beforeAll(async () => {
  pack = await loadPack(bundledVersions().at(-1)!);
});

const graphOf = (nodes: object[], connections: object): LintGraph => build(pack, nodes, connections);
const place = (g: LintGraph) => positionsFor(g, classify(g), DEFAULT_OPTIONS);
const byName = (g: LintGraph) => new Map(place(g).map((m) => [m.name, m.position]));

describe('positionsFor', () => {
  it('spaces a chain from its entry node', () => {
    const g = graphOf(
      [
        n('Trigger', 'n8n-nodes-base.manualTrigger', 1, [0, 192]),
        n('A', 'n8n-nodes-base.set', 3.4),
        n('B', 'n8n-nodes-base.set', 3.4),
      ],
      { Trigger: { main: [[edge('A')]] }, A: { main: [[edge('B')]] } },
    );
    // The entry node keeps its position; the rest follow from it.
    // Both start at the origin, so both the horizontal gap and the row are off.
    expect(place(g)).toEqual([
      { name: 'A', position: [192, 192], reasons: ['spacing', 'alignment'] },
      { name: 'B', position: [384, 192], reasons: ['spacing', 'alignment'] },
    ]);
  });

  it('offsets IF arms symmetrically and centres the Merge between them', () => {
    const g = graphOf(
      [
        n('Trigger', 'n8n-nodes-base.manualTrigger', 1, [0, 192]),
        n('Is Valid?', 'n8n-nodes-base.if', 2.2),
        n('Yes', 'n8n-nodes-base.set', 3.4),
        n('No', 'n8n-nodes-base.set', 3.4),
        n('Combine', 'n8n-nodes-base.merge', 3.2),
      ],
      {
        Trigger: { main: [[edge('Is Valid?')]] },
        'Is Valid?': { main: [[edge('Yes')], [edge('No')]] },
        Yes: { main: [[edge('Combine', 0)]] },
        No: { main: [[edge('Combine', 1)]] },
      },
    );
    const at = byName(g);
    expect(at.get('Yes')).toEqual([384, 96]);
    expect(at.get('No')).toEqual([384, 288]);
    expect(at.get('Combine')).toEqual([576, 192]);
  });

  it('keeps a mid-workflow Merge centred too', () => {
    const g = graphOf(
      [
        n('Trigger', 'n8n-nodes-base.manualTrigger', 1, [0, 192]),
        n('Is Valid?', 'n8n-nodes-base.if', 2.2),
        n('Yes', 'n8n-nodes-base.set', 3.4),
        n('No', 'n8n-nodes-base.set', 3.4),
        n('Combine', 'n8n-nodes-base.merge', 3.2),
        n('After', 'n8n-nodes-base.noOp'),
      ],
      {
        Trigger: { main: [[edge('Is Valid?')]] },
        'Is Valid?': { main: [[edge('Yes')], [edge('No')]] },
        Yes: { main: [[edge('Combine', 0)]] },
        No: { main: [[edge('Combine', 1)]] },
        Combine: { main: [[edge('After')]] },
      },
    );
    expect(byName(g).get('Combine')).toEqual([576, 192]);
  });

  it('spreads three Switch arms symmetrically about the trunk', () => {
    const g = graphOf(
      [
        n('Trigger', 'n8n-nodes-base.manualTrigger', 1, [0, 192]),
        n('Route', 'n8n-nodes-base.switch', 3.3),
        n('Free', 'n8n-nodes-base.set', 3.4),
        n('Pro', 'n8n-nodes-base.set', 3.4),
        n('Team', 'n8n-nodes-base.set', 3.4),
      ],
      {
        Trigger: { main: [[edge('Route')]] },
        Route: { main: [[edge('Free')], [edge('Pro')], [edge('Team')]] },
      },
    );
    const at = byName(g);
    expect(at.get('Free')).toEqual([384, 0]);
    expect(at.get('Pro')).toEqual([384, 192]);
    expect(at.get('Team')).toEqual([384, 384]);
  });

  it('hangs a sub-node below its consumer', () => {
    const g = graphOf(
      [
        n('Trigger', 'n8n-nodes-base.manualTrigger', 1, [0, 192]),
        n('Agent', '@n8n/n8n-nodes-langchain.agent', 3),
        n('Model', '@n8n/n8n-nodes-langchain.lmChatOpenAi'),
      ],
      {
        Trigger: { main: [[edge('Agent')]] },
        Model: { ai_languageModel: [[{ node: 'Agent', type: 'ai_languageModel', index: 0 }]] },
      },
    );
    expect(byName(g).get('Model')).toEqual([192, 368]);
  });

  it('spaces several sub-nodes of one consumer along x', () => {
    const g = graphOf(
      [
        n('Trigger', 'n8n-nodes-base.manualTrigger', 1, [0, 192]),
        n('Agent', '@n8n/n8n-nodes-langchain.agent', 3),
        n('Model', '@n8n/n8n-nodes-langchain.lmChatOpenAi', 1, [500, 0]),
        n('Memory', '@n8n/n8n-nodes-langchain.memoryBufferWindow', 1, [100, 0]),
      ],
      {
        Trigger: { main: [[edge('Agent')]] },
        Model: { ai_languageModel: [[{ node: 'Agent', type: 'ai_languageModel', index: 0 }]] },
        Memory: { ai_memory: [[{ node: 'Agent', type: 'ai_memory', index: 0 }]] },
      },
    );
    const at = byName(g);
    // ordered by current x, so Memory (100) takes the first slot
    expect(at.get('Memory')).toEqual([192, 368]);
    expect(at.get('Model')).toEqual([384, 368]);
  });

  it('emits no move for nodes already in place', () => {
    const g = graphOf(
      [
        n('Trigger', 'n8n-nodes-base.manualTrigger', 1, [0, 192]),
        n('A', 'n8n-nodes-base.set', 3.4, [192, 192]),
      ],
      { Trigger: { main: [[edge('A')]] } },
    );
    expect(place(g)).toEqual([]);
  });

  it('leaves unrecognised nodes untouched', () => {
    const g = graphOf(
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
    expect(place(g)).toEqual([]);
  });
});
