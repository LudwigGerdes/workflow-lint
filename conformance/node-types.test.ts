import { describe, it, expect, beforeAll } from 'vitest';
import {
  bundledVersions,
  loadEntries,
  loadPack,
  resolveVersion,
  type NodeTypePack,
} from 'workflow-lint-node-types';

/**
 * Conformance for the node-types API — owner: workflow-lint, package `workflow-lint-node-types`.
 *
 * There are no consumers today. One that needs node descriptions again copies
 * this file verbatim and runs it against the version it resolves; a failure
 * there means the two sides disagree about what a node type *is*.
 */
let pack: NodeTypePack;
const VERSION = '2.38.3';

beforeAll(async () => {
  pack = await loadPack(VERSION);
});

describe('S1 node-type bundle', () => {
  it('exposes the versions it bundles', () => {
    expect(bundledVersions()).toContain(VERSION);
  });

  it('resolves a bundled version exactly', () => {
    expect(resolveVersion(VERSION)).toEqual({ version: VERSION, exact: true });
  });

  it('reports an inexact resolution rather than guessing silently', () => {
    const resolved = resolveVersion('9.9.9');
    expect(resolved.exact).toBe(false);
    expect(resolved.note).toBeDefined();
  });

  it('set@3.4 has defaults name "Edit Fields"', () => {
    expect(pack.getByNameAndVersion('n8n-nodes-base.set', 3.4).description.defaults?.name).toBe(
      'Edit Fields',
    );
  });

  it('versionsOf reports the exact version list for set', () => {
    expect(pack.versionsOf('n8n-nodes-base.set')).toEqual({
      versions: [1, 2, 3, 3.1, 3.2, 3.3, 3.4, 3.5],
      defaultVersion: 3.5,
    });
  });

  it('airtable@1 is deprecated and @2.1 is not', () => {
    expect(pack.isDeprecated('n8n-nodes-base.airtable', 1)).toBe(true);
    expect(pack.isDeprecated('n8n-nodes-base.airtable', 2.1)).toBe(false);
  });

  it('an unknown type describes as undefined and throws on lookup', () => {
    expect(pack.describe('n8n-nodes-base.doesNotExist')).toBeUndefined();
    expect(() => pack.getByNameAndVersion('n8n-nodes-base.doesNotExist')).toThrow(
      /unknown node type/i,
    );
  });

  it('langchain nodes are present under their full names', () => {
    expect(pack.describe('@n8n/n8n-nodes-langchain.agent')).toBeDefined();
  });

  it('loadEntries returns the raw, fully qualified entries', async () => {
    const entries = await loadEntries(VERSION);
    expect(entries.length).toBeGreaterThan(400);
    expect(entries.every((e) => e.name.includes('.'))).toBe(true);
  });
});
