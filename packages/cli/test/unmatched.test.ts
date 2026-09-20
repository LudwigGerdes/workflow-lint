import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProgram } from '../src/index.js';

const workflow = JSON.stringify({
  name: 'F',
  nodes: [
    {
      name: 'When clicking Test',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [0, 192],
      parameters: {},
    },
  ],
  connections: {},
  settings: {},
});

let dir: string;
let out: string;
let err: string;
let code: number;

const run = async (args: string[]) => {
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
    readStdin: async () => '',
    setExitCode: (c) => {
      code = c;
    },
  }).parseAsync(args, { from: 'user' });
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'workflow-lint-unmatched-'));
  writeFileSync(join(dir, 'kept.json'), workflow);
});

describe('unmatched paths', () => {
  it('errors by default, naming the path', async () => {
    await run(['lint', 'gone.json']);
    expect(code).toBe(2);
    expect(err).toContain('gone.json');
  });

  it('skips a deleted path when asked, and still lints the rest', async () => {
    // Exactly what `git diff --cached --name-only` hands a pre-commit hook
    // when the same commit deletes a workflow.
    await run([
      'lint',
      'gone.json',
      'kept.json',
      '--no-error-on-unmatched-pattern',
      '--format',
      'json',
    ]);
    expect(code).toBe(0);
    const report = JSON.parse(out) as { files: Array<{ path: string }> };
    expect(report.files.map((f) => f.path)).toEqual(['kept.json']);
  });

  it('exits 0 when every path is gone', async () => {
    await run(['lint', 'gone.json', 'also-gone.json', '--no-error-on-unmatched-pattern']);
    expect(code).toBe(0);
    expect(out).toBe('');
  });

  it('applies to fmt too', async () => {
    await run(['fmt', 'gone.json', '--no-error-on-unmatched-pattern', '--check']);
    expect(code).toBe(0);
  });

  it('fmt still errors on a missing path by default', async () => {
    await run(['fmt', 'gone.json']);
    expect(code).toBe(2);
    expect(err).toContain('gone.json');
  });
});

describe('skipped paths are reported', () => {
  it('names what it skipped, so an empty run is never silent', async () => {
    await run(['lint', 'gone.json', 'kept.json', '--no-error-on-unmatched-pattern']);
    expect(code).toBe(0);
    expect(err).toContain('skipped 1 path that does not exist');
    expect(err).toContain('gone.json');
  });

  it('warns even when nothing at all could be linted', async () => {
    // The dangerous case: a malformed file list swallowed whole would
    // otherwise exit 0 having linted nothing.
    await run(['lint', 'gone.json', '--no-error-on-unmatched-pattern']);
    expect(code).toBe(0);
    expect(err).toContain('skipped 1 path that does not exist');
  });

  it('fmt reports skipped paths too', async () => {
    await run(['fmt', 'gone.json', '--no-error-on-unmatched-pattern', '--check']);
    expect(err).toContain('skipped 1 path that does not exist');
  });
});
