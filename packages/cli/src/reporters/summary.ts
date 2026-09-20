import type { LintResult } from 'workflow-lint-core';

export interface Summary {
  files: number;
  problems: number;
  errors: number;
  warnings: number;
  infos: number;
  fixable: number;
}

export function summarise(results: LintResult[]): Summary {
  const summary: Summary = {
    files: results.length,
    problems: 0,
    errors: 0,
    warnings: 0,
    infos: 0,
    fixable: 0,
  };
  for (const result of results) {
    // A file that will not parse counts as an error in its own right.
    summary.errors += result.parseErrors.length;
    summary.problems += result.parseErrors.length;
    for (const finding of result.findings) {
      summary.problems += 1;
      if (finding.severity === 'error') summary.errors += 1;
      else if (finding.severity === 'warn') summary.warnings += 1;
      else summary.infos += 1;
      if (finding.fix) summary.fixable += 1;
    }
  }
  return summary;
}
