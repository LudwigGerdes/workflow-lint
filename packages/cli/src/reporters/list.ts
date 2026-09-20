import type { Finding, LintResult, ReportedSeverity } from 'workflow-lint-core';

const RANK: Record<ReportedSeverity, number> = { info: 1, warn: 2, error: 3 };

export interface ListDifferentOptions {
  /** Findings below this level do not make a file "different". */
  failOn?: ReportedSeverity;
  /**
   * Overrides `failOn` entirely when given. `-l` must list exactly the files
   * behind a non-zero exit, so it has to share the caller's notion of what
   * blocks — including the stylistic rules that never fail a run.
   */
  blocks?: (finding: Finding) => boolean;
}

/**
 * Bare paths, one per line — prettier's `--list-different`, for CI and for
 * piping into another command.
 *
 * A file is listed when it holds a finding that fails the run, so the list is
 * exactly the set responsible for a non-zero exit: `--quiet` and the baseline
 * have already been applied to `results` by the time this sees them, and
 * `failOn` filters the rest. A file that would not parse is listed too — it
 * cannot be linted at all, which is the loudest reason to look at it.
 *
 * Nothing else may reach stdout in this mode, or the stream stops being
 * pipeable.
 */
export function listDifferent(
  results: LintResult[],
  options: ListDifferentOptions = {},
): string {
  const threshold = RANK[options.failOn ?? 'warn'];
  const blocks = options.blocks ?? ((f: Finding) => RANK[f.severity] >= threshold);
  const paths = results
    .filter((r) => r.parseErrors.length > 0 || r.findings.some(blocks))
    .map((r) => r.path);
  return paths.length > 0 ? `${paths.join('\n')}\n` : '';
}
