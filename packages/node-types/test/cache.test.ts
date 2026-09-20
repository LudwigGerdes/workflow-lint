import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bundledVersions, cacheDir, readManifest, versionDir } from '../src/manifest.js';

let home: string;
let saved: string | undefined;

// Every export reads the environment on each call, so a static import is
// enough — there is no resolved-once state to work around.
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'workflow-lint-home-'));
  saved = process.env['WORKFLOW_LINT_HOME'];
  process.env['WORKFLOW_LINT_HOME'] = home;
});

afterEach(() => {
  if (saved === undefined) delete process.env['WORKFLOW_LINT_HOME'];
  else process.env['WORKFLOW_LINT_HOME'] = saved;
});

const seedCache = async (version: string): Promise<void> => {
  const dir = join(home, 'node-types', version);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'meta.json'),
    JSON.stringify({ n8nVersion: version, bundledAt: 'x', sources: { base: '', langchain: '' } }),
    'utf8',
  );
  await writeFile(join(dir, 'base.json'), '[]', 'utf8');
  await writeFile(join(dir, 'langchain.json'), '[]', 'utf8');
};

describe('per-user cache', () => {
  it('honours WORKFLOW_LINT_HOME', async () => {
    expect(cacheDir()).toBe(join(home, 'node-types'));
  });

  it('finds a version that exists only in the cache', async () => {
    await seedCache('9.9.9');
    expect(bundledVersions()).toContain('9.9.9');
    expect(versionDir('9.9.9')).toBe(join(home, 'node-types', '9.9.9'));
  });

  it('still finds versions shipped inside the package', async () => {
    // The committed bundles remain available with nothing installed, which is
    // what keeps a fresh checkout working offline.
    expect(bundledVersions().length).toBeGreaterThan(0);
  });

  it('prefers the cache over the packaged copy for the same version', async () => {
    const shipped = bundledVersions().find((v) => v !== '9.9.9');
    expect(shipped).toBeDefined();
    await seedCache(shipped!);
    expect(versionDir(shipped!)).toBe(join(home, 'node-types', shipped!));
  });

  it('says how to fix a missing bundle rather than failing obscurely', async () => {
    expect(() => readManifest('0.0.1')).toThrow(/node-types install 0\.0\.1/);
  });

  it('ignores a cache entry with no meta.json', async () => {
    await mkdir(join(home, 'node-types', '8.8.8'), { recursive: true });
    expect(bundledVersions()).not.toContain('8.8.8');
  });
});
