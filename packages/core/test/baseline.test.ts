import { describe, it, expect } from 'vitest';
import {
  BASELINE_FILE,
  applyBaseline,
  generateBaseline,
  parseBaseline,
  serializeBaseline,
} from '../src/baseline.js';
import type { Finding, LintResult } from '../src/types.js';

const finding = (ruleId: string, nodeName?: string): Finding => ({
  ruleId,
  severity: 'warn',
  message: 'm',
  path: 'w.json',
  nodeName,
});

const result = (findings: Finding[]): LintResult => ({
  path: 'w.json',
  findings,
  parseErrors: [],
});

describe('baseline', () => {
  it('names the conventional file', () => expect(BASELINE_FILE).toBe('.workflow-lint-baseline.yaml'));

  it('generates counts keyed by workflow, node and rule', () => {
    const b = generateBaseline([result([finding('naming/x', 'A'), finding('naming/x', 'A')])], () => 'wf');
    expect(b.version).toBe(1);
    expect(b.entries['wf::A::naming/x']).toBe(2);
  });

  it('removes baselined findings but keeps new ones', () => {
    const base = generateBaseline(
      [result([finding('naming/x', 'A'), finding('structure/y', 'B')])],
      () => 'wf',
    );
    const next = result([
      finding('naming/x', 'A'),
      finding('structure/y', 'B'),
      finding('hygiene/z', 'C'),
    ]);
    const filtered = applyBaseline(next, base, 'wf');
    expect(filtered.findings.map((f) => f.ruleId)).toEqual(['hygiene/z']);
  });

  it('only removes up to the recorded count', () => {
    const base = generateBaseline([result([finding('naming/x', 'A')])], () => 'wf');
    const next = result([finding('naming/x', 'A'), finding('naming/x', 'A')]);
    expect(applyBaseline(next, base, 'wf').findings).toHaveLength(1);
  });

  it('keys workflow-level findings under *', () => {
    const b = generateBaseline([result([finding('structure/y')])], () => 'wf');
    expect(b.entries['wf::*::structure/y']).toBe(1);
  });

  it('round-trips through yaml', () => {
    const b = generateBaseline([result([finding('naming/x', 'A')])], () => 'wf');
    expect(parseBaseline(serializeBaseline(b))).toEqual(b);
  });
});
