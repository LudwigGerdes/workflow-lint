import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProgram } from '../src/index.js';

const NAME_RULE = 'naming/no-default-node-name';

const workflow = (nodes: object[], connections: Record<string, unknown> = {}) =>
  JSON.stringify({ name: 'Fixture', nodes, connections, settings: {} }, null, 2);

const trigger = {
  name: 'When clicking Test',
  type: 'n8n-nodes-base.manualTrigger',
  typeVersion: 1,
  position: [0, 0],
  parameters: {},
};
const node = (name: string, type: string, typeVersion: number, parameters = {}) => ({
  name,
  type,
  typeVersion,
  position: [192, 0],
  parameters,
});

let dir: string;
let out: string;
let err: string;
let code: number;

const run = async (args: string[], stdin = '') => {
  out = '';
  err = '';
  code = 0;
  await buildProgram({
    write: (t) => {
      out += t;
    },
    writeErr: (t) => {
      err += t;
    },
    cwd: dir,
    readStdin: async () => stdin,
    setExitCode: (c) => {
      code = c;
    },
  }).parseAsync(['lint', ...args], { from: 'user' });
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'workflow-lint-cli-'));
  writeFileSync(
    join(dir, 'default-names.json'),
    workflow([trigger, node('Edit Fields', 'n8n-nodes-base.set', 3.4)]),
  );
  writeFileSync(
    join(dir, 'clean.json'),
    workflow([trigger, node('Shape Payload', 'n8n-nodes-base.set', 3.4)]),
  );
});

describe('workflow-lint lint', () => {
  it('reports findings and a summary in stylish format', async () => {
    await run(['default-names.json', '--rule', NAME_RULE]);
    expect(out).toContain('default-names.json');
    expect(out).toContain('warn');
    expect(out).toContain(NAME_RULE);
    expect(out).toContain('1 problem (0 errors, 1 warning)');
    expect(code).toBe(0);
  });

  it('emits machine-readable json', async () => {
    await run(['.', '--rule', NAME_RULE, '--format', 'json']);
    const report = JSON.parse(out) as {
      files: Array<{ path: string; findings: unknown[] }>;
      summary: { files: number; warnings: number; errors: number };
    };
    expect(report.summary.warnings).toBe(1);
    expect(report.summary.errors).toBe(0);
    expect(report.files.map((f) => f.path).sort()).toEqual(['clean.json', 'default-names.json']);
  });

  it('exits 0 and prints nothing when clean', async () => {
    await run(['clean.json', '--rule', NAME_RULE]);
    expect(out).toBe('');
    expect(code).toBe(0);
  });

  it('fails on warnings when asked', async () => {
    // NAME_RULE is stylistic, so failing on it is opt-in.
    await run([
      'default-names.json',
      '--rule',
      NAME_RULE,
      '--fail-on',
      'warn',
      '--fail-on-stylistic',
    ]);
    expect(code).toBe(1);
  });

  it('does not fail on a stylistic warning by default', async () => {
    await run(['default-names.json', '--rule', NAME_RULE, '--fail-on', 'warn']);
    expect(code).toBe(0);
  });

  it('runs only the named class', async () => {
    await run(['default-names.json', '--class', 'quality', '--format', 'json']);
    const report = JSON.parse(out) as { files: Array<{ findings: Array<{ ruleId: string }> }> };
    const ids = report.files.flatMap((f) => f.findings.map((x) => x.ruleId));
    expect(ids).not.toContain(NAME_RULE);
  });

  it('rejects an unknown class', async () => {
    await run(['default-names.json', '--class', 'cosmetic']);
    expect(code).toBe(2);
    expect(err).toContain('unknown --class');
  });

  it('fails when warnings exceed --max-warnings', async () => {
    await run([
      'default-names.json',
      '--rule',
      NAME_RULE,
      '--max-warnings',
      '0',
      '--fail-on-stylistic',
    ]);
    expect(code).toBe(1);
    expect(err).toContain('exceed the --max-warnings limit');
  });

  it('reports a parse error and exits 2', async () => {
    writeFileSync(join(dir, 'broken.json'), '{ "nodes": [ ');
    await run(['broken.json']);
    expect(out).toContain('parse-error');
    expect(code).toBe(2);
  });

  it('skips JSON that is not a workflow', async () => {
    writeFileSync(join(dir, 'data.json'), JSON.stringify({ hello: 'world' }));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'ignored' }));
    await run(['.', '--rule', NAME_RULE, '--format', 'json']);
    const report = JSON.parse(out) as { files: Array<{ path: string }> };
    expect(report.files.map((f) => f.path).sort()).toEqual(['clean.json', 'default-names.json']);
  });

  it('reports an explicitly named file that is not a workflow, and exits 2', async () => {
    writeFileSync(join(dir, 'data.json'), JSON.stringify({ hello: 'world', items: [1, 2, 3] }));
    await run(['data.json']);
    expect(out).toContain('data.json');
    expect(out).toContain('not an n8n workflow');
    expect(out).toContain('1 problem (1 error, 0 warnings)');
    expect(code).toBe(2);
  });

  it('reports stdin that is not a workflow, and exits 2', async () => {
    await run(['-', '--format', 'json'], JSON.stringify({ hello: 'world' }));
    const report = JSON.parse(out) as { summary: { errors: number } };
    expect(report.summary.errors).toBe(1);
    expect(code).toBe(2);
  });

  it('applies safe fixes in place', async () => {
    const file = join(dir, 'question.json');
    writeFileSync(file, workflow([trigger, node('Is Valid', 'n8n-nodes-base.if', 2.2)]));
    await run(['question.json', '--rule', 'naming/decision-node-question-mark', '--fix']);
    const fixed = JSON.parse(readFileSync(file, 'utf8')) as { nodes: Array<{ name: string }> };
    expect(fixed.nodes[1]!.name).toBe('Is Valid?');
  });

  it('lints stdin as a single workflow', async () => {
    const text = workflow([trigger, node('Edit Fields', 'n8n-nodes-base.set', 3.4)]);
    await run(['-', '--rule', NAME_RULE, '--format', 'json'], text);
    const report = JSON.parse(out) as { files: Array<{ path: string; findings: unknown[] }> };
    expect(report.files).toHaveLength(1);
    expect(report.files[0]!.path).toBe('<stdin>');
    expect(report.files[0]!.findings).toHaveLength(1);
  });

  it('reports only errors with --quiet', async () => {
    await run(['default-names.json', '--rule', NAME_RULE, '--quiet']);
    expect(out).toBe('');
    expect(code).toBe(0);
  });

  it('rejects an unknown rule as a usage error', async () => {
    await run(['.', '--rule', 'nope/nope']);
    expect(err).toContain('unknown rule "nope/nope"');
    expect(code).toBe(2);
  });

  it('rejects an unknown format', async () => {
    await run(['.', '--format', 'xml']);
    expect(err).toContain('unknown format');
    expect(code).toBe(2);
  });

  it('honours a config file in the working directory', async () => {
    writeFileSync(
      join(dir, 'workflow-lint.config.yaml'),
      `extends: [workflow-lint:recommended]\nrules:\n  ${NAME_RULE}: error\n`,
    );
    await run(['default-names.json', '--rule', NAME_RULE, '--format', 'json']);
    const report = JSON.parse(out) as { summary: { errors: number } };
    expect(report.summary.errors).toBe(1);
  });
});

