import type { INodeProperties } from 'n8n-workflow';
import type { NodeTypeEntry } from './registry.js';

export type PropertyChangeKind =
  | 'property-added'
  | 'property-removed'
  | 'property-default-changed'
  | 'property-type-changed'
  | 'property-options-changed';

export interface PropertyChange {
  kind: PropertyChangeKind;
  /** Dotted: top level, or one collection level deep (`options.typecast`). */
  path: string;
  /** Which version-entry of the node this property belongs to. */
  versionRange: string;
  before?: string;
  after?: string;
}

export interface NodeChange {
  nodeType: string;
  kind: 'node-added' | 'node-removed' | 'node-hidden' | 'node-changed';
  defaultVersion?: { before: number; after: number };
  addedVersions?: number[];
  credentialChanges?: Array<{ kind: 'added' | 'removed'; name: string }>;
  ioChanged?: boolean;
  properties?: PropertyChange[];
}

export interface NodeTypesDiff {
  a: string;
  b: string;
  changes: NodeChange[];
  summary: {
    added: number;
    removed: number;
    hidden: number;
    changed: number;
    propertyChanges: number;
  };
}

export interface DiffOptions {
  /**
   * Drop default changes where both sides are ISO date-times. Several nodes
   * declare relative-date defaults that are regenerated whenever the bundle is
   * built, so they shift on every refresh with nothing having changed
   * upstream — four of the eight property changes between 2.9.0 and 2.10.0.
   * Off by default: a heuristic broad enough to catch them could also hide a
   * genuine default change, so the caller opts in.
   */
  ignoreGeneratedDefaults?: boolean;
}

