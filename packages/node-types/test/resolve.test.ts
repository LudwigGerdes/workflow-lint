import { describe, it, expect } from 'vitest';
import { resolveVersion, bundledVersions } from '../src/index.js';

describe('resolveVersion', () => {
  const vs = bundledVersions();
  it('exact', () => expect(resolveVersion(vs[0])).toEqual({ version: vs[0], exact: true }));
  it('nearest older, with a note naming the install command', () => {
    const r = resolveVersion('9.9.9');
    expect(r.exact).toBe(false);
    expect(r.version).toBe(vs.at(-1));
    expect(r.note).toMatch(/nearest older/);
    expect(r.note).toContain('workflow-lint node-types install 9.9.9');
  });
  it('nothing older → the oldest available, flagged as newer than requested', () => {
    const r = resolveVersion('0.0.1');
    expect(r.exact).toBe(false);
    expect(r.version).toBe(vs[0]);
    expect(r.note).toMatch(/using newer/);
    expect(r.note).toContain('workflow-lint node-types install 0.0.1');
  });
  it('undefined → latest bundled, not exact', () =>
    expect(resolveVersion(undefined)).toMatchObject({ version: vs.at(-1), exact: false }));
});
