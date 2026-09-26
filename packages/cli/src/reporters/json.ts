import type { LintResult } from 'workflow-lint-core';
import { summarise } from './summary.js';

/** What produced the report and under which conditions; every field is known at the end of a run. */
export interface JsonMeta {
  /** The workflow-lint package version. */
  version?: string;
  /** The n8n version the config pinned, if any. */
  n8nVersion?: string;
  /** The node-types bundle the rules ran against. */
  nodeTypesVersion?: string;
  /** Path of the config file, or null when none was found. */
  config?: string | null;
  /** ISO-8601 start of the run. */
  startedAt?: string;
  durationMs?: number;
  cwd?: string;
}

/** Machine-readable report; the shape other tools consume. */
export function json(results: LintResult[], meta?: JsonMeta): string {
  return `${JSON.stringify(
    {
      ...(meta ? { meta: { tool: 'workflow-lint', ...meta } } : {}),
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
