import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import ignoreFactory from 'ignore';
import type { IgnoreEntry, UserConfig } from './types.js';

/**
 * Skipped whatever the config says. A workflow under `node_modules` is a
 * dependency's fixture, never this repository's.
 */
const ALWAYS = ['node_modules/'];

/** The gitignore file consulted, matching prettier: the one at the root only. */
const GITIGNORE = '.gitignore';

export const ignorePath = (entry: IgnoreEntry): string =>
  typeof entry === 'string' ? entry : entry.path;

export const ignoreReason = (entry: IgnoreEntry): string | undefined =>
  typeof entry === 'string' ? undefined : entry.reason;

export interface IgnoreMatcher {
  /**
   * True when a path found by expanding a directory should be skipped. A file
   * the user named explicitly never reaches this — see `discover`.
   */
  ignores(absolutePath: string): boolean;
}

export interface BuildIgnoreOptions {
  /** Directory the patterns and `.gitignore` are relative to. */
  root: string;
  /** The config's `ignore:` list. */
  patterns?: IgnoreEntry[];
  /** Consult `<root>/.gitignore`. Default true; `--no-ignore` sets false. */
  gitignore?: boolean;
}

/**
 * Build the skip matcher for a run.
 *
 * `.gitignore` is honoured by default because a repository's gitignored
 * directories — `local/` above all — are per-developer scratch that a
 * repo-wide lint has no business reporting on. Naming such a file explicitly
 * still lints it, which is the only way `local/` gets checked before it is
 * promoted up to `dev/`.
 */
export async function buildIgnore(options: BuildIgnoreOptions): Promise<IgnoreMatcher> {
  const { root, patterns = [], gitignore = true } = options;
  const ig = ignoreFactory().add(ALWAYS).add(patterns.map(ignorePath));

  if (gitignore) {
    try {
      ig.add(await readFile(join(root, GITIGNORE), 'utf8'));
    } catch {
      // No .gitignore is the common case outside a repo, not an error.
    }
  }

  return {
    ignores(absolutePath: string): boolean {
      const rel = relative(root, absolutePath);
      // `..` means the path sits outside the root, where our patterns — and
      // the repo's .gitignore — carry no authority.
      if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return false;
      return ig.ignores(rel.split(sep).join('/'));
    },
  };
}

export interface SuppressionAudit {
  /** Every ignore entry plus every override that turns something off. */
  total: number;
  withoutReason: number;
  /** Config paths of the unreasoned ones, e.g. `overrides[0]`. */
  locations: string[];
}

const turnsSomethingOff = (override: NonNullable<UserConfig['overrides']>[number]): boolean => {
  const offInRules = Object.values(override.rules ?? {}).some(
    (v) => (Array.isArray(v) ? v[0] : v) === 'off',
  );
  const offInDepts = Object.values(override.departments ?? {}).includes('off');
  return offInRules || offInDepts;
};

/**
 * Count suppressions lacking a `reason`. Reasons are never required — an
 * unreasoned suppression must not fail a run — but a standing count is what
 * makes a stale exception visible a year later, when nobody remembers why
 * `vendor/**` stopped being linted.
 *
 * Only suppressions count. An override that *raises* severity needs no excuse.
 */
export function auditSuppressions(config: UserConfig): SuppressionAudit {
  const locations: string[] = [];
  let total = 0;

  (config.ignore ?? []).forEach((entry, i) => {
    total += 1;
    if (!ignoreReason(entry)) locations.push(`ignore[${i}]`);
  });

  (config.overrides ?? []).forEach((override, i) => {
    if (!turnsSomethingOff(override)) return;
    total += 1;
    if (!override.reason) locations.push(`overrides[${i}]`);
  });

  return { total, withoutReason: locations.length, locations };
}
