import type { LintResult, ReportedSeverity } from 'workflow-lint-core';

const COMMAND: Record<ReportedSeverity, string> = {
  info: 'notice',
  warn: 'warning',
  error: 'error',
};

/** Workflow-command escaping: message data. */
const escapeData = (text: string): string =>
  text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

/** Workflow-command escaping: property values, which also reserve , and :. */
const escapeProperty = (text: string): string =>
  escapeData(text).replace(/:/g, '%3A').replace(/,/g, '%2C');

/**
 * GitHub Actions workflow commands, which surface findings as annotations on
 * the changed lines of a pull request.
 */
export function githubActions(results: LintResult[]): string {
  const lines: string[] = [];

  for (const result of results) {
    const file = escapeProperty(result.path);

    for (const parseError of result.parseErrors) {
      const position = parseError.loc
        ? `,line=${parseError.loc.line},col=${parseError.loc.column}`
        : '';
      lines.push(
        `::error file=${file}${position},title=parse-error::${escapeData(parseError.message)}`,
      );
    }

    for (const finding of result.findings) {
      const position = finding.loc ? `,line=${finding.loc.line},col=${finding.loc.column}` : '';
      lines.push(
        `::${COMMAND[finding.severity]} file=${file}${position},title=${escapeProperty(finding.ruleId)}::${escapeData(finding.message)}`,
      );
    }
  }

  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}
