import { describe, it, expect } from 'vitest';
import type { Finding, LintResult, Rule } from 'workflow-lint-core';
import { githubActions, junit, sarif } from '../src/index.js';

const finding = (over: Partial<Finding> = {}): Finding => ({
  ruleId: 'naming/no-default-node-name',
  severity: 'warn',
  message: 'Node "Edit Fields" still has its default name.',
  messageId: 'defaultName',
  path: 'workflows/users.json',
  nodeName: 'Edit Fields',
  loc: { line: 30, column: 5 },
  ...over,
});

const results: LintResult[] = [
  {
    path: 'workflows/users.json',
    parseErrors: [],
    findings: [
      finding({
        ruleId: 'n8n/valid',
        severity: 'error',
        message: 'Node "Fetch" is missing required parameter "URL".',
        nodeName: 'Fetch',
        loc: { line: 12, column: 5 },
      }),
      finding(),
    ],
  },
];

const rules = new Map<string, Rule>([
  [
    'naming/no-default-node-name',
    {
      meta: {
        id: 'naming/no-default-node-name',
        type: 'suggestion',
        fixable: null,
        docs: { description: 'Nodes need descriptive names.', recommended: 'warn' },
        messages: {},
      },
      create: () => ({}),
    },
  ],
]);

describe('sarif', () => {
  const report = () => JSON.parse(sarif(results, { rules, version: '1.2.3' })) as {
    version: string;
    runs: Array<{
      tool: { driver: { name: string; version: string; rules: Array<{ id: string; shortDescription?: { text: string }; defaultConfiguration?: { level: string } }> } };
      results: Array<{
        ruleId: string;
        level: string;
        message: { text: string };
        locations: Array<{ physicalLocation: { artifactLocation: { uri: string }; region: { startLine: number; startColumn: number } } }>;
        fixes?: unknown[];
      }>;
    }>;
  };

  it('carries the required 2.1.0 envelope', () => {
    const out = report();
    expect(out.version).toBe('2.1.0');
    expect(out.runs).toHaveLength(1);
    expect(out.runs[0]!.tool.driver.name).toBe('workflow-lint');
    expect(out.runs[0]!.tool.driver.version).toBe('1.2.3');
  });

  it('describes each rule it reported, using metadata where available', () => {
    const driverRules = report().runs[0]!.tool.driver.rules;
    expect(driverRules.map((r) => r.id).sort()).toEqual([
      'n8n/valid',
      'naming/no-default-node-name',
    ]);
    const named = driverRules.find((r) => r.id === 'naming/no-default-node-name')!;
    expect(named.shortDescription?.text).toBe('Nodes need descriptive names.');
    expect(named.defaultConfiguration?.level).toBe('warning');
  });

  it('maps severities to SARIF levels and keeps locations', () => {
    const [first, second] = report().runs[0]!.results;
    expect(first!.level).toBe('error');
    expect(second!.level).toBe('warning');
    const region = first!.locations[0]!.physicalLocation;
    expect(region.artifactLocation.uri).toBe('workflows/users.json');
    expect(region.region).toEqual({ startLine: 12, startColumn: 5 });
  });

  it('offers a whole-file fix only for a safe fix with the source at hand', () => {
    const source = JSON.stringify(
      { nodes: [{ name: 'A', type: 'n8n-nodes-base.set', typeVersion: 3.4, position: [0, 0], parameters: {} }], connections: {} },
      null,
      2,
    );
    const fixable: LintResult[] = [
      {
        path: 'w.json',
        parseErrors: [],
        findings: [
          finding({
            path: 'w.json',
            nodeName: 'A',
            fix: [{ op: 'setParameter', node: 'A', path: 'options.x', value: 1 }],
            fixSafety: 'safe',
          }),
        ],
      },
    ];
    const withSource = JSON.parse(sarif(fixable, { sources: new Map([['w.json', source]]) })) as {
      runs: Array<{ results: Array<{ fixes?: Array<{ artifactChanges: Array<{ replacements: Array<{ insertedContent: { text: string } }> }> }> }> }>;
    };
    const text = withSource.runs[0]!.results[0]!.fixes![0]!.artifactChanges[0]!.replacements[0]!.insertedContent.text;
    expect(JSON.parse(text)).toMatchObject({ nodes: [{ parameters: { options: { x: 1 } } }] });

    // No source, no fix to offer.
    const withoutSource = JSON.parse(sarif(fixable)) as {
      runs: Array<{ results: Array<{ fixes?: unknown[] }> }>;
    };
    expect(withoutSource.runs[0]!.results[0]!.fixes).toBeUndefined();
  });
});

describe('junit', () => {
  it('fails only findings at or above the threshold', () => {
    const xml = junit(results, { failOn: 'error' });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<testsuites name="workflow-lint" tests="2" failures="1">');
    expect(xml).toContain('<testsuite name="workflows/users.json" tests="2" failures="1">');
    expect(xml).toContain('classname="n8n/valid"');
    expect(xml).toContain('<failure message="Fetch: Node &quot;Fetch&quot; is missing required parameter &quot;URL&quot;."');
    // the warning is recorded, but does not fail the suite
    expect(xml).toContain('<system-out>workflows/users.json:30 warn naming/no-default-node-name</system-out>');
  });

  it('promotes warnings to failures when the run fails on them', () => {
    const xml = junit(results, { failOn: 'warn' });
    expect(xml).toContain('failures="2"');
    expect(xml).not.toContain('<system-out>');
  });

  it('reports a parse error as a failure', () => {
    const xml = junit(
      [{ path: 'bad.json', findings: [], parseErrors: [{ message: 'invalid JSON', loc: { line: 1, column: 1 } }] }],
      {},
    );
    expect(xml).toContain('classname="parse-error"');
    expect(xml).toContain('failures="1"');
  });
});

describe('githubActions', () => {
  it('emits one workflow command per finding', () => {
    const lines = githubActions(results).trimEnd().split('\n');
    expect(lines).toEqual([
      '::error file=workflows/users.json,line=12,col=5,title=n8n/valid::Node "Fetch" is missing required parameter "URL".',
      '::warning file=workflows/users.json,line=30,col=5,title=naming/no-default-node-name::Node "Edit Fields" still has its default name.',
    ]);
  });

  it('escapes reserved characters in data and properties', () => {
    const out = githubActions([
      {
        path: 'a,b.json',
        parseErrors: [],
        findings: [finding({ path: 'a,b.json', message: 'line one\nline two 100%' })],
      },
    ]);
    expect(out).toContain('file=a%2Cb.json');
    expect(out).toContain('line one%0Aline two 100%25');
  });

  it('emits nothing when there is nothing to report', () => {
    expect(githubActions([{ path: 'clean.json', findings: [], parseErrors: [] }])).toBe('');
  });
});
