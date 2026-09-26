import type { LintResult } from 'workflow-lint-core';
import { summarise } from './summary.js';

/** Machine-readable report; the shape other tools consume. */
export function json(results: LintResult[]): string {
  return `${JSON.stringify(
    {
      files: results.map((r) => ({
        path: r.path,
        findings: r.findings,
        parseErrors: r.parseErrors,
        ...(r.directives !== undefined ? { directives: r.directives } : {}),
      })),
      summary: summarise(results),
    },
    null,
    2,
  )}\n`;
}
