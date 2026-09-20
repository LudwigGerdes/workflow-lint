import type { NodeField, Patch, WorkflowJson } from './types.js';

/** Split `a.b[0].c` into `['a', 'b', 0, 'c']`. */
const parsePath = (path: string): Array<string | number> => {
  const parts: Array<string | number> = [];
  const re = /[^.[\]]+|\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    parts.push(m[1] !== undefined ? Number(m[1]) : m[0]);
  }
  return parts;
};

type Container = Record<string, unknown> | unknown[];

const child = (parent: Container, key: string | number): unknown =>
  typeof key === 'number' ? (parent as unknown[])[key] : (parent as Record<string, unknown>)[key];

const assign = (parent: Container, key: string | number, value: unknown): void => {
  if (typeof key === 'number') (parent as unknown[])[key] = value;
  else (parent as Record<string, unknown>)[key] = value;
};

const setIn = (root: Container, parts: Array<string | number>, value: unknown): void => {
  let cur = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i]!;
    let next = child(cur, key);
    if (typeof next !== 'object' || next === null) {
      next = typeof parts[i + 1] === 'number' ? [] : {};
      assign(cur, key, next);
    }
    cur = next as Container;
  }
  assign(cur, parts[parts.length - 1]!, value);
};

const deleteIn = (root: Container, parts: Array<string | number>): void => {
  let cur: unknown = root;
  for (let i = 0; i < parts.length - 1; i += 1) {
    cur = child(cur as Container, parts[i]!);
    if (typeof cur !== 'object' || cur === null) return;
  }
  const last = parts[parts.length - 1]!;
  if (Array.isArray(cur) && typeof last === 'number') cur.splice(last, 1);
  else if (typeof cur === 'object' && cur !== null) delete (cur as Record<string, unknown>)[last];
};

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Rewrite `$('Old')`, `$node["Old"]` and `$items('Old', …)` references. Only
 * exact name matches are touched.
 */
const renameInString = (s: string, from: string, to: string): string =>
  s.replace(
    new RegExp(`(\\$\\(|\\$node\\[|\\$items\\()\\s*(['"])${escapeRe(from)}\\2`, 'g'),
    (_m, prefix: string, quote: string) => `${prefix}${quote}${to}${quote}`,
  );

const renameInValue = (value: unknown, from: string, to: string): unknown => {
  if (typeof value === 'string') return renameInString(value, from, to);
  if (Array.isArray(value)) return value.map((v) => renameInValue(v, from, to));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, renameInValue(v, from, to)]),
    );
  }
  return value;
};

type ConnList = Array<{ node: string; type: string; index: number }>;
type ConnMap = Record<string, Record<string, Array<ConnList | null>>>;

/** Builds JSON patches. Rules never mutate the workflow themselves. */
export class Fixer {
  setParameter(node: string, path: string, value: unknown): Patch {
    return { op: 'setParameter', node, path, value };
  }
  deleteParameter(node: string, path: string): Patch {
    return { op: 'deleteParameter', node, path };
  }
  renameNode(from: string, to: string): Patch {
    return { op: 'renameNode', from, to };
  }
  moveNode(node: string, position: [number, number]): Patch {
    return { op: 'moveNode', node, position };
  }
  resizeSticky(node: string, rect: { x: number; y: number; width: number; height: number }): Patch {
    return { op: 'resizeSticky', node, rect };
  }
  addConnection(from: string, fromOutput: number, to: string, toInput: number, type = 'main'): Patch {
    return { op: 'addConnection', from, fromOutput, to, toInput, type };
  }
  removeConnection(from: string, fromOutput: number, to: string, toInput: number, type = 'main'): Patch {
    return { op: 'removeConnection', from, fromOutput, to, toInput, type };
  }
  setNodeField(node: string, field: NodeField, value: unknown): Patch {
    return { op: 'setNodeField', node, field, value };
  }
  setSetting(key: string, value: unknown): Patch {
    return { op: 'setSetting', key, value };
  }
}

/** Apply patches in order to a deep copy; the input is never mutated. */
export function applyPatches(json: WorkflowJson, patches: Patch[]): WorkflowJson {
  const out = structuredClone(json);
  const conns = (): ConnMap => {
    out.connections = (out.connections ?? {}) as WorkflowJson['connections'];
    return out.connections as unknown as ConnMap;
  };
  const find = (name: string) => out.nodes.find((n) => n.name === name);

  for (const patch of patches) {
    switch (patch.op) {
      case 'setParameter': {
        const node = find(patch.node);
        if (node) setIn(node.parameters as Container, parsePath(patch.path), patch.value);
        break;
      }
      case 'deleteParameter': {
        const node = find(patch.node);
        if (node) deleteIn(node.parameters as Container, parsePath(patch.path));
        break;
      }
      case 'moveNode': {
        const node = find(patch.node);
        if (node) node.position = [...patch.position];
        break;
      }
      case 'resizeSticky': {
        const node = find(patch.node);
        if (node) {
          node.position = [patch.rect.x, patch.rect.y];
          setIn(node.parameters as Container, ['width'], patch.rect.width);
          setIn(node.parameters as Container, ['height'], patch.rect.height);
        }
        break;
      }
      case 'setNodeField': {
        const node = find(patch.node);
        if (node) (node as unknown as Record<string, unknown>)[patch.field] = patch.value;
        break;
      }
      case 'setSetting': {
        out.settings = { ...(out.settings ?? {}), [patch.key]: patch.value };
        break;
      }
      case 'renameNode': {
        const { from, to } = patch;
        const node = find(from);
        if (!node) break;
        node.name = to;
        const c = conns();
        if (c[from] !== undefined) {
          c[to] = c[from]!;
          delete c[from];
        }
        for (const types of Object.values(c)) {
          for (const outputs of Object.values(types)) {
            for (const list of outputs) {
              for (const conn of list ?? []) if (conn.node === from) conn.node = to;
            }
          }
        }
        for (const n of out.nodes) {
          n.parameters = renameInValue(n.parameters, from, to) as typeof n.parameters;
        }
        break;
      }
      case 'addConnection': {
        const type = patch.type ?? 'main';
        const c = conns();
        const types = (c[patch.from] ??= {});
        const outputs = (types[type] ??= []);
        while (outputs.length <= patch.fromOutput) outputs.push([]);
        (outputs[patch.fromOutput] ??= []).push({ node: patch.to, type, index: patch.toInput });
        break;
      }
      case 'removeConnection': {
        const type = patch.type ?? 'main';
        const c = conns();
        const outputs = c[patch.from]?.[type];
        const list = outputs?.[patch.fromOutput];
        if (!outputs || !list) break;
        outputs[patch.fromOutput] = list.filter(
          (conn) => !(conn.node === patch.to && conn.index === patch.toInput),
        );
        while (outputs.length > 0 && (outputs[outputs.length - 1]?.length ?? 0) === 0) outputs.pop();
        if (outputs.length === 0) delete c[patch.from]![type];
        if (Object.keys(c[patch.from] ?? {}).length === 0) delete c[patch.from];
        break;
      }
    }
  }
  return out;
}
