import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { auditSuppressions, buildIgnore, ignorePath, ignoreReason } from '../src/ignore.js';
import type { UserConfig } from '../src/types.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'workflow-lint-ignore-'));
});

describe('buildIgnore', () => {
  it('skips paths matching a config ignore pattern', async () => {
    const m = await buildIgnore({ root, patterns: ['vendor/**', '**/*.generated.json'] });
    expect(m.ignores(join(root, 'vendor/acme.json'))).toBe(true);
    expect(m.ignores(join(root, 'dev/a.generated.json'))).toBe(true);
    expect(m.ignores(join(root, 'dev/a.json'))).toBe(false);
  });

  it('always skips node_modules even with no config at all', async () => {
    const m = await buildIgnore({ root });
    expect(m.ignores(join(root, 'node_modules/pkg/w.json'))).toBe(true);
  });

  it('honours .gitignore, which is how local/ stays out of fleet-wide runs', async () => {
    await writeFile(join(root, '.gitignore'), 'local/\n');
    await mkdir(join(root, 'local'), { recursive: true });
    const m = await buildIgnore({ root });
    expect(m.ignores(join(root, 'local/scratch.json'))).toBe(true);
    expect(m.ignores(join(root, 'dev/scratch.json'))).toBe(false);
  });

  it('supports gitignore negation, so an exception re-includes a file', async () => {
    await writeFile(join(root, '.gitignore'), 'local/*\n!local/keep.json\n');
    const m = await buildIgnore({ root });
    expect(m.ignores(join(root, 'local/scratch.json'))).toBe(true);
    expect(m.ignores(join(root, 'local/keep.json'))).toBe(false);
  });

  it("keeps git's rule that negation cannot escape an excluded directory", async () => {
    // `local/` excludes the directory itself, so git never walks into it and
    // the negation below is dead. Writing `local/*` is what makes it work.
    await writeFile(join(root, '.gitignore'), 'local/\n!local/keep.json\n');
    const m = await buildIgnore({ root });
    expect(m.ignores(join(root, 'local/keep.json'))).toBe(true);
  });

  it('ignores .gitignore when gitignore is disabled (--no-ignore)', async () => {
    await writeFile(join(root, '.gitignore'), 'local/\n');
    const m = await buildIgnore({ root, gitignore: false });
    expect(m.ignores(join(root, 'local/scratch.json'))).toBe(false);
  });

  it('never ignores a path outside the root', async () => {
    const m = await buildIgnore({ root, patterns: ['**'] });
    expect(m.ignores('/elsewhere/w.json')).toBe(false);
  });

  it('accepts the object form so an ignore entry can carry a reason', async () => {
    const m = await buildIgnore({
      root,
      patterns: [{ path: 'legacy/**', reason: 'frozen until the Q4 migration' }],
    });
    expect(m.ignores(join(root, 'legacy/old.json'))).toBe(true);
  });
});

describe('ignorePath / ignoreReason', () => {
  it('reads both entry forms', () => {
    expect(ignorePath('vendor/**')).toBe('vendor/**');
    expect(ignoreReason('vendor/**')).toBeUndefined();
    expect(ignorePath({ path: 'legacy/**', reason: 'frozen' })).toBe('legacy/**');
    expect(ignoreReason({ path: 'legacy/**', reason: 'frozen' })).toBe('frozen');
  });
});

describe('auditSuppressions', () => {
  it('counts suppressions that carry no reason', () => {
    const config: UserConfig = {
      ignore: ['vendor/**', { path: 'legacy/**', reason: 'frozen' }],
      overrides: [
        { files: ['sandbox/**'], rules: { 'hygiene/no-placeholder-url': 'off' } },
        {
          files: ['dev/**'],
          reason: 'shared staging tolerates warnings',
          departments: { style: 'off' },
        },
      ],
    };
    const audit = auditSuppressions(config);
    expect(audit.total).toBe(4);
    expect(audit.withoutReason).toBe(2);
    expect(audit.locations).toEqual(['ignore[0]', 'overrides[0]']);
  });

  it('does not count an override that only raises severity', () => {
    const config: UserConfig = {
      overrides: [{ files: ['prod/**'], rules: { 'hygiene/no-placeholder-url': 'error' } }],
    };
    expect(auditSuppressions(config).total).toBe(0);
  });

  it('reports nothing for a config with no suppressions', () => {
    expect(auditSuppressions({})).toEqual({ total: 0, withoutReason: 0, locations: [] });
  });
});
