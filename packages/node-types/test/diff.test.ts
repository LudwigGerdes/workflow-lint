import { describe, it, expect } from 'vitest';
import type { INodeProperties } from 'n8n-workflow';
import { diffEntries, type NodeTypeEntry } from '../src/index.js';
import { loadEntries } from '../src/registry.js';

const entry = (over: Partial<NodeTypeEntry>): NodeTypeEntry =>
  ({
    name: 'n8n-nodes-base.thing',
    displayName: 'Thing',
    group: ['transform'],
    version: 1,
    description: '',
    defaults: { name: 'Thing' },
    inputs: ['main'],
    outputs: ['main'],
    properties: [],
    ...over,
  }) as NodeTypeEntry;

const prop = (over: Partial<INodeProperties>): INodeProperties =>
  ({ displayName: 'P', name: 'p', type: 'string', default: '', ...over }) as INodeProperties;

const V = { a: '2.9.0', b: '2.10.0' };
const of = (a: NodeTypeEntry[], b: NodeTypeEntry[]) => diffEntries(a, b, V);
const only = (a: NodeTypeEntry[], b: NodeTypeEntry[]) => of(a, b).changes[0]!;

describe('diffEntries', () => {
  it('records the versions being compared', () => {
    const d = of([], []);
    expect(d.a).toBe('2.9.0');
    expect(d.b).toBe('2.10.0');
    expect(d.changes).toEqual([]);
    expect(d.summary).toEqual({ added: 0, removed: 0, hidden: 0, changed: 0, propertyChanges: 0 });
  });

  it('detects added and removed nodes', () => {
    const d = of([entry({ name: 'a.gone' })], [entry({ name: 'a.fresh' })]);
    expect(d.changes.map((c) => [c.nodeType, c.kind])).toEqual([
      ['a.fresh', 'node-added'],
      ['a.gone', 'node-removed'],
    ]);
    expect(d.summary).toMatchObject({ added: 1, removed: 1 });
  });

  it('detects a node becoming hidden', () => {
    const c = only([entry({})], [entry({ hidden: true })]);
    expect(c.kind).toBe('node-hidden');
    expect(of([entry({})], [entry({ hidden: true })]).summary.hidden).toBe(1);
  });

  it('treats a deprecation notice appearing as hidden', () => {
    const deprecated = entry({
      properties: [prop({ name: 'oldVersionNotice', type: 'notice' })],
    });
    expect(only([entry({})], [deprecated]).kind).toBe('node-hidden');
  });

  it('reports a defaultVersion bump', () => {
    const c = only(
      [entry({ version: [1, 2], defaultVersion: 2 })],
      [entry({ version: [1, 2], defaultVersion: 3 })],
    );
    expect(c.kind).toBe('node-changed');
    expect(c.defaultVersion).toEqual({ before: 2, after: 3 });
  });

  it('reports typeVersions that are new on the b side', () => {
    const c = only([entry({ version: [1, 2] })], [entry({ version: [1, 2] }), entry({ version: [3] })]);
    expect(c.addedVersions).toEqual([3]);
  });

  it('reports credential changes', () => {
    const c = only(
      [entry({ credentials: [{ name: 'oldApi', required: true }] })],
      [entry({ credentials: [{ name: 'newApi', required: true }] })],
    );
    expect(c.credentialChanges).toEqual([
      { kind: 'added', name: 'newApi' },
      { kind: 'removed', name: 'oldApi' },
    ]);
  });

  it('flags changed inputs or outputs', () => {
    const c = only([entry({})], [entry({ outputs: ['main', 'main'] })]);
    expect(c.ioChanged).toBe(true);
  });

  it('reports property additions, removals and changes within a matched version', () => {
    const before = entry({ properties: [prop({ name: 'keep' }), prop({ name: 'gone' })] });
    const after = entry({
      properties: [
        prop({ name: 'keep', default: 'now-set' }),
        prop({ name: 'fresh' }),
        prop({ name: 'retyped', type: 'number' }),
      ],
    });
    const withRetyped = entry({
      properties: [prop({ name: 'keep' }), prop({ name: 'gone' }), prop({ name: 'retyped' })],
    });

    const c = only([withRetyped], [after]);
    expect(c.properties).toEqual([
      { kind: 'property-added', path: 'fresh', versionRange: '1' },
      { kind: 'property-removed', path: 'gone', versionRange: '1' },
      {
        kind: 'property-default-changed',
        path: 'keep',
        versionRange: '1',
        before: '""',
        after: '"now-set"',
      },
      {
        kind: 'property-type-changed',
        path: 'retyped',
        versionRange: '1',
        before: '"string"',
        after: '"number"',
      },
    ]);
    void before;
  });

  it('reports a changed options list', () => {
    const withOptions = (values: string[]) =>
      entry({
        properties: [
          prop({
            name: 'mode',
            type: 'options',
            options: values.map((v) => ({ name: v, value: v })),
          }),
        ],
      });
    const c = only([withOptions(['a', 'b'])], [withOptions(['a', 'b', 'c'])]);
    expect(c.properties).toEqual([
      expect.objectContaining({ kind: 'property-options-changed', path: 'mode' }),
    ]);
  });

  it('looks one level into a collection', () => {
    const withCollection = (children: INodeProperties[]) =>
      entry({
        properties: [prop({ name: 'options', type: 'collection', options: children })],
      });
    const c = only(
      [withCollection([prop({ name: 'timeout' })])],
      [withCollection([prop({ name: 'timeout' }), prop({ name: 'typecast', type: 'boolean' })])],
    );
    expect(c.properties).toEqual([
      { kind: 'property-added', path: 'options.typecast', versionRange: '1' },
    ]);
  });

  it('looks one level into a fixedCollection', () => {
    const withFixed = (children: INodeProperties[]) =>
      entry({
        properties: [
          prop({
            name: 'rules',
            type: 'fixedCollection',
            options: [{ name: 'values', displayName: 'Values', values: children }],
          }),
        ],
      });
    const c = only(
      [withFixed([prop({ name: 'conditions' })])],
      [withFixed([prop({ name: 'conditions' }), prop({ name: 'outputKey' })])],
    );
    expect(c.properties).toEqual([
      { kind: 'property-added', path: 'rules.outputKey', versionRange: '1' },
    ]);
  });

  it('truncates long values rather than dumping schemas', () => {
    const long = 'x'.repeat(200);
    const c = only(
      [entry({ properties: [prop({ name: 'p', default: '' })] })],
      [entry({ properties: [prop({ name: 'p', default: long })] })],
    );
    const change = c.properties![0]!;
    expect(change.after!.length).toBe(61);
    expect(change.after!.endsWith('…')).toBe(true);
  });

  it('omits unchanged nodes', () => {
    expect(of([entry({})], [entry({})]).changes).toEqual([]);
  });

  it('is deterministic regardless of input order', () => {
    const a = [entry({ name: 'a.one' }), entry({ name: 'a.two' }), entry({ name: 'a.three' })];
    const b = [entry({ name: 'a.three' }), entry({ name: 'a.four' }), entry({ name: 'a.one' })];
    const forward = JSON.stringify(of(a, b));
    const shuffled = JSON.stringify(of([...a].reverse(), [...b].reverse()));
    expect(shuffled).toBe(forward);
  });

  it('counts property changes in the summary', () => {
    const d = of(
      [entry({ properties: [prop({ name: 'gone' })] })],
      [entry({ properties: [prop({ name: 'fresh' })] })],
    );
    expect(d.summary).toMatchObject({ changed: 1, propertyChanges: 2 });
  });
});

