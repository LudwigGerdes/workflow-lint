import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { Finding, LintResult } from './types.js';

export const BASELINE_FILE = '.workflow-lint-baseline.yaml';

/** Recorded counts of accepted findings, so only new ones fail a run. */
export interface Baseline {
  version: 1;
  entries: Record<string, number>;
}

export const baselineKey = (workflowKey: string, finding: Finding): string =>
  `${workflowKey}::${finding.nodeName ?? '*'}::${finding.ruleId}`;

export function generateBaseline(
  results: LintResult[],
  keyOf: (result: LintResult) => string,
): Baseline {
  const entries: Record<string, number> = {};
  for (const result of results) {
    for (const finding of result.findings) {
      const key = baselineKey(keyOf(result), finding);
      entries[key] = (entries[key] ?? 0) + 1;
    }
  }
  return { version: 1, entries };
}

/** Drop up to the recorded count of each baselined finding; the rest survive. */
export function applyBaseline(result: LintResult, baseline: Baseline, key: string): LintResult {
  const remaining: Record<string, number> = { ...baseline.entries };
  const findings = result.findings.filter((finding) => {
    const k = baselineKey(key, finding);
    const left = remaining[k] ?? 0;
    if (left > 0) {
      remaining[k] = left - 1;
      return false;
    }
    return true;
  });
  return { ...result, findings };
}

export const serializeBaseline = (baseline: Baseline): string => stringifyYaml(baseline);
export const parseBaseline = (text: string): Baseline => parseYaml(text) as Baseline;
