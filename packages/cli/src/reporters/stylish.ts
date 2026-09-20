import pc from 'picocolors';
import type { LintResult, ReportedSeverity } from 'workflow-lint-core';
import { summarise } from './summary.js';

const COLOUR: Record<ReportedSeverity, (s: string) => string> = {
  error: pc.red,
  warn: pc.yellow,
  info: pc.blue,
};

interface Row {
  position: string;
  severity: string;
  colour: (s: string) => string;
  ruleId: string;
  message: string;
}

const at = (line?: number, column?: number): string =>
  line === undefined ? '' : `${line}:${column ?? 1}`;

const rowsOf = (result: LintResult): Row[] => [
  ...result.parseErrors.map((e) => ({
    position: at(e.loc?.line, e.loc?.column),
    severity: 'error',
    colour: pc.red,
    ruleId: 'parse-error',
    message: e.message,
  })),
  ...result.findings.map((f) => ({
    position: at(f.loc?.line, f.loc?.column),
    severity: f.severity as string,
    colour: COLOUR[f.severity],
    ruleId: f.ruleId,
    message: f.message,
  })),
];

/** Human-readable report: one block per file, then a totals line. */
export function stylish(results: LintResult[]): string {
  const blocks: string[] = [];

  for (const result of results) {
    const rows = rowsOf(result);
    if (rows.length === 0) continue;

    // Widths come from the plain text, so colour codes never skew alignment.
    const widest = (pick: (r: Row) => string): number =>
      Math.max(...rows.map((r) => pick(r).length));
    const wPosition = widest((r) => r.position);
    const wSeverity = widest((r) => r.severity);
    const wRule = widest((r) => r.ruleId);

    const lines = [pc.underline(result.path)];
    for (const row of rows) {
      const severity = row.colour(row.severity) + ' '.repeat(wSeverity - row.severity.length);
      lines.push(
        `  ${row.position.padEnd(wPosition)}  ${severity}  ${row.ruleId.padEnd(wRule)}  ${row.message}`,
      );
    }
    blocks.push(lines.join('\n'));
  }

  const summary = summarise(results);
  if (summary.problems === 0) return '';

  const counts = [
    `${summary.errors} error${summary.errors === 1 ? '' : 's'}`,
    `${summary.warnings} warning${summary.warnings === 1 ? '' : 's'}`,
    ...(summary.infos > 0 ? [`${summary.infos} info`] : []),
  ].join(', ');
  const fixable = summary.fixable > 0 ? `  ${summary.fixable} fixable with --fix` : '';
  const problems = `${summary.problems} problem${summary.problems === 1 ? '' : 's'}`;

  return `${blocks.join('\n\n')}\n\n${pc.bold('x')} ${problems} (${counts})${fixable}\n`;
}
