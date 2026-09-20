import type { LintResult } from 'workflow-lint-core';

/**
 * What a file named on the command line is told when it parses but is not a
 * workflow. Wording matches the shape the parser accepts, so the reader knows
 * what to give it instead.
 */
export const NOT_A_WORKFLOW =
  'not an n8n workflow: no "nodes" array (expected a workflow export, or an n8n API response with "data.nodes")';

/**
 * The result for an explicitly named non-workflow. A directory scan may skip
 * such a file — `*.json` matches plenty that is not a workflow — but a path
 * the user typed must never pass in silence: a hook that passes having checked
 * nothing reads as success.
 */
export const notAWorkflow = (path: string): LintResult => ({
  path,
  findings: [],
  parseErrors: [{ message: NOT_A_WORKFLOW, loc: { line: 1, column: 1 } }],
});

export interface Peek {
  isWorkflow: boolean;
  tags?: string[];
  name?: string;
}

/**
 * Look at a document before processing it: pick up the tags and name that
 * config overrides match on, and skip JSON that is not a workflow at all.
 * Unparseable input is passed through so the caller reports the parse error.
 *
 * Shared by lint and fmt so the n8n API-response envelope — a workflow
 * wrapped under `data` — is recognised identically by both.
 */
export function peek(text: string): Peek {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { isWorkflow: true };
  }
  if (data === null || typeof data !== 'object') return { isWorkflow: false };

  const envelope = data as { data?: unknown };
  const inner =
    !Array.isArray((data as { nodes?: unknown }).nodes) &&
    envelope.data !== null &&
    typeof envelope.data === 'object' &&
    Array.isArray((envelope.data as { nodes?: unknown }).nodes)
      ? envelope.data
      : data;

  const wf = inner as { nodes?: unknown; tags?: unknown; name?: unknown };
  if (!Array.isArray(wf.nodes)) return { isWorkflow: false };

  const tags = Array.isArray(wf.tags)
    ? wf.tags
        .map((t) => (typeof t === 'string' ? t : (t as { name?: unknown })?.name))
        .filter((t): t is string => typeof t === 'string')
    : undefined;
  return {
    isWorkflow: true,
    ...(tags ? { tags } : {}),
    ...(typeof wf.name === 'string' ? { name: wf.name } : {}),
  };
}
