import type { LintResult } from 'workflow-lint-core';

export interface DirectiveSummary {
  /** Inline `workflow-lint-disable` directives found. */
  total: number;
  /** Directives that suppressed at least one finding. */
  used: number;
  /** Directives that suppressed nothing: stale, or a typo in the rule id. */
  unused: number;
  /** Findings a directive named but could not suppress, the rule being locked. */
  blocked: number;
  /** Directives not applied, under --no-inline-config. */
  ignored: number;
}

export interface Summary {
  files: number;
  problems: number;
  errors: number;
  warnings: number;
  infos: number;
  fixable: number;
  directives: DirectiveSummary;
}

export function summarise(results: LintResult[]): Summary {
  const summary: Summary = {
    files: results.length,
    problems: 0,
    errors: 0,
    warnings: 0,
    infos: 0,
    fixable: 0,
    directives: { total: 0, used: 0, unused: 0, blocked: 0, ignored: 0 },
  };
  for (const result of results) {
    for (const d of result.directives ?? []) {
      summary.directives.total += 1;
      summary.directives.blocked += d.blocked;
      if (d.ignored) summary.directives.ignored += 1;
      else if (d.suppressed > 0) summary.directives.used += 1;
      else summary.directives.unused += 1;
    }
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
