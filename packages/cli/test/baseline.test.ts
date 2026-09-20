import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASELINE_FILE } from 'workflow-lint-core';
import { buildProgram } from '../src/index.js';

const NAME_RULE = 'naming/no-default-node-name';

const trigger = {
  name: 'When clicking Test',
  type: 'n8n-nodes-base.manualTrigger',
  typeVersion: 1,
  position: [0, 0],
  parameters: {},
};
const node = (name: string) => ({
  name,
  type: 'n8n-nodes-base.set',
  typeVersion: 3.4,
  position: [192, 0],
  parameters: {},
});
const workflow = (nodes: object[]) =>
  JSON.stringify({ name: 'Fixture', nodes, connections: {}, settings: {} }, null, 2);

let dir: string;
let out: string;
let code: number;

const run = async (args: string[]) => {
  out = '';
  code = 0;
  await buildProgram({
    write: (t) => {
      out += t;
    },
    writeErr: () => {},
    cwd: dir,
    readStdin: async () => '',
    setExitCode: (c) => {
      code = c;
    },
  }).parseAsync(['lint', ...args], { from: 'user' });
};

// NAME_RULE is stylistic, and stylistic findings do not fail a run by
// default. These cases are about baseline behaviour, so they opt in.
const base = ['.', '--rule', NAME_RULE, '--fail-on', 'warn', '--fail-on-stylistic'];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'workflow-lint-base-'));
  writeFileSync(join(dir, 'w.json'), workflow([trigger, node('Edit Fields')]));
});

describe('baseline', () => {
  it('records current findings and reports the count', async () => {
    await run([...base, '--gen-baseline']);
    expect(code).toBe(0);
    expect(out).toContain(`${BASELINE_FILE} with 1 finding`);
    expect(existsSync(join(dir, BASELINE_FILE))).toBe(true);
  });

  it('accepts baselined findings on the next run', async () => {
    await run([...base, '--gen-baseline']);
    await run(base);
    expect(out).toBe('');
    expect(code).toBe(0);
  });

  it('still fails on a finding the baseline does not cover', async () => {
    await run([...base, '--gen-baseline']);
    // n8n names a duplicate "Edit Fields1", which is still a default name and
    // is not in the baseline, so it must surface
    writeFileSync(join(dir, 'w.json'), workflow([trigger, node('Edit Fields'), node('Edit Fields1')]));
    await run([...base, '--format', 'json']);
    const report = JSON.parse(out) as { summary: { warnings: number } };
    expect(report.summary.warnings).toBe(1);
    expect(code).toBe(1);
  });

  it('--ignore-baseline shows everything again', async () => {
    await run([...base, '--gen-baseline']);
    await run([...base, '--ignore-baseline', '--format', 'json']);
    const report = JSON.parse(out) as { summary: { warnings: number } };
    expect(report.summary.warnings).toBe(1);
    expect(code).toBe(1);
  });

  it('honours --baseline for a custom location', async () => {
    await run([...base, '--gen-baseline', '--baseline', 'accepted.yaml']);
    expect(existsSync(join(dir, 'accepted.yaml'))).toBe(true);
    // the default location was not written, so a plain run still reports
    await run([...base, '--format', 'json']);
    expect((JSON.parse(out) as { summary: { warnings: number } }).summary.warnings).toBe(1);
    await run([...base, '--baseline', 'accepted.yaml']);
    expect(out).toBe('');
    expect(code).toBe(0);
  });
});
