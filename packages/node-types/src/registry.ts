import type {
  IDataObject,
  INodeType,
  INodeTypeDescription,
  INodeTypes,
  IVersionedNodeType,
} from 'n8n-workflow';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { versionDir, readManifest, type PackManifest } from './manifest.js';

/** A node description whose `name` is fully qualified (e.g. `n8n-nodes-base.set`). */
export interface NodeTypeEntry extends INodeTypeDescription {
  name: string;
}

export class UnknownNodeTypeError extends Error {
  constructor(t: string, v?: number) {
    super(`unknown node type ${t}${v !== undefined ? '@' + v : ''}`);
    this.name = 'UnknownNodeTypeError';
  }
}

const versionsOfEntry = (e: INodeTypeDescription): number[] =>
  Array.isArray(e.version) ? e.version : [e.version];

/**
 * An offline `INodeTypes` implementation backed by bundled node descriptions,
 * accepted directly by `Workflow` and n8n's `node-helpers`.
 */
export class NodeTypePack implements INodeTypes {
  private byName = new Map<string, NodeTypeEntry[]>();

  constructor(
    entries: NodeTypeEntry[],
    readonly manifest: PackManifest,
  ) {
    for (const e of entries) {
      const arr = this.byName.get(e.name) ?? [];
      arr.push(e);
      this.byName.set(e.name, arr);
    }
  }

  versionsOf(nodeType: string): { versions: number[]; defaultVersion: number } | undefined {
    const es = this.byName.get(nodeType);
    if (!es) return undefined;
    const versions = [...new Set(es.flatMap(versionsOfEntry))].sort((a, b) => a - b);
    const defaultVersion = es.find((e) => e.defaultVersion !== undefined)?.defaultVersion ?? versions.at(-1)!;
    return { versions, defaultVersion };
  }

  /** Non-throwing lookup of the description covering `version`. */
  describe(nodeType: string, version?: number): INodeTypeDescription | undefined {
    const es = this.byName.get(nodeType);
    if (!es) return undefined;
    const v = version ?? this.versionsOf(nodeType)!.defaultVersion;
    return es.find((e) => versionsOfEntry(e).includes(v));
  }

  getByNameAndVersion(nodeType: string, version?: number): INodeType {
    const d = this.describe(nodeType, version);
    if (!d) throw new UnknownNodeTypeError(nodeType, version);
    return { description: d } as INodeType;
  }

  getByName(nodeType: string): INodeType | IVersionedNodeType {
    return this.getByNameAndVersion(nodeType);
  }

  getKnownTypes(): IDataObject {
    return Object.fromEntries([...this.byName.keys()].map((k) => [k, {}]));
  }

  isDeprecated(nodeType: string, version?: number): boolean {
    const d = this.describe(nodeType, version);
    if (!d) return false;
    return (
      d.hidden === true ||
      d.properties.some(
        (p) => p.type === 'notice' && (p.name === 'oldVersionNotice' || p.name === 'deprecated'),
      )
    );
  }
}

const packCache = new Map<string, Promise<NodeTypePack>>();

/**
 * Load a bundled pack from disk. Offline: reads only committed JSON.
 * Cached per version - a lint run over many files shares one pack.
 */
export function loadPack(version: string): Promise<NodeTypePack> {
  let pending = packCache.get(version);
  if (!pending) {
    pending = readPack(version);
    packCache.set(version, pending);
  }
  return pending;
}

/**
 * The raw, fully qualified entries for a bundled version — what a pack is
 * built from, exposed so tools such as `node-types diff` can work over the
 * descriptions directly rather than through the lookup map.
 */
export async function loadEntries(version: string): Promise<NodeTypeEntry[]> {
  const dir = versionDir(version);
  if (dir === undefined) {
    throw new Error(
      `no node-type bundle for n8n ${version}. Install one with ` +
        `\`workflow-lint node-types install ${version}\`, or set WORKFLOW_LINT_HOME to a directory that has it.`,
    );
  }
  const [base, lc] = await Promise.all([
    readFile(join(dir, 'base.json'), 'utf8'),
    readFile(join(dir, 'langchain.json'), 'utf8'),
  ]);
  const prefix = (arr: INodeTypeDescription[], p: string): NodeTypeEntry[] =>
    arr.map((e) => ({ ...e, name: e.name.includes('.') ? e.name : `${p}${e.name}` }));
  return [
    ...prefix(JSON.parse(base) as INodeTypeDescription[], 'n8n-nodes-base.'),
    ...prefix(JSON.parse(lc) as INodeTypeDescription[], '@n8n/n8n-nodes-langchain.'),
  ];
}

async function readPack(version: string): Promise<NodeTypePack> {
  return new NodeTypePack(await loadEntries(version), readManifest(version));
}
