import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rules as n8nRules } from 'workflow-lint-plugin-n8n';
import { rules as standardsRules } from 'workflow-lint-plugin-standards';
import type { Rule } from 'workflow-lint-core';
import {
  explainRule,
  fixWorkflow,
  formatWorkflow,
  lintWorkflow,
  listRules,
  type HandlerDeps,
} from '../src/handlers.js';
import { runTool } from '../src/server.js';

const registry = new Map<string, Rule>(
  [...n8nRules, ...standardsRules].map((r) => [r.meta.id, r]),
);

const deps: HandlerDeps = {
  registry,
  cwd: '/repo',
  readFile: async () => '',
  n8nVersion: '2.38.3',
};

const node = (name: string, type: string, typeVersion: number, position: [number, number]) => ({
  name,
  type,
  typeVersion,
  position,
  parameters: {},
});

const workflow = {
  name: 'W',
  nodes: [
    node('When clicking Test', 'n8n-nodes-base.manualTrigger', 1, [0, 192]),
    node('Edit Fields', 'n8n-nodes-base.set', 3.4, [900, 600]),
  ],
  connections: {
    'When clicking Test': { main: [[{ node: 'Edit Fields', type: 'main', index: 0 }]] },
  },
  settings: {},
};

describe('list_rules', () => {
  it('lists every registered rule', async () => {
    const { rules } = await listRules(deps);
    expect(rules.length).toBe(registry.size);
    expect(rules.some((r) => r.id === 'naming/no-default-node-name')).toBe(true);
  });

  it('reports each rule’s level and fixability', async () => {
    const rule = (await listRules(deps)).rules.find((r) => r.id === 'naming/decision-node-question-mark')!;
    expect(rule.recommended).toBe('warn');
    expect(rule.fixable).toBe('connections');
  });
});

describe('explain_rule', () => {
  it('renders the rule page from metadata', async () => {
    const out = await explainRule(deps, { ruleId: 'naming/no-default-node-name' });
    expect(out.ruleId).toBe('naming/no-default-node-name');
    expect(out.markdown).toContain('# naming/no-default-node-name');
    expect(out.markdown).toContain('Recommended');
  });

  it('rejects an unknown rule', async () => {
    await expect(explainRule(deps, { ruleId: 'nope/nope' })).rejects.toThrow(/unknown rule/i);
  });
});

describe('lint_workflow', () => {
  it('lints an inline workflow and summarises by severity', async () => {
    const out = await lintWorkflow(deps, { json: workflow });
    expect(out.path).toBe('<inline>');
    expect(out.findings.some((f) => f.ruleId === 'naming/no-default-node-name')).toBe(true);
    expect(out.summary.warnings).toBeGreaterThan(0);
  });

  it('rejects a document that is not a workflow instead of reporting it clean', async () => {
    await expect(lintWorkflow(deps, { json: { nope: true } })).rejects.toThrow(/"nodes"/);
  });

  it('accepts the workflow as a JSON string, as an LLM will often send it', async () => {
    const out = await lintWorkflow(deps, { json: JSON.stringify(workflow) });
    expect(out.findings.some((f) => f.ruleId === 'naming/no-default-node-name')).toBe(true);
  });

  it('rejects a string that is not a workflow, naming the parse error', async () => {
    await expect(lintWorkflow(deps, { json: '{"hello":"world"}' })).rejects.toThrow(/"nodes"/);
    await expect(lintWorkflow(deps, { json: 'not json' })).rejects.toThrow(/not valid JSON/);
  });

  it('surfaces the rejection as an MCP error result, not a clean summary', async () => {
    const out = await runTool(() => lintWorkflow(deps, { json: '{"hello":"world"}' }));
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toContain('"nodes"');
  });

  it('reads a workflow from a path', async () => {
    const out = await lintWorkflow(
      { ...deps, readFile: async () => JSON.stringify(workflow) },
      { path: 'dev/w.json' },
    );
    expect(out.path).toBe('dev/w.json');
    expect(out.findings.length).toBeGreaterThan(0);
  });
});

