import { parseWorkflow, type ParseError } from 'workflow-lint-core';
import { loadPack, resolveVersion } from 'workflow-lint-node-types';
import { format, type FormatResult } from './format.js';
import type { FormatOptions } from './options.js';

export interface FormatTextOptions extends Partial<FormatOptions> {
  n8nVersion?: string;
}

export interface FormatTextResult {
  parseErrors: ParseError[];
  result?: FormatResult;
}

/**
 * Format one document from its text: parse, resolve the node-type pack
 * offline, lay it out. The CLI and the layout rule both go through here, so
 * version resolution lives in one place.
 */
export async function formatText(
  input: { text: string; path: string },
  options: FormatTextOptions = {},
): Promise<FormatTextResult> {
  const { workflow, errors } = parseWorkflow(input.text, input.path);
  if (!workflow) return { parseErrors: errors };

  const { n8nVersion, ...layout } = options;
  const pack = await loadPack(resolveVersion(n8nVersion).version);
  return { parseErrors: [], result: format(workflow, pack, layout) };
}
