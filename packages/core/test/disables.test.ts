import { describe, it, expect, beforeAll } from 'vitest';
import { loadPack, bundledVersions, type NodeTypePack } from 'workflow-lint-node-types';
import type { INode } from 'n8n-workflow';
import { parseWorkflow } from '../src/parse.js';
import { LintGraph } from '../src/graph.js';
import { collectDisables, isDisabled } from '../src/disables.js';
import { lint } from '../src/runner.js';
import type { Finding, ResolvedConfig, Rule } from '../src/types.js';

let pack: NodeTypePack;
beforeAll(async () => {
  pack = await loadPack(bundledVersions().at(-1)!);
});

const node = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  type: 'n8n-nodes-base.set',
  typeVersion: 3.4,
  position: [0, 0],
  parameters: {},
  ...over,
});

const build = (nodes: unknown[]) => {
  const text = JSON.stringify({ nodes, connections: {} });
  const { workflow, errors } = parseWorkflow(text, 'w.json');
  expect(errors).toEqual([]);
  return { graph: new LintGraph(workflow!, pack), text };
};

const finding = (ruleId: string, nodeName?: string): Finding => ({
  ruleId,
  severity: 'warn',
  message: 'm',
  path: 'w.json',
  nodeName,
});

describe('collectDisables', () => {
  it('disables one rule on one node, with a reason', () => {
    const { graph } = build([
      node('A', { notes: 'workflow-lint-disable naming/no-default-node-name -- legacy' }),
      node('B'),
    ]);
    const d = collectDisables(graph);
    expect(isDisabled(finding('naming/no-default-node-name', 'A'), d)).toBe(true);
    expect(isDisabled(finding('naming/other', 'A'), d)).toBe(false);
    expect(isDisabled(finding('naming/no-default-node-name', 'B'), d)).toBe(false);
  });

  it('disables a whole department by name', () => {
    const { graph } = build([node('A', { notes: 'workflow-lint-disable naming' })]);
    const d = collectDisables(graph);
    expect(isDisabled(finding('naming/anything', 'A'), d)).toBe(true);
    expect(isDisabled(finding('structure/x', 'A'), d)).toBe(false);
  });

  it('accepts a comma-separated list', () => {
    const { graph } = build([node('A', { notes: 'workflow-lint-disable naming/x, structure/y' })]);
    const d = collectDisables(graph);
    expect(isDisabled(finding('naming/x', 'A'), d)).toBe(true);
    expect(isDisabled(finding('structure/y', 'A'), d)).toBe(true);
    expect(isDisabled(finding('hygiene/z', 'A'), d)).toBe(false);
  });

  it('disable-file with * suppresses everything, including workflow findings', () => {
    const { graph } = build([node('A', { notes: 'workflow-lint-disable-file *' }), node('B')]);
    const d = collectDisables(graph);
    expect(isDisabled(finding('naming/x', 'B'), d)).toBe(true);
    expect(isDisabled(finding('structure/y'), d)).toBe(true);
  });

  it('a sticky directive covers only the nodes inside its bounds', () => {
    const { graph } = build([
      {
        name: 'Sticky Note',
        type: 'n8n-nodes-base.stickyNote',
        typeVersion: 1,
        position: [0, 0],
        parameters: { content: '## Legacy area\nworkflow-lint-disable naming', width: 300, height: 300 },
      },
      node('Inside', { position: [100, 100] }),
      node('Outside', { position: [900, 900] }),
    ]);
    const d = collectDisables(graph);
    expect(isDisabled(finding('naming/x', 'Inside'), d)).toBe(true);
    expect(isDisabled(finding('naming/x', 'Outside'), d)).toBe(false);
  });

  it('ignores notes that are not directives', () => {
    const { graph } = build([node('A', { notes: 'just a normal note about naming' })]);
    const d = collectDisables(graph);
    expect(isDisabled(finding('naming/x', 'A'), d)).toBe(false);
  });
});

describe('runner honours disables', () => {
  const rule: Rule = {
    meta: {
      id: 'naming/always',
      type: 'suggestion',
      fixable: null,
      docs: { description: 'always', recommended: 'warn' },
      messages: { m: 'reported' },
    },
    create: (ctx) => ({
      Node: (t) => ctx.report({ node: t as INode, messageId: 'm' }),
    }),
  };
  const config: ResolvedConfig = {
    settings: { n8nVersion: '2.38.3' },
    rules: new Map([[rule.meta.id, { rule, severity: 'warn', options: {} }]]),
  };

  it('suppresses a disabled finding end to end', async () => {
    const text = JSON.stringify({
      nodes: [node('A', { notes: 'workflow-lint-disable naming/always' }), node('B')],
      connections: {},
    });
    const res = await lint({ text, path: 'w.json' }, config);
    expect(res.findings.map((f) => f.nodeName)).toEqual(['B']);
  });
});
