import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { dataRoot, packageRoot } from '../src/package-root.js';
import { packagedDir, versionDir } from '../src/manifest.js';

const HERE = resolve(__dirname, '..');

afterEach(() => {
  delete process.env['WORKFLOW_LINT_DATA_DIR'];
});

describe('packageRoot', () => {
  it('finds the nearest package.json above a file URL, however deep', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wl-root-'));
    try {
      mkdirSync(join(tmp, 'pkg/dist/chunks'), { recursive: true });
      writeFileSync(join(tmp, 'pkg/package.json'), '{}');
      const from = pathToFileURL(join(tmp, 'pkg/dist/chunks/chunk-ABC.js')).href;
      expect(packageRoot(from)).toBe(join(tmp, 'pkg'));
      expect(packageRoot(join(tmp, 'pkg/dist/bin.js'))).toBe(join(tmp, 'pkg'));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('dataRoot', () => {
  it('is this package’s versions/ in a workspace checkout', () => {
    expect(dataRoot()).toBe(join(HERE, 'versions'));
    expect(packagedDir()).toBe(dataRoot());
  });

  it('honours WORKFLOW_LINT_DATA_DIR, and lookups follow it', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wl-data-'));
    try {
      mkdirSync(join(tmp, '9.9.9'));
      writeFileSync(join(tmp, '9.9.9/meta.json'), '{}');
      process.env['WORKFLOW_LINT_DATA_DIR'] = tmp;
      process.env['WORKFLOW_LINT_HOME'] = join(tmp, 'no-cache-here');
      expect(dataRoot()).toBe(tmp);
      expect(versionDir('9.9.9')).toBe(join(tmp, '9.9.9'));
      expect(versionDir('2.38.3')).toBeUndefined();
    } finally {
      delete process.env['WORKFLOW_LINT_HOME'];
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