describe('workflow-lint --version', () => {
  it('prints the CLI package version and exits 0', async () => {
    const { version } = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    let printed = '';
    const program = buildProgram({
      write: (t) => {
        printed += t;
      },
      writeErr: () => {},
      cwd: dir,
      readStdin: async () => '',
      setExitCode: () => {},
    });
    // exitOverride turns commander's successful exit into a throw with code 0.
    await expect(program.parseAsync(['--version'], { from: 'user' })).rejects.toMatchObject({
      exitCode: 0,
    });
    expect(printed.trim()).toBe(version);
  });
});

describe('config discovery and plugins', () => {
  const PLUGIN = `
export const rules = [{
  meta: {
    id: 'acme/no-set-node', type: 'problem', class: 'quality', fixable: null,
    docs: { description: 'Acme forbids Edit Fields nodes.', recommended: 'error' },
    messages: { found: 'Edit Fields node "{{name}}" is not allowed.' }, schema: [],
  },
  create: (ctx) => ({
    'Node[type="n8n-nodes-base.set"]': (node) => ctx.report({ node, messageId: 'found', data: { name: node.name } }),
  }),
}];
`;

  it('finds the config above the working directory and loads its plugin', async () => {
    const root = mkdtempSync(join(tmpdir(), 'workflow-lint-cli-walk-'));
    mkdirSync(join(root, 'tools'));
    mkdirSync(join(root, 'flows', 'billing'), { recursive: true });
    writeFileSync(join(root, 'tools', 'acme.mjs'), PLUGIN);
    writeFileSync(
      join(root, 'workflow-lint.config.yaml'),
      'plugins: [./tools/acme.mjs]\nrules:\n  acme/no-set-node: error\n',
    );
    writeFileSync(
      join(root, 'flows', 'billing', 'invoice.json'),
      workflow([trigger, node('Shape Payload', 'n8n-nodes-base.set', 3.4)]),
    );
    dir = join(root, 'flows', 'billing');
    await run(['invoice.json', '--rule', 'acme/no-set-node', '--format', 'json']);
    const report = JSON.parse(out) as { summary: { errors: number }; files: Array<{ findings: Array<{ ruleId: string; message: string }> }> };
    expect(report.summary.errors).toBe(1);
    expect(report.files[0]?.findings[0]?.ruleId).toBe('acme/no-set-node');
    expect(report.files[0]?.findings[0]?.message).toContain('Shape Payload');
    expect(code).toBe(1);
  });

  it('a plugin that cannot be loaded is a config error, named', async () => {
    writeFileSync(join(dir, 'workflow-lint.config.yaml'), 'plugins: [./nope.mjs]\n');
    await run(['clean.json']);
    expect(err).toContain('nope.mjs');
    expect(code).toBe(2);
  });

  it('rules lists plugin rules alongside the built-in ones', async () => {
    writeFileSync(join(dir, 'acme.mjs'), PLUGIN);
    writeFileSync(join(dir, 'workflow-lint.config.yaml'), 'plugins: [./acme.mjs]\n');
    out = '';
    await buildProgram({
      write: (t) => {
        out += t;
      },
      writeErr: () => {},
      cwd: dir,
      readStdin: async () => '',
      setExitCode: () => {},
    }).parseAsync(['rules', '--json'], { from: 'user' });
    const ids = (JSON.parse(out) as Array<{ id: string }>).map((r) => r.id);
    expect(ids).toContain('acme/no-set-node');
    expect(ids).toContain(NAME_RULE);
  });
});

