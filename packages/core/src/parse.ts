import { parse as jsmParse, type JsonPointer } from 'json-source-map';
import type { LintWorkflow, Location, ParseError, SourceMap, WorkflowJson } from './types.js';

interface RawConnection {
  node: string;
  index: number;
}
type RawConnections = Record<string, Record<string, Array<Array<RawConnection> | null>>>;

/**
 * Parse workflow JSON into a `LintWorkflow` plus a source map from node names
 * to line/column. Structural problems are collected as errors, never thrown;
 * anything deeper than structure is a rule's job.
 */
export function parseWorkflow(
  text: string,
  path: string,
): { workflow?: LintWorkflow; errors: ParseError[] } {
  let data: unknown;
  let pointers: Record<string, JsonPointer>;
  try {
    const r = jsmParse(text);
    data = r.data;
    pointers = r.pointers;
  } catch (e) {
    const m = /at position (\d+)/.exec(String(e));
    const pos = m?.[1] !== undefined ? Number(m[1]) : 0;
    const line = text.slice(0, pos).split('\n').length;
    return { errors: [{ message: `invalid JSON: ${(e as Error).message}`, loc: { line, column: 1 } }] };
  }

  const loc = (ptr: string): Location | undefined => {
    const p = pointers[ptr];
    return p ? { line: p.value.line + 1, column: p.value.column + 1 } : undefined;
  };

  const errors: ParseError[] = [];

  // n8n's public API wraps a workflow as { data: { ... } } (GET /workflows/:id),
  // so `curl ... | workflow-lint lint -` hands us an envelope rather than an export.
  // Unwrap it, and shift the source-map pointers to match.
  const hasNodes = (v: unknown): boolean =>
    v !== null && typeof v === 'object' && Array.isArray((v as { nodes?: unknown }).nodes);
  let root = data;
  let prefix = '';
  if (!hasNodes(root) && root !== null && typeof root === 'object') {
    const inner = (root as { data?: unknown }).data;
    if (hasNodes(inner)) {
      root = inner;
      prefix = '/data';
    }
  }

  const o = root as Partial<WorkflowJson> | null;
  if (!o || typeof o !== 'object' || !Array.isArray(o.nodes)) {
    return { errors: [{ message: 'workflow must be an object with a "nodes" array', loc: loc('') }] };
  }
  if (!o.connections || typeof o.connections !== 'object') {
    errors.push({ message: 'workflow must have a "connections" object', loc: loc(prefix) });
  }

  const names = new Map<string, number>();
  o.nodes.forEach((n, i) => {
    const p = `${prefix}/nodes/${i}`;
    const nn = n as Partial<{ name: string; type: string; typeVersion: number; position: unknown }>;
    if (typeof nn.name !== 'string') errors.push({ message: `node ${i} has no name`, loc: loc(p) });
    else if (names.has(nn.name)) errors.push({ message: `duplicate node name "${nn.name}"`, loc: loc(p) });
    else names.set(nn.name, i);
    if (typeof nn.type !== 'string') errors.push({ message: `node "${nn.name}" has no type`, loc: loc(p) });
    if (typeof nn.typeVersion !== 'number')
      errors.push({ message: `node "${nn.name}" has no numeric typeVersion`, loc: loc(p) });
    if (!Array.isArray(nn.position) || nn.position.length !== 2)
      errors.push({ message: `node "${nn.name}" has no [x,y] position`, loc: loc(p) });
  });

  for (const [src, types] of Object.entries((o.connections ?? {}) as RawConnections)) {
    if (!names.has(src))
      errors.push({ message: `connection source "${src}" does not exist`, loc: loc(`${prefix}/connections/${src}`) });
    for (const [type, outputs] of Object.entries(types)) {
      outputs.forEach((out, oi) =>
        (out ?? []).forEach((c, ci) => {
          const cp = `${prefix}/connections/${src}/${type}/${oi}/${ci}`;
          if (!names.has(c.node))
            errors.push({ message: `connection from "${src}" to "${c.node}" — target does not exist`, loc: loc(cp) });
          if (typeof c.index !== 'number')
            errors.push({ message: `connection from "${src}" to "${c.node}" has no numeric input index`, loc: loc(cp) });
        }),
      );
    }
  }

  if (errors.length) return { errors };

  const sourceMap: SourceMap = {
    node: (name) => {
      const i = names.get(name);
      return i === undefined ? undefined : loc(`${prefix}/nodes/${i}`);
    },
    workflow: () => loc(prefix) ?? { line: 1, column: 1 },
    setting: (k) => loc(`${prefix}/settings/${k}`),
  };
  return { workflow: { json: o as WorkflowJson, path, sourceMap }, errors: [] };
}
