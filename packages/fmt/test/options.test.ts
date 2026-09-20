import { describe, it, expect } from 'vitest';
import { DEFAULT_OPTIONS, resolveOptions } from '../src/options.js';

describe('format options', () => {
  it('carries the corpus-derived defaults from spec 2.5', () => {
    expect(DEFAULT_OPTIONS).toEqual({
      spacing: 192,
      branchOffset: 96,
      clawOffset: 176,
      stickyPadding: { top: 112, bottom: 60 },
      stickies: false,
    });
  });

  it('overrides only what is given', () => {
    const o = resolveOptions({ spacing: 240 });
    expect(o.spacing).toBe(240);
    expect(o.branchOffset).toBe(96);
    expect(o.stickyPadding).toEqual({ top: 112, bottom: 60 });
  });

  it('does not share the nested padding object with the defaults', () => {
    const o = resolveOptions({ stickyPadding: { top: 8, bottom: 8 } });
    expect(o.stickyPadding).toEqual({ top: 8, bottom: 8 });
    expect(DEFAULT_OPTIONS.stickyPadding).toEqual({ top: 112, bottom: 60 });
  });
});
