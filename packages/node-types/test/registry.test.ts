import { describe, it, expect } from 'vitest';
import { bundledVersions, loadEntries, loadPack } from '../src/index.js';

describe('NodeTypePack', () => {
  it('bundles at least one version', () => expect(bundledVersions().length).toBeGreaterThanOrEqual(1));

  it('the latest bundle carries the app→library version manifest', async () => {
    const latest = bundledVersions().at(-1)!;
    const pack = await loadPack(latest);
    // Assert the manifest's shape and self-consistency, not a literal version:
    // a retarget should change the bundle, not break this test.
    expect(pack.manifest.n8nVersion).toBe(latest);
    expect(Object.keys(pack.manifest.libs ?? {}).sort()).toEqual([
      '@n8n/n8n-nodes-langchain',
      'n8n-nodes-base',
      'n8n-workflow',
    ]);
    for (const v of Object.values(pack.manifest.libs ?? {})) {
      expect(v).toMatch(/^\d+\.\d+\.\d+$/);
    }
    expect(pack.manifest.sources.base).toBe(`n8n-nodes-base@${pack.manifest.libs!['n8n-nodes-base']}`);
  });

  it('resolves versioned nodes with full names', async () => {
    const pack = await loadPack(bundledVersions().at(-1)!);
    expect(pack.getByNameAndVersion('n8n-nodes-base.set', 3.4).description.defaults?.name).toBe('Edit Fields');
    expect(pack.getByNameAndVersion('n8n-nodes-base.set', 2).description.version).toEqual([1, 2]);
    expect(pack.versionsOf('n8n-nodes-base.set')).toEqual({ versions: [1, 2, 3, 3.1, 3.2, 3.3, 3.4, 3.5], defaultVersion: 3.5 });
    expect(pack.describe('n8n-nodes-base.nope')).toBeUndefined();
    expect(() => pack.getByNameAndVersion('n8n-nodes-base.nope')).toThrow(/unknown node type/i);
    expect(pack.describe('@n8n/n8n-nodes-langchain.agent')).toBeDefined();
  });

  it('getByNameAndVersion without version → defaultVersion', async () => {
    const pack = await loadPack(bundledVersions().at(-1)!);
    expect(pack.getByNameAndVersion('n8n-nodes-base.set').description.version).toContain(3.5);
  });

  it('isDeprecated via oldVersionNotice', async () => {
    const pack = await loadPack(bundledVersions().at(-1)!);
    expect(pack.isDeprecated('n8n-nodes-base.airtable', 1)).toBe(true);
    expect(pack.isDeprecated('n8n-nodes-base.airtable', 2.1)).toBe(false);
  });
});

describe('loadEntries', () => {
  it('returns every raw entry, fully qualified', async () => {
    const entries = await loadEntries(bundledVersions().at(-1)!);
    expect(entries.length).toBeGreaterThan(400);
    expect(entries.every((e) => e.name.includes('.'))).toBe(true);
    expect(entries.some((e) => e.name === 'n8n-nodes-base.set')).toBe(true);
    expect(entries.some((e) => e.name.startsWith('@n8n/n8n-nodes-langchain.'))).toBe(true);
  });

  it('is what the pack is built from', async () => {
    const version = bundledVersions().at(-1)!;
    const [entries, pack] = await Promise.all([loadEntries(version), loadPack(version)]);
    const packNames = new Set(Object.keys(pack.getKnownTypes()));
    expect(new Set(entries.map((e) => e.name))).toEqual(packNames);
  });
});
