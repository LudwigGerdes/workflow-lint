import type { LintResult, ReportedSeverity } from 'workflow-lint-core';

const RANK: Record<ReportedSeverity, number> = { info: 1, warn: 2, error: 3 };

const escapeXml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export interface JunitOptions {
  /** Findings at or above this level become failures; the rest are notes. */
  failOn?: ReportedSeverity;
}

/**
 * JUnit XML, for CI systems that collect test reports. One suite per file, one
 * case per finding. Only findings that fail the run are `<failure>`; the rest
 * are recorded as passing cases carrying a note, so a report stays readable
 * without turning every warning into a broken build.
 */
export function junit(results: LintResult[], options: JunitOptions = {}): string {
  const threshold = RANK[options.failOn ?? 'error'];
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];

  let total = 0;
  let failures = 0;
  const suites: string[] = [];

  for (const result of results) {
    const cases: string[] = [];
    let suiteFailures = 0;

    for (const parseError of result.parseErrors) {
      const message = escapeXml(parseError.message);
      cases.push(
        `    <testcase classname="parse-error" name="${escapeXml(result.path)}">\n` +
          `      <failure message="${message}" type="parse-error">${message}</failure>\n` +
          `    </testcase>`,
      );
      suiteFailures += 1;
    }

    for (const finding of result.findings) {
      const where = finding.loc ? `${result.path}:${finding.loc.line}` : result.path;
      const name = escapeXml(
        `${finding.nodeName ? `${finding.nodeName}: ` : ''}${finding.message}`,
      );
      const detail = escapeXml(`${where} ${finding.severity} ${finding.ruleId}`);
      if (RANK[finding.severity] >= threshold) {
        cases.push(
          `    <testcase classname="${escapeXml(finding.ruleId)}" name="${name}">\n` +
            `      <failure message="${name}" type="${escapeXml(finding.ruleId)}">${detail}</failure>\n` +
            `    </testcase>`,
        );
        suiteFailures += 1;
      } else {
        cases.push(
          `    <testcase classname="${escapeXml(finding.ruleId)}" name="${name}">\n` +
            `      <system-out>${detail}</system-out>\n` +
            `    </testcase>`,
        );
      }
    }

    total += cases.length;
    failures += suiteFailures;
    suites.push(
      `  <testsuite name="${escapeXml(result.path)}" tests="${cases.length}" failures="${suiteFailures}">\n` +
        `${cases.join('\n')}${cases.length > 0 ? '\n' : ''}` +
        `  </testsuite>`,
    );
  }

  lines.push(`<testsuites name="workflow-lint" tests="${total}" failures="${failures}">`);
  lines.push(...suites);
  lines.push('</testsuites>');
  return `${lines.join('\n')}\n`;
}
