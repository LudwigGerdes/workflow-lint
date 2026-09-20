import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProgram } from '../src/index.js';

const node = (name: string, type: string, position: [number, number], typeVersion = 1) => ({
  name,
  type,
  typeVersion,
  position,
  parameters: {},
});

const workflow = (nodes: object[]) =>
  JSON.stringify(
    {
      name: 'Fixture',
      nodes,
      connections: { Trigger: { main: [[{ node: 'A', type: 'main', index: 0 }]] } },
      settings: {},
    },
    null,
    2,
  );

const messy = () =>
  workflow([
    node('Trigger', 'n8n-nodes-base.manualTrigger', [13, 47]),
    node('A', 'n8n-nodes-base.set', [900, 600], 3.4),
  ]);

const tidy = () =>
  workflow([
    node('Trigger', 'n8n-nodes-base.manualTrigger', [0, 192]),
    node('A', 'n8n-nodes-base.set', [192, 192], 3.4),
  ]);

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
  }).parseAsync(['fmt', ...args], { from: 'user' });
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'workflow-lint-fmt-'));
});

describe('workflow-lint fmt', () => {
  it('rewrites an unformatted file and names it', async () => {
    const file = join(dir, 'w.json');
    writeFileSync(file, messy());
    await run(['w.json']);
    expect(code).toBe(0);
    expect(out).toContain('formatted w.json');
    expect(out).toContain('1 node moved');

    // The entry node keeps the author's position; the rest are laid out from it.
    const after = JSON.parse(readFileSync(file, 'utf8')) as { nodes: Array<{ position: number[] }> };
    expect(after.nodes.map((x) => x.position)).toEqual([
      [13, 47],
      [205, 47],
    ]);
  });

  it('leaves an already formatted file alone and prints nothing', async () => {
    const file = join(dir, 'w.json');
    writeFileSync(file, tidy());
    const before = readFileSync(file, 'utf8');
    await run(['w.json']);
    expect(out).toBe('');
    expect(code).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('--check reports without writing and exits 1', async () => {
    const file = join(dir, 'w.json');
    writeFileSync(file, messy());
    const before = readFileSync(file, 'utf8');
    await run(['w.json', '--check']);
    expect(code).toBe(1);
    expect(out).toContain('w.json');
    expect(out).toContain('1 file would be reformatted');
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('--check on a formatted file exits 0 silently', async () => {
    writeFileSync(join(dir, 'w.json'), tidy());
    await run(['w.json', '--check']);
    expect(code).toBe(0);
    expect(out).toBe('');
  });

  it('reports a parse error and exits 2', async () => {
    writeFileSync(join(dir, 'bad.json'), '{ "nodes": [ ');
    await run(['bad.json']);
    expect(code).toBe(2);
    expect(err).toContain('bad.json');
  });

  it('skips JSON that is not a workflow', async () => {
    writeFileSync(join(dir, 'data.json'), JSON.stringify({ hello: 'world' }));
    await run(['.']);
    expect(code).toBe(0);
    expect(out).toBe('');
  });

  it('reports an explicitly named file that is not a workflow, and exits 2', async () => {
    writeFileSync(join(dir, 'data.json'), JSON.stringify({ hello: 'world' }));
    await run(['data.json', '--check']);
    expect(code).toBe(2);
    expect(err).toContain('data.json');
    expect(err).toContain('not an n8n workflow');
  });

  it('formats stdin to stdout', async () => {
    await run(['-'], messy());
    expect(code).toBe(0);
    const formatted = JSON.parse(out) as { nodes: Array<{ position: number[] }> };
    expect(formatted.nodes.map((x) => x.position)).toEqual([
      [13, 47],
      [205, 47],
    ]);
  });

  it('is idempotent through the command', async () => {
    const file = join(dir, 'w.json');
    writeFileSync(file, messy());
    await run(['w.json']);
    const once = readFileSync(file, 'utf8');
    await run(['w.json']);
    expect(readFileSync(file, 'utf8')).toBe(once);
    expect(out).toBe('');
  });
});
