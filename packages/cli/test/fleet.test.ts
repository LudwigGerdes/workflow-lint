import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { runFleet } from '../src/commands/fleet.js';
import { UsageError } from '../src/files.js';

let dir: string;
let out: string;
let err: string;

const deps = () => ({
  write: (t: string) => {
    out += t;
  },
  writeErr: (t: string) => {
    err += t;
  },
  cwd: dir,
});

const manifest = async (value: unknown): Promise<string> => {
  await writeFile(join(dir, 'instances.json'), JSON.stringify(value), 'utf8');
  return 'instances.json';
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'workflow-lint-fleet-'));
  out = '';
  err = '';
});

describe('fleet', () => {
  it('maps each environment directory to the version it runs', async () => {
    const path = await manifest({
      n8nVersion: '2.38.3',
      instances: [
        { name: 'dev', directory: 'dev' },
        { name: 'personal', directory: 'prod/personal' },
      ],
    });
    expect(await runFleet(path, {}, deps())).toBe(0);
    expect(parse(out)).toEqual({
      overrides: [
        {
          files: ['dev/**'],
          reason: 'targets the n8n running on dev',
          settings: { n8nVersion: '2.38.3' },
        },
        {
          files: ['prod/personal/**'],
          reason: 'targets the n8n running on personal',
          settings: { n8nVersion: '2.38.3' },
        },
      ],
    });
  });

  it("lets an environment pin its own version over the fleet default", async () => {
    const path = await manifest({
      n8nVersion: '2.38.3',
      instances: [{ name: 'legacy', directory: 'prod/legacy', n8nVersion: '2.10.0' }],
    });
    await runFleet(path, {}, deps());
    expect(parse(out).overrides[0].settings).toEqual({ n8nVersion: '2.10.0' });
  });

  it('skips a floating environment rather than asserting a version it cannot know', async () => {
    const path = await manifest({
      n8nVersion: '2.38.3',
      instances: [
        { name: 'dev', directory: 'dev' },
        { name: 'vendor', directory: 'vendor', versionPolicy: 'floating' },
      ],
    });
    await runFleet(path, {}, deps());
    expect(parse(out).overrides).toHaveLength(1);
    // Silence would read as "vendor was checked".
    expect(err).toContain('1 environment skipped');
    expect(err).toContain('vendor');
  });

  it('emits a whole config with --full', async () => {
    const path = await manifest({ n8nVersion: '2.38.3', instances: [{ directory: 'dev' }] });
    await runFleet(path, { full: true }, deps());
    expect(parse(out).extends).toEqual(['workflow-lint:recommended']);
  });

  it('fails when nothing in the manifest carries a version', async () => {
    const path = await manifest({ instances: [{ name: 'dev', directory: 'dev' }] });
    await expect(runFleet(path, {}, deps())).rejects.toThrow(UsageError);
  });

  it('fails on an unreadable manifest rather than emitting an empty config', async () => {
    await expect(runFleet('nope.json', {}, deps())).rejects.toThrow(/could not read/);
  });
});
