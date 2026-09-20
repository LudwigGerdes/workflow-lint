import type { INode } from 'n8n-workflow';
import { STICKY_NOTE_TYPE } from './graph.js';

export type SelectorKind = 'Workflow' | 'Workflow:exit' | 'Node' | 'Connection' | 'StickyNote';

const KINDS: SelectorKind[] = ['Workflow:exit', 'Workflow', 'Node', 'Connection', 'StickyNote'];

/** Attributes a selector may constrain. */
export type AttrKey = 'type' | 'typeVersion' | 'disabled' | 'name';
const ATTR_KEYS: AttrKey[] = ['type', 'typeVersion', 'disabled', 'name'];

export type Attr =
  | { key: AttrKey; op: 'eq'; value: string | number | boolean }
  | { key: AttrKey; op: 'regex'; value: RegExp };

export interface Selector {
  kind: SelectorKind;
  attrs: Attr[];
}

export class SelectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SelectorError';
  }
}

const parseValue = (raw: string, selector: string): Attr['value'] => {
  const v = raw.trim();
  if (v === '') throw new SelectorError(`empty attribute value in selector "${selector}"`);
  if ((v.startsWith('"') && v.endsWith('"') && v.length >= 2) || (v.startsWith("'") && v.endsWith("'") && v.length >= 2)) {
    return v.slice(1, -1);
  }
  if (v.startsWith('/')) {
    const end = v.lastIndexOf('/');
    if (end <= 0) throw new SelectorError(`unterminated regex in selector "${selector}"`);
    try {
      return new RegExp(v.slice(1, end), v.slice(end + 1));
    } catch {
      throw new SelectorError(`invalid regex in selector "${selector}"`);
    }
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (/^[\w.@/-]+$/.test(v)) return v;
  throw new SelectorError(`invalid attribute value "${v}" in selector "${selector}"`);
};

/** Parse an ESLint-style selector such as `Node[type="n8n-nodes-base.if"]`. */
export function parseSelector(selector: string): Selector {
  const s = selector.trim();
  const kind = KINDS.find((k) => s === k || s.startsWith(`${k}[`));
  if (!kind) throw new SelectorError(`unknown selector "${selector}"`);

  const attrs: Attr[] = [];
  let rest = s.slice(kind.length);
  while (rest.length > 0) {
    if (!rest.startsWith('[')) throw new SelectorError(`expected "[" in selector "${selector}"`);
    const close = rest.indexOf(']');
    if (close === -1) throw new SelectorError(`unterminated "[" in selector "${selector}"`);
    const body = rest.slice(1, close);
    const eq = body.indexOf('=');
    if (eq === -1) throw new SelectorError(`attribute needs "=" in selector "${selector}"`);
    const key = body.slice(0, eq).trim();
    if (!ATTR_KEYS.includes(key as AttrKey)) {
      throw new SelectorError(`unknown attribute "${key}" in selector "${selector}"`);
    }
    const value = parseValue(body.slice(eq + 1), selector);
    attrs.push(
      value instanceof RegExp
        ? { key: key as AttrKey, op: 'regex', value }
        : { key: key as AttrKey, op: 'eq', value },
    );
    rest = rest.slice(close + 1);
  }
  return { kind, attrs };
}

const attrValue = (node: INode, key: AttrKey): string | number | boolean => {
  switch (key) {
    case 'type':
      return node.type;
    case 'typeVersion':
      return node.typeVersion;
    case 'name':
      return node.name;
    case 'disabled':
      return node.disabled === true;
  }
};

/** Does `node` satisfy `selector`? Only Node and StickyNote selectors match nodes. */
export function matchesNode(selector: Selector, node: INode): boolean {
  const isSticky = node.type === STICKY_NOTE_TYPE;
  if (selector.kind === 'StickyNote' ? !isSticky : selector.kind === 'Node' ? isSticky : true) {
    return false;
  }
  return selector.attrs.every((a) => {
    const actual = attrValue(node, a.key);
    return a.op === 'regex' ? typeof actual === 'string' && a.value.test(actual) : actual === a.value;
  });
}
