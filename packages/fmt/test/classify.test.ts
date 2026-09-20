import { describe, it, expect, beforeAll } from 'vitest';
import type { LintGraph } from 'workflow-lint-core';
import { bundledVersions, loadPack, type NodeTypePack } from 'workflow-lint-node-types';
import { classify } from '../src/classify.js';
import { edge, graphOf as build, n } from './helpers.js';

let pack: NodeTypePack;
beforeAll(async () => {
  pack = await loadPack(bundledVersions().at(-1)!);
});

const graphOf = (nodes: object[], connections: object): LintGraph => build(pack, nodes, connections);

const linear = () =>
  graphOf(
    [
      n('Trigger', 'n8n-nodes-base.manualTrigger'),
      n('A', 'n8n-nodes-base.set', 3.4),
      n('B', 'n8n-nodes-base.set', 3.4),
    ],
    { Trigger: { main: [[edge('A')]] }, A: { main: [[edge('B')]] } },
  );

const branching = () =>
  graphOf(
    [
      n('Trigger', 'n8n-nodes-base.manualTrigger'),
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

describe('classify', () => {
  it('numbers a linear chain by column', () => {
    const p = classify(linear());
    expect(p.get('Trigger')).toMatchObject({ role: 'trunk', column: 0 });
    expect(p.get('A')).toMatchObject({ role: 'trunk', column: 1 });
    expect(p.get('B')).toMatchObject({ role: 'trunk', column: 2 });
  });

  it('marks IF arms as branches and the Merge past both', () => {
    const p = classify(branching());
    expect(p.get('Yes')).toMatchObject({
      role: 'branch',
      column: 2,
      branchOf: { decision: 'Is Valid?', output: 0 },
    });
    expect(p.get('No')).toMatchObject({
      role: 'branch',
      column: 2,
      branchOf: { decision: 'Is Valid?', output: 1 },
    });
    expect(p.get('Combine')).toMatchObject({ role: 'merge', column: 3 });
  });

  it('recognises a sub-node by its ai_ edge', () => {
    const p = classify(
      graphOf(
        [
          n('Trigger', 'n8n-nodes-base.manualTrigger'),
          n('Agent', '@n8n/n8n-nodes-langchain.agent', 3),
          n('Model', '@n8n/n8n-nodes-langchain.lmChatOpenAi'),
        ],
        {
          Trigger: { main: [[edge('Agent')]] },
          Model: { ai_languageModel: [[{ node: 'Agent', type: 'ai_languageModel', index: 0 }]] },
        },
      ),
    );
    expect(p.get('Model')).toMatchObject({ role: 'subnode', consumerOf: 'Agent' });
    expect(p.get('Agent')).toMatchObject({ role: 'trunk', column: 1 });
  });

  it('leaves nodes in a cycle unrecognised', () => {
    const p = classify(
      graphOf(
        [
          n('Trigger', 'n8n-nodes-base.manualTrigger'),
          n('Loop', 'n8n-nodes-base.splitInBatches', 3),
          n('Body', 'n8n-nodes-base.set', 3.4),
        ],
        {
          Trigger: { main: [[edge('Loop')]] },
          Loop: { main: [[], [edge('Body')]] },
          Body: { main: [[edge('Loop')]] },
        },
      ),
    );
    expect(p.get('Loop')?.role).toBe('unrecognised');
    expect(p.get('Body')?.role).toBe('unrecognised');
  });

  it('gives a node reached by two paths the largest column', () => {
    // Asymmetric diamond: the long arm has an extra node, so the Merge must
    // sit past it. A decision node is the fan-out point, since a plain fan-out
    // is deliberately left unrecognised.
    const p = classify(
      graphOf(
        [
          n('Trigger', 'n8n-nodes-base.manualTrigger'),
          n('Is Valid?', 'n8n-nodes-base.if', 2.2),
          n('Yes', 'n8n-nodes-base.set', 3.4),
          n('Mid', 'n8n-nodes-base.set', 3.4),
          n('No', 'n8n-nodes-base.set', 3.4),
          n('Combine', 'n8n-nodes-base.merge', 3.2),
        ],
        {
          Trigger: { main: [[edge('Is Valid?')]] },
          'Is Valid?': { main: [[edge('Yes')], [edge('No')]] },
          Yes: { main: [[edge('Mid')]] },
          Mid: { main: [[edge('Combine', 0)]] },
          No: { main: [[edge('Combine', 1)]] },
        },
      ),
    );
    expect(p.get('Mid')).toMatchObject({ column: 3 });
    expect(p.get('Combine')).toMatchObject({ role: 'merge', column: 4 });
  });

  it('leaves a plain fan-out and everything below it alone', () => {
    // A non-decision node feeding two children stacks them by a convention
    // the formatter does not model, so the subtree is left untouched.
    const p = classify(
      graphOf(
        [
          n('Trigger', 'n8n-nodes-base.manualTrigger'),
          n('Fan', 'n8n-nodes-base.noOp'),
          n('Left', 'n8n-nodes-base.set', 3.4),
          n('Right', 'n8n-nodes-base.set', 3.4),
        ],
        {
          Trigger: { main: [[edge('Fan')]] },
          Fan: { main: [[edge('Left'), edge('Right')]] },
        },
      ),
    );
    expect(p.get('Fan')).toMatchObject({ role: 'trunk' });
    expect(p.get('Left')?.role).toBe('unrecognised');
    expect(p.get('Right')?.role).toBe('unrecognised');
  });

  it('classifies everything as unrecognised when there is no entry point', () => {
    // A two-node cycle with no root at all.
    const p = classify(
      graphOf(
        [n('A', 'n8n-nodes-base.set', 3.4), n('B', 'n8n-nodes-base.set', 3.4)],
        { A: { main: [[edge('B')]] }, B: { main: [[edge('A')]] } },
      ),
    );
    expect([...p.values()].every((x) => x.role === 'unrecognised')).toBe(true);
  });

  it('ignores sticky notes entirely', () => {
    const p = classify(
      graphOf(
        [
          n('Trigger', 'n8n-nodes-base.manualTrigger'),
          { ...n('Note', 'n8n-nodes-base.stickyNote'), parameters: { content: '## Hi' } },
        ],
        {},
      ),
    );
    expect(p.has('Note')).toBe(false);
  });
});
