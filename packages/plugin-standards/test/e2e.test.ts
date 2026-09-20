import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lint, resolveConfig, type Finding, type Rule } from 'workflow-lint-core';
import { plugin } from '../src/index.js';

const registry = new Map<string, Rule>(plugin.rules.map((r) => [r.meta.id, r]));
const text = readFileSync(new URL('./fixtures/basic.json', import.meta.url), 'utf8');
const config = resolveConfig({ extends: ['workflow-lint:recommended'] }, registry);

const RULE = 'naming/no-default-node-name';
const forRule = (findings: Finding[], ruleId: string) =>
  findings.filter((f) => f.ruleId === ruleId).map((f) => f.nodeName);

describe('end to end', () => {
  it('lints a real workflow through the recommended preset', async () => {
    const res = await lint({ text, path: 'basic.json' }, config);
    expect(res.parseErrors).toEqual([]);
    // Scoped per rule rather than to a total, so adding rules to the preset
    // does not invalidate the assertion.
    expect(forRule(res.findings, RULE)).toEqual(['HTTP Request', 'Edit Fields']);
    for (const f of res.findings) {
      expect(f.severity).toBe('warn');
      expect(f.loc).toBeDefined();
      // Node findings point at the node; workflow-level ones at the document.
      if (f.nodeName !== undefined) expect(f.loc!.line).toBeGreaterThan(1);
    }
  });

  it('honours an inline disable directive on one node', async () => {
    const json = JSON.parse(text) as { nodes: Array<Record<string, unknown>> };
    const http = json.nodes.find((n) => n['name'] === 'HTTP Request')!;
    http['notes'] = `workflow-lint-disable ${RULE} -- known, renaming later`;
    const res = await lint({ text: JSON.stringify(json, null, 2), path: 'basic.json' }, config);
    expect(forRule(res.findings, RULE)).toEqual(['Edit Fields']);
  });

  it('the recommended preset enables every rule at its recommended level', () => {
    for (const rule of plugin.rules) {
      const recommended = rule.meta.docs.recommended;
      if (recommended === false) {
        // Opt-in rules, such as layout/formatted, stay out of the preset.
        expect(config.rules.has(rule.meta.id)).toBe(false);
        continue;
      }
      expect(config.rules.get(rule.meta.id)?.severity).toBe(recommended);
    }
  });
});
