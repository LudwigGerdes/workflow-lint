import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { buildProgram } from '../src/index.js';

let out: string;
let err: string;
let code: number;

const run = async (args: string[], fetch?: typeof globalThis.fetch) => {
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
    setExitCode: (c) => {
      code = c;
    },
    ...(fetch ? { fetch } : {}),
  }).parseAsync(args, { from: 'user' });
};

/**
 * Only one real version ships, so the diff tests read two small synthetic
 * versions, 1.0.0 and 1.1.0, from a fixture cache. Between them: a node added,
 * a node removed, a real property added, and a timestamp default that shifts
 * the way n8n's regenerated date defaults do.
 */
const FIXTURE_HOME = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'workflow-lint-home');

let savedHome: string | undefined;
const useHome = (home: string) => {
  process.env['WORKFLOW_LINT_HOME'] = home;
};
beforeEach(() => {
  savedHome = process.env['WORKFLOW_LINT_HOME'];
});
afterEach(() => {
  if (savedHome === undefined) delete process.env['WORKFLOW_LINT_HOME'];
  else process.env['WORKFLOW_LINT_HOME'] = savedHome;
});

describe('workflow-lint node-types list', () => {
  it('lists the available versions, marking the latest', async () => {
    useHome(FIXTURE_HOME);
    await run(['node-types', 'list']);
    expect(code).toBe(0);
    const { bundledVersions } = await import('workflow-lint-node-types');
    const all = bundledVersions();
    const lines = out.trim().split('\n');
    expect(lines).toContain('1.0.0');
    // The marked entry is whatever is latest, not a literal.
    expect(lines).toContain(`${all.at(-1)}*`);
  });

  it('includes the version the package ships with nothing installed', async () => {
    useHome(await mkdtemp(join(tmpdir(), 'workflow-lint-empty-home-')));
    await run(['node-types', 'list']);
    expect(out.trim().split('\n')).toEqual(['2.38.3*']);
  });
});

describe('workflow-lint node-types list --json', () => {
  it('emits machine-readable versions, per invariant I4', async () => {
    useHome(FIXTURE_HOME);
    await run(['node-types', 'list', '--json']);
    expect(code).toBe(0);
    const parsed = JSON.parse(out) as {
      versions: string[];
      latest: string;
      dirs: Record<string, string>;
    };
    expect(parsed.versions).toEqual(['1.0.0', '1.1.0', '2.38.3']);
    expect(parsed.latest).toBe('2.38.3');
    // Where each bundle was found: the cache for the fixtures, the shipped
    // copy for the real one.
    expect(parsed.dirs['1.0.0']).toBe(join(FIXTURE_HOME, 'node-types', '1.0.0'));
    expect(parsed.dirs['2.38.3']).toMatch(/node-types[\\/]versions[\\/]2\.38\.3$/);
    // No asterisk to strip: the marker is structure, not punctuation.
    expect(parsed.versions.every((v) => !v.includes('*'))).toBe(true);
  });

  it('still prints the marked plain list without --json', async () => {
    useHome(FIXTURE_HOME);
    await run(['node-types', 'list']);
    const { bundledVersions } = await import('workflow-lint-node-types');
    const all = bundledVersions();
    expect(out.trim().split('\n')).toEqual([...all.slice(0, -1), `${all.at(-1)}*`]);
  });
});