describe('inline directives and locked rules', () => {
  const noted = (notes: string) =>
    workflow([trigger, node('Edit Fields', 'n8n-nodes-base.set', 3.4, {}), ]).replace(
      '"name": "Edit Fields",',
      `"name": "Edit Fields", "notes": ${JSON.stringify(notes)},`,
    );

  it('reports every directive in JSON, with what it suppressed', async () => {
    writeFileSync(join(dir, 'noted.json'), noted(`workflow-lint-disable ${NAME_RULE} -- renaming next sprint`));
    await run(['noted.json', '--rule', NAME_RULE, '--format', 'json']);
    const report = JSON.parse(out) as {
      files: Array<{ directives: unknown[] }>;
      summary: { warnings: number; directives: Record<string, number> };
    };
    expect(report.summary.warnings).toBe(0);
    expect(report.files[0]?.directives).toEqual([
      { location: 'node:Edit Fields', rules: [NAME_RULE], reason: 'renaming next sprint', suppressed: 1, blocked: 0, ignored: false },
    ]);
    expect(report.summary.directives).toEqual({ total: 1, used: 1, unused: 0, blocked: 0, ignored: 0 });
  });

  it('--no-inline-config reports the finding anyway and says the directive was not applied', async () => {
    writeFileSync(join(dir, 'noted.json'), noted(`workflow-lint-disable ${NAME_RULE}`));
    await run(['noted.json', '--rule', NAME_RULE, '--no-inline-config', '--format', 'json']);
    const report = JSON.parse(out) as { summary: { warnings: number; directives: Record<string, number> } };
    expect(report.summary.warnings).toBe(1);
    expect(report.summary.directives.ignored).toBe(1);
    expect(err).toContain('not applied');
  });

  it('a stale directive is named on stderr', async () => {
    writeFileSync(join(dir, 'noted.json'), noted('workflow-lint-disable structure/nothing'));
    await run(['noted.json', '--rule', NAME_RULE]);
    expect(err).toContain('1 inline directive(s) suppress nothing');
  });

  it('a locked rule survives its directive and the config cannot lower it', async () => {
    writeFileSync(
      join(dir, 'workflow-lint.config.yaml'),
      `locked:\n  ${NAME_RULE}: error\nrules:\n  ${NAME_RULE}: off\n`,
    );
    writeFileSync(join(dir, 'noted.json'), noted(`workflow-lint-disable ${NAME_RULE}`));
    await run(['noted.json', '--rule', NAME_RULE, '--format', 'json']);
    const report = JSON.parse(out) as { summary: { errors: number; directives: Record<string, number> } };
    expect(report.summary.errors).toBe(1);
    expect(report.summary.directives.blocked).toBe(1);
    expect(err).toContain('locked');
  });
});
