import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { createSourceMapAdapter } from 'workflow-lint-core';

/**
 * Conformance for the source-map API — owner: workflow-lint.
 *
 * Consumers copy this file verbatim and run it against the adapter they load
 * by dynamic import. The contract is narrow on purpose: one method, and
 * `undefined` rather than a throw for anything it cannot answer, because
 * consumers are expected to ignore failure entirely.
 */
const FIXTURE = fileURLToPath(new URL('./fixtures/sourcemap.json', import.meta.url));

describe('S5 SourceMapAdapter', () => {
  it('locates a node by name', () => {
    const adapter = createSourceMapAdapter();
    const first = adapter.nodeLine(FIXTURE, 'First Node');
    const second = adapter.nodeLine(FIXTURE, 'Second Node');

    expect(first).toEqual({ line: 4, column: 5 });
    expect(second).toEqual({ line: 11, column: 5 });
    // Order in the file is order in the map.
    expect(first!.line).toBeLessThan(second!.line);
  });

  it('returns undefined for a node that is not there', () => {
    expect(createSourceMapAdapter().nodeLine(FIXTURE, 'No Such Node')).toBeUndefined();
  });

  it('returns undefined rather than throwing for an unreadable file', () => {
    expect(createSourceMapAdapter().nodeLine('/no/such/file.json', 'First Node')).toBeUndefined();
  });

  it('returns undefined rather than throwing for malformed JSON', () => {
    const adapter = createSourceMapAdapter({ readFile: () => '{ "nodes": [' });
    expect(adapter.nodeLine('anything.json', 'First Node')).toBeUndefined();
  });
});
