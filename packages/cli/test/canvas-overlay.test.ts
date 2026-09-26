import { describe, it, expect } from 'vitest';
import type { Finding, LintResult } from 'workflow-lint-core';
import { canvasOverlay } from '../src/reporters/canvas-overlay.js';

const finding = (over: Partial<Finding> = {}): Finding => ({
  ruleId: 'naming/no-default-node-name',
  severity: 'warn',
  message: 'Node "Edit Fields" still has its default name.',
  path: 'w.json',
  nodeName: 'Edit Fields',
  loc: { line: 30, column: 5 },
  ...over,
});

const results: LintResult[] = [
  {
    path: 'w.json',
    parseErrors: [],
    findings: [
      finding({ ruleId: 'n8n/valid', severity: 'error', message: 'Missing URL.', nodeName: 'Fetch' }),
      finding(),
      finding({ ruleId: 'structure/no-dangling-node', severity: 'info', message: 'Leads nowhere.' }),
    ],
  },
];

describe('S6 canvas-overlay', () => {
  const overlay = () => JSON.parse(canvasOverlay(results)) as {
    version: number;
    nodes: Record<string, { badges?: Array<{ kind: string; text: string }> }>;
    edges: Record<string, unknown>;
  };

  it('emits the envelope workflow-render draws, naming its source', () => {
    const out = overlay();
    expect(out.version).toBe(1);
    expect(out.edges).toEqual({});
    const stamped = JSON.parse(canvasOverlay(results, { version: '1.2.3' })) as { source?: string };
    expect(stamped.source).toBe('workflow-lint 1.2.3');
  });

  it('groups badges by node, one per finding', () => {
    const out = overlay();
    expect(Object.keys(out.nodes).sort()).toEqual(['Edit Fields', 'Fetch']);
    expect(out.nodes['Edit Fields']!.badges).toHaveLength(2);
  });

  it('maps severity to the badge kinds S6 defines', () => {
    const badges = overlay().nodes['Edit Fields']!.badges!;
    expect(badges.map((b) => b.kind).sort()).toEqual(['info', 'warn']);
    expect(overlay().nodes['Fetch']!.badges![0]!.kind).toBe('error');
  });

  it('carries the rule id in the badge text', () => {
    expect(overlay().nodes['Fetch']!.badges![0]!.text).toContain('n8n/valid');
  });

  it('omits findings with no node to attach to', () => {
    const out = JSON.parse(
      canvasOverlay([
        { path: 'w.json', parseErrors: [], findings: [finding({ nodeName: undefined })] },
      ]),
    ) as { nodes: Record<string, unknown> };
    expect(out.nodes).toEqual({});
  });

  it('is valid JSON ending in a newline', () => {
    expect(canvasOverlay(results).endsWith('\n')).toBe(true);
  });
});
