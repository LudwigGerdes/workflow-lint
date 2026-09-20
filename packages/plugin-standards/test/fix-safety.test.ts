import { describe, it, expect } from 'vitest';
import { rules as standardsRules } from '../src/index.js';

/**
 * A fix that does not say how safe it is would be applied by --fix without
 * the user ever opting in, so the declaration is mandatory.
 */
describe('fix safety declarations', () => {
  const fixable = standardsRules.filter((r) => r.meta.fixable !== null);

  it('there are fixable rules to audit', () => {
    expect(fixable.length).toBeGreaterThan(0);
  });

  it('every fixable rule declares a fix kind and safety', () => {
    for (const rule of fixable) {
      expect(['params', 'layout', 'connections']).toContain(rule.meta.fixable);
      expect(['safe', 'unsafe']).toContain(rule.meta.fixSafety);
    }
  });

  it('no rule declares a safety without being fixable', () => {
    for (const rule of standardsRules) {
      if (rule.meta.fixable === null) expect(rule.meta.fixSafety).toBeUndefined();
    }
  });
});
