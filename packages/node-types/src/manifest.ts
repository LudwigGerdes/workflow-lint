import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import semver from 'semver';
import { dataRoot } from './package-root.js';

/**
 * The per-user cache installed bundles live in:
 * `~/.workflow-lint/node-types/<n8nVersion>/`, overridable with `WORKFLOW_LINT_HOME`.
 *
 * This is the canonical home. Whether the package is used from a checkout or
 * installed as a dependency, a bundle is written here once per machine and read
 * from here by every copy — so a multi-megabyte dataset is not duplicated per
 * project.
 */
export const cacheDir = (): string =>
  join(process.env['WORKFLOW_LINT_HOME'] ?? join(homedir(), '.workflow-lint'), 'node-types');

/**
 * Bundles shipped inside this package, if any. A checkout that commits its
 * `versions/` still works with nothing installed, and `node-types install`
 * seeds the cache from here. Located by {@link dataRoot}, which knows the
 * checkout, tarball and override layouts.
 */
export const packagedDir = (): string => dataRoot();

/**
 * @deprecated Read through {@link versionDir}; a bundle may live in either
 * place. Kept so existing importers keep compiling.
 */
export const VERSIONS_DIR = packagedDir();

/** Searched in order: the shared cache wins, so an installed bundle can be
 * newer than whatever the package happens to ship. */
const searchPath = (): string[] => [cacheDir(), packagedDir()].filter((d) => existsSync(d));

/** Where a version's data actually is, or undefined when it is not available. */
export function versionDir(version: string): string | undefined {
  for (const root of searchPath()) {
    const candidate = join(root, version);
    if (existsSync(join(candidate, 'meta.json'))) return candidate;
  }
  return undefined;
}

export interface PackManifest {
  n8nVersion: string;
  bundledAt: string;
  /**
   * The app→library version manifest: the exact library
   * versions n8n@<n8nVersion> depends on. Absent on bundles created before
   * 2026-09-05 (2.9.0, 2.10.0), where app and library versions coincided.
   */
  libs?: {
    'n8n-workflow': string;
    'n8n-nodes-base': string;
    '@n8n/n8n-nodes-langchain': string;
  };
  sources: { base: string; langchain: string };
}

/** Every available n8n version, from both locations, ascending by semver. */
export function bundledVersions(): string[] {
  const found = new Set<string>();
  for (const root of searchPath()) {
    for (const entry of readdirSync(root)) {
      if (semver.valid(entry) === null) continue;
      if (existsSync(join(root, entry, 'meta.json'))) found.add(entry);
    }
  }
  return [...found].sort(semver.compare);
}

export function readManifest(v: string): PackManifest {
  const dir = versionDir(v);
  if (dir === undefined) {
    throw new Error(
      `no node-type bundle for n8n ${v}. Install one with \`workflow-lint node-types install ${v}\`, ` +
        `or set WORKFLOW_LINT_HOME to a directory that has it.`,
    );
  }
  return JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as PackManifest;
}