describe('diffEntries over the real bundle', () => {
  // Only one version ships, so the real-data check is a self-diff: every
  // description must compare equal to a fresh load of itself.
  it('finds no changes between a bundle and itself', async () => {
    const [a, b] = await Promise.all([loadEntries('2.38.3'), loadEntries('2.38.3')]);
    const d = diffEntries(a, b, { a: '2.38.3', b: '2.38.3' });
    expect(d.changes).toEqual([]);
    expect(d.summary).toEqual({ added: 0, removed: 0, hidden: 0, changed: 0, propertyChanges: 0 });
  });
});

describe('generated defaults', () => {
  const dated = (value: string) =>
    entry({ properties: [prop({ name: 'startDate', default: value })] });

  it('reports a shifting date default by default', () => {
    const d = of(
      [dated('2026-02-08T00:00:00.000+00:00')],
      [dated('2026-02-15T00:00:00.000+00:00')],
    );
    expect(d.changes[0]!.properties).toHaveLength(1);
    expect(d.summary.propertyChanges).toBe(1);
  });

  it('suppresses it when asked, and drops the node if nothing else changed', () => {
    const d = diffEntries(
      [dated('2026-02-08T00:00:00.000+00:00')],
      [dated('2026-02-15T00:00:00.000+00:00')],
      V,
      { ignoreGeneratedDefaults: true },
    );
    expect(d.changes).toEqual([]);
    expect(d.summary).toMatchObject({ changed: 0, propertyChanges: 0 });
  });

  it('keeps a real change on the same node', () => {
    const before = entry({
      properties: [prop({ name: 'startDate', default: '2026-02-08T00:00:00.000+00:00' })],
    });
    const after = entry({
      properties: [
        prop({ name: 'startDate', default: '2026-02-15T00:00:00.000+00:00' }),
        prop({ name: 'brandNew' }),
      ],
    });
    const d = diffEntries([before], [after], V, { ignoreGeneratedDefaults: true });
    expect(d.changes[0]!.properties).toEqual([
      { kind: 'property-added', path: 'brandNew', versionRange: '1' },
    ]);
  });

  it('does not suppress a date turning into something else', () => {
    const d = diffEntries(
      [dated('2026-02-08T00:00:00.000+00:00')],
      [dated('={{ $now }}')],
      V,
      { ignoreGeneratedDefaults: true },
    );
    expect(d.changes[0]!.properties).toHaveLength(1);
  });
});