describe('workflow-lint node-types diff', () => {
  beforeEach(() => useHome(FIXTURE_HOME));

  it('prints a text report with a summary line', async () => {
    await run(['node-types', 'diff', '1.0.0', '1.1.0']);
    expect(code).toBe(0);
    expect(out).toContain('1.0.0 → 1.1.0:');
    expect(out).toContain('1 added, 1 removed, 0 hidden, 1 changed');
  });

  it('emits json carrying both versions', async () => {
    await run(['node-types', 'diff', '1.0.0', '1.1.0', '--format', 'json']);
    const diff = JSON.parse(out) as {
      a: string;
      b: string;
      changes: Array<{ nodeType: string }>;
      summary: Record<string, number>;
    };
    expect(diff.a).toBe('1.0.0');
    expect(diff.b).toBe('1.1.0');
    expect(diff.summary['changed']).toBe(1);
  });

  it('emits markdown with a heading', async () => {
    await run(['node-types', 'diff', '1.0.0', '1.1.0', '--format', 'md']);
    expect(out.startsWith('# Node types 1.0.0 → 1.1.0')).toBe(true);
  });

  it('--only filters by short or full node name', async () => {
    await run(['node-types', 'diff', '1.0.0', '1.1.0', '--format', 'json', '--only', 'thing']);
    const filtered = JSON.parse(out) as { changes: Array<{ nodeType: string }> };
    expect(filtered.changes.map((c) => c.nodeType)).toEqual(['n8n-nodes-base.thing']);

    await run([
      'node-types', 'diff', '1.0.0', '1.1.0', '--format', 'json', '--only', 'n8n-nodes-base.fresh',
    ]);
    const byFull = JSON.parse(out) as { changes: Array<{ nodeType: string }> };
    expect(byFull.changes.map((c) => c.nodeType)).toEqual(['n8n-nodes-base.fresh']);
  });

  it('refuses a version that is not installed, naming the ones that are and the fix', async () => {
    await run(['node-types', 'diff', '0.0.1', '1.1.0']);
    expect(code).toBe(2);
    expect(err).toContain('not installed');
    expect(err).toContain('1.1.0');
    expect(err).toContain('workflow-lint node-types install 0.0.1');
  });

  it('rejects an unknown format', async () => {
    await run(['node-types', 'diff', '1.0.0', '1.1.0', '--format', 'xml']);
    expect(code).toBe(2);
    expect(err).toContain('unknown format');
  });
});

describe('workflow-lint node-types diff --ignore-generated-defaults', () => {
  it('hides the shifting timestamp default but keeps the real change', async () => {
    useHome(FIXTURE_HOME);
    await run(['node-types', 'diff', '1.0.0', '1.1.0', '--format', 'json']);
    const all = (JSON.parse(out) as { summary: { propertyChanges: number } }).summary
      .propertyChanges;

    await run([
      'node-types', 'diff', '1.0.0', '1.1.0', '--format', 'json',
      '--ignore-generated-defaults',
    ]);
    const filtered = (JSON.parse(out) as { summary: { propertyChanges: number } }).summary
      .propertyChanges;

    expect(code).toBe(0);
    expect(all).toBe(2);
    expect(filtered).toBe(1);
  });
});

describe('workflow-lint node-types install', () => {
  const offline = (async () => {
    throw new Error('the network must not be touched');
  }) as typeof globalThis.fetch;

  it('copies the shipped version without the network', async () => {
    const home = await mkdtemp(join(tmpdir(), 'workflow-lint-install-'));
    useHome(home);
    await run(['node-types', 'install', '2.38.3'], offline);
    expect(code).toBe(0);
    expect(existsSync(join(home, 'node-types', '2.38.3', 'meta.json'))).toBe(true);
  });

  it('downloads a version that is not shipped, and reports a registry failure as a usage error', async () => {
    const home = await mkdtemp(join(tmpdir(), 'workflow-lint-install-'));
    useHome(home);
    const requests: string[] = [];
    const notFound = (async (input: string | URL | Request) => {
      requests.push(String(input));
      return new Response('not found', { status: 404 });
    }) as typeof globalThis.fetch;
    await run(['node-types', 'install', '2.40.0'], notFound);
    expect(requests).toEqual(['https://registry.npmjs.org/n8n/2.40.0']);
    expect(out).toContain('Downloading n8n 2.40.0');
    expect(code).toBe(2);
    expect(err).toContain('could not resolve n8n@2.40.0');
    expect(existsSync(join(home, 'node-types', '2.40.0'))).toBe(false);
  });

  it('rejects something that is not a version', async () => {
    useHome(await mkdtemp(join(tmpdir(), 'workflow-lint-install-')));
    await run(['node-types', 'install', 'latest'], offline);
    expect(code).toBe(2);
    expect(err).toContain('not an n8n version');
  });
});