describe('fix_workflow', () => {
  const withIf = {
    name: 'W',
    nodes: [
      node('When clicking Test', 'n8n-nodes-base.manualTrigger', 1, [0, 192]),
      node('Is Valid', 'n8n-nodes-base.if', 2.2, [192, 192]),
    ],
    connections: {
      'When clicking Test': { main: [[{ node: 'Is Valid', type: 'main', index: 0 }]] },
    },
    settings: {},
  };

  it('applies safe fixes and reports what is left', async () => {
    const out = await fixWorkflow(deps, { json: withIf });
    expect(out.changed).toBe(true);
    expect(out.json.nodes.some((n) => n.name === 'Is Valid?')).toBe(true);
    expect(out.remaining.some((f) => f.ruleId === 'naming/decision-node-question-mark')).toBe(false);
  });

  it('reports no change when there is nothing safe to fix', async () => {
    const clean = {
      name: 'W',
      nodes: [node('When clicking Test', 'n8n-nodes-base.manualTrigger', 1, [0, 192])],
      connections: {},
      settings: {},
    };
    expect((await fixWorkflow(deps, { json: clean })).changed).toBe(false);
  });
});

describe('format_workflow', () => {
  it('lays out the canvas and counts the moves', async () => {
    const out = await formatWorkflow(deps, { json: workflow });
    expect(out.changed).toBe(true);
    expect(out.moved).toBe(1);
    expect(out.json.nodes[1]!.position).toEqual([192, 192]);
  });

  it('is a no-op on an already formatted workflow', async () => {
    const once = await formatWorkflow(deps, { json: workflow });
    const twice = await formatWorkflow(deps, { json: once.json });
    expect(twice.changed).toBe(false);
    expect(twice.moved).toBe(0);
  });
});

describe('the config file', () => {
  const setup = (): string => mkdtempSync(join(tmpdir(), 'workflow-lint-mcp-cfg-'));

  it('is read from cwd, so a rule turned off there is off here too', async () => {
    const cwd = setup();
    const before = await lintWorkflow({ ...deps, cwd }, { json: workflow });
    expect(before.findings.some((f) => f.ruleId === 'naming/no-default-node-name')).toBe(true);
    writeFileSync(join(cwd, 'workflow-lint.config.yaml'), 'rules:\n  naming/no-default-node-name: off\n');
    const after = await lintWorkflow({ ...deps, cwd }, { json: workflow });
    expect(after.findings.some((f) => f.ruleId === 'naming/no-default-node-name')).toBe(false);
  });

  it('brings its plugins into list_rules, explain_rule and lint', async () => {
    const cwd = setup();
    writeFileSync(
      join(cwd, 'acme.mjs'),
      `export const rules = [{
        meta: { id: 'acme/no-set-node', type: 'problem', class: 'quality', fixable: null,
          docs: { description: 'Acme forbids Edit Fields nodes.', recommended: 'error' },
          messages: { found: 'no' }, schema: [] },
        create: (ctx) => ({ 'Node[type="n8n-nodes-base.set"]': (node) => ctx.report({ node, messageId: 'found' }) }),
      }];`,
    );
    writeFileSync(join(cwd, 'workflow-lint.config.yaml'), 'plugins: [./acme.mjs]\n');
    const local = { ...deps, cwd };
    expect((await listRules(local)).rules.some((r) => r.id === 'acme/no-set-node')).toBe(true);
    expect((await explainRule(local, { ruleId: 'acme/no-set-node' })).markdown).toContain('acme/no-set-node');
    const result = await lintWorkflow(local, { json: workflow });
    expect(result.findings.some((f) => f.ruleId === 'acme/no-set-node')).toBe(true);
  });

  it('honours an explicit configPath', async () => {
    const cwd = setup();
    mkdirSync(join(cwd, 'ci'));
    writeFileSync(join(cwd, 'ci', 'lint.yaml'), 'rules:\n  naming/no-default-node-name: off\n');
    const result = await lintWorkflow({ ...deps, cwd, configPath: 'ci/lint.yaml' }, { json: workflow });
    expect(result.findings.some((f) => f.ruleId === 'naming/no-default-node-name')).toBe(false);
  });
});