/** A default that is a timestamp, as the truncated display value renders it. */
const GENERATED_DATE = /^"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/** Defaults can be whole schemas; never dump one into a changelog. */
const MAX_VALUE = 60;
const show = (value: unknown): string => {
  const text = JSON.stringify(value) ?? 'undefined';
  return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE)}…` : text;
};

const versionsOf = (entry: NodeTypeEntry): number[] =>
  Array.isArray(entry.version) ? entry.version : [entry.version];

const rangeKey = (entry: NodeTypeEntry): string => JSON.stringify(entry.version);

/** The entry that carries the node's identity — the one declaring defaultVersion. */
const primary = (entries: NodeTypeEntry[]): NodeTypeEntry =>
  entries.find((e) => e.defaultVersion !== undefined) ?? entries[entries.length - 1]!;

const isDeprecated = (entry: NodeTypeEntry): boolean =>
  entry.hidden === true ||
  (entry.properties ?? []).some(
    (p) => p.type === 'notice' && (p.name === 'oldVersionNotice' || p.name === 'deprecated'),
  );

/**
 * Properties by path: every top-level property, plus one level into the
 * sub-properties of a collection or fixedCollection. Deeper nesting is
 * deliberately not walked — it produces noise rather than a changelog.
 */
function flatten(properties: INodeProperties[] = []): Map<string, INodeProperties> {
  const flat = new Map<string, INodeProperties>();
  for (const property of properties) {
    if (typeof property?.name !== 'string') continue;
    flat.set(property.name, property);

    const options = property.options;
    if (!Array.isArray(options)) continue;

    if (property.type === 'collection') {
      for (const child of options as INodeProperties[]) {
        if (typeof child?.name === 'string') flat.set(`${property.name}.${child.name}`, child);
      }
    } else if (property.type === 'fixedCollection') {
      for (const group of options as Array<{ values?: INodeProperties[] }>) {
        for (const child of group?.values ?? []) {
          if (typeof child?.name === 'string') flat.set(`${property.name}.${child.name}`, child);
        }
      }
    }
  }
  return flat;
}

/** For a choice property, the set of values on offer. */
const choices = (property: INodeProperties): string | undefined => {
  if (property.type !== 'options' && property.type !== 'multiOptions') return undefined;
  const options = Array.isArray(property.options) ? property.options : [];
  return JSON.stringify(
    options
      .map((o) => (o as { value?: unknown }).value)
      .map((v) => String(v))
      .sort(),
  );
};

function diffProperties(
  before: NodeTypeEntry,
  after: NodeTypeEntry,
  options: DiffOptions,
): PropertyChange[] {
  const versionRange = rangeKey(after).replace(/^"|"$/g, '');
  const a = flatten(before.properties);
  const b = flatten(after.properties);
  const changes: PropertyChange[] = [];

  for (const [path, property] of b) {
    if (!a.has(path)) changes.push({ kind: 'property-added', path, versionRange });
  }
  for (const [path] of a) {
    if (!b.has(path)) changes.push({ kind: 'property-removed', path, versionRange });
  }

  for (const [path, beforeProperty] of a) {
    const afterProperty = b.get(path);
    if (!afterProperty) continue;

    if (beforeProperty.type !== afterProperty.type) {
      changes.push({
        kind: 'property-type-changed',
        path,
        versionRange,
        before: show(beforeProperty.type),
        after: show(afterProperty.type),
      });
      continue;
    }

    if (JSON.stringify(beforeProperty.default) !== JSON.stringify(afterProperty.default)) {
      changes.push({
        kind: 'property-default-changed',
        path,
        versionRange,
        before: show(beforeProperty.default),
        after: show(afterProperty.default),
      });
    }

    const beforeChoices = choices(beforeProperty);
    const afterChoices = choices(afterProperty);
    if (beforeChoices !== undefined && beforeChoices !== afterChoices) {
      changes.push({
        kind: 'property-options-changed',
        path,
        versionRange,
        before: show(JSON.parse(beforeChoices) as unknown),
        after: show(JSON.parse(afterChoices ?? '[]') as unknown),
      });
    }
  }

  const kept = options.ignoreGeneratedDefaults
    ? changes.filter(
        (c) =>
          !(
            c.kind === 'property-default-changed' &&
            GENERATED_DATE.test(c.before ?? '') &&
            GENERATED_DATE.test(c.after ?? '')
          ),
      )
    : changes;

  return kept.sort((x, y) => x.path.localeCompare(y.path) || x.kind.localeCompare(y.kind));
}

function diffNode(
  nodeType: string,
  before: NodeTypeEntry[],
  after: NodeTypeEntry[],
  options: DiffOptions,
): NodeChange | undefined {
  if (after.some(isDeprecated) && !before.some(isDeprecated)) {
    return { nodeType, kind: 'node-hidden' };
  }

  const change: NodeChange = { nodeType, kind: 'node-changed' };
  let touched = false;

  const beforePrimary = primary(before);
  const afterPrimary = primary(after);

  if (
    beforePrimary.defaultVersion !== undefined &&
    afterPrimary.defaultVersion !== undefined &&
    beforePrimary.defaultVersion !== afterPrimary.defaultVersion
  ) {
    change.defaultVersion = {
      before: beforePrimary.defaultVersion,
      after: afterPrimary.defaultVersion,
    };
    touched = true;
  }

  const beforeVersions = new Set(before.flatMap(versionsOf));
  const added = [...new Set(after.flatMap(versionsOf))]
    .filter((v) => !beforeVersions.has(v))
    .sort((x, y) => x - y);
  if (added.length > 0) {
    change.addedVersions = added;
    touched = true;
  }

  const credentialNames = (entries: NodeTypeEntry[]) =>
    new Set(entries.flatMap((e) => (e.credentials ?? []).map((c) => c.name)));
  const beforeCredentials = credentialNames(before);
  const afterCredentials = credentialNames(after);
  const credentialChanges = [
    ...[...afterCredentials].filter((n) => !beforeCredentials.has(n)).map((name) => ({ kind: 'added' as const, name })),
    ...[...beforeCredentials].filter((n) => !afterCredentials.has(n)).map((name) => ({ kind: 'removed' as const, name })),
  ].sort((x, y) => x.kind.localeCompare(y.kind) || x.name.localeCompare(y.name));
  if (credentialChanges.length > 0) {
    change.credentialChanges = credentialChanges;
    touched = true;
  }

  const io = (e: NodeTypeEntry) => `${JSON.stringify(e.inputs)}|${JSON.stringify(e.outputs)}`;
  if (io(beforePrimary) !== io(afterPrimary)) {
    change.ioChanged = true;
    touched = true;
  }

  // Compare only version-entries present on both sides; a wholly new entry is
  // already reported through addedVersions.
  const beforeByRange = new Map(before.map((e) => [rangeKey(e), e]));
  const properties: PropertyChange[] = [];
  for (const afterEntry of after) {
    const beforeEntry = beforeByRange.get(rangeKey(afterEntry));
    if (beforeEntry) properties.push(...diffProperties(beforeEntry, afterEntry, options));
  }
  if (properties.length > 0) {
    change.properties = properties;
    touched = true;
  }

  return touched ? change : undefined;
}

/**
 * Structurally compare two bundled node-description sets. Pure and
 * deterministic — node types alphabetical, changes in a fixed order — so its
 * output can be committed or posted verbatim.
 *
 * Rename detection is out of scope: a renamed property reports as a removal
 * plus an addition.
 */
export function diffEntries(
  a: NodeTypeEntry[],
  b: NodeTypeEntry[],
  versions: { a: string; b: string },
  options: DiffOptions = {},
): NodeTypesDiff {
  const index = (entries: NodeTypeEntry[]): Map<string, NodeTypeEntry[]> => {
    const byName = new Map<string, NodeTypeEntry[]>();
    for (const entry of entries) byName.set(entry.name, [...(byName.get(entry.name) ?? []), entry]);
    return byName;
  };

  const before = index(a);
  const after = index(b);
  const changes: NodeChange[] = [];

  for (const [nodeType, entries] of after) {
    if (!before.has(nodeType)) {
      changes.push({ nodeType, kind: 'node-added' });
      continue;
    }
    const change = diffNode(nodeType, before.get(nodeType)!, entries, options);
    if (change) changes.push(change);
  }
  for (const nodeType of before.keys()) {
    if (!after.has(nodeType)) changes.push({ nodeType, kind: 'node-removed' });
  }

  changes.sort((x, y) => x.nodeType.localeCompare(y.nodeType));

  const count = (kind: NodeChange['kind']) => changes.filter((c) => c.kind === kind).length;
  return {
    a: versions.a,
    b: versions.b,
    changes,
    summary: {
      added: count('node-added'),
      removed: count('node-removed'),
      hidden: count('node-hidden'),
      changed: count('node-changed'),
      propertyChanges: changes.reduce((total, c) => total + (c.properties?.length ?? 0), 0),
    },
  };
}
