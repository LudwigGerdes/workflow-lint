import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  bundledVersions,
  cacheDir,
  packagedDir,
  versionDir,
  diffEntries,
  fetchBundle,
  formatDiff,
  type FetchBundleOptions,
  loadEntries,
  type DiffFormat,
} from 'workflow-lint-node-types';
import { UsageError } from '../files.js';

export interface NodeTypesDeps {
  write: (text: string) => void;
  /** Injected in tests so `install` never reaches the real registry. */
  fetch?: FetchBundleOptions['fetch'];
}

const FORMATS: DiffFormat[] = ['text', 'md', 'json'];

export interface NodeTypesListOptions {
  json?: boolean;
}

/**
 * List the bundled versions, marking the latest with an asterisk for a human.
 *
 * With --json the marker becomes structure rather than punctuation, so a
 * consumer discovering which bundles exist does not have to strip a `*` off
 * the last line (invariant I4: machine output on informational verbs).
 */
export function runNodeTypesList(
  deps: NodeTypesDeps,
  options: NodeTypesListOptions = {},
): number {
  const versions = bundledVersions();
  const latest = versions.at(-1) ?? null;

  if (options.json) {
    // `dirs` says where each bundle was found (the per-user cache or the copy
    // shipped in the package), which is what answers "which data am I using?".
    const dirs = Object.fromEntries(versions.map((v) => [v, versionDir(v) ?? null]));
    deps.write(`${JSON.stringify({ versions, latest, dirs }, null, 2)}\n`);
    return 0;
  }

  deps.write(`${versions.map((v) => (v === latest ? `${v}*` : v)).join('\n')}\n`);
  return 0;
}

export interface NodeTypesDiffOptions {
  format?: string;
  only?: string[];
  ignoreGeneratedDefaults?: boolean;
}

/**
 * Compare two available versions. Both must already be shipped or installed:
 * this command is offline like everything else, so it never fetches.
 */
export async function runNodeTypesDiff(
  a: string,
  b: string,
  options: NodeTypesDiffOptions,
  deps: NodeTypesDeps,
): Promise<number> {
  const bundled = bundledVersions();
  for (const version of [a, b]) {
    if (!bundled.includes(version)) {
      throw new UsageError(
        `n8n ${version} is not installed; available versions are ${bundled.join(', ')}. ` +
          `Install it with \`workflow-lint node-types install ${version}\`.`,
      );
    }
  }

  const format = (options.format ?? 'text') as DiffFormat;
  if (!FORMATS.includes(format)) {
    throw new UsageError(`unknown format "${options.format}"; expected one of ${FORMATS.join(', ')}`);
  }

  const [entriesA, entriesB] = await Promise.all([loadEntries(a), loadEntries(b)]);
  const diff = diffEntries(entriesA, entriesB, { a, b }, {
    ...(options.ignoreGeneratedDefaults ? { ignoreGeneratedDefaults: true } : {}),
  });

  const only = options.only ?? [];
  if (only.length > 0) {
    // Match a full name, or a short name against the part after the last dot.
    const wanted = new Set(only);
    diff.changes = diff.changes.filter(
      (change) => wanted.has(change.nodeType) || wanted.has(change.nodeType.split('.').pop()!),
    );
  }

  deps.write(formatDiff(diff, format));
  // A diff is information, not a failure.
  return 0;
}

export interface NodeTypesInstallOptions {
  /** Overwrite a version already present in the cache. */
  force?: boolean;
}

/**
 * Put a version into the per-user cache.
 *
 * The version the package ships is copied, which needs no network. Any other
 * version is downloaded from the npm registry — the one command in workflow-lint
 * that goes online, and only because it was asked to.
 */
export async function runNodeTypesInstall(
  version: string,
  options: NodeTypesInstallOptions,
  deps: NodeTypesDeps,
): Promise<number> {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new UsageError(`"${version}" is not an n8n version (expected something like 2.38.3)`);
  }
  const to = join(cacheDir(), version);
  if (existsSync(join(to, 'meta.json')) && options.force !== true) {
    deps.write(`n8n ${version} is already installed at ${to}\n`);
    return 0;
  }

  const from = join(packagedDir(), version);
  if (existsSync(join(from, 'meta.json'))) {
    await mkdir(to, { recursive: true });
    for (const file of await readdir(from)) {
      await copyFile(join(from, file), join(to, file));
    }
    deps.write(`Installed n8n ${version} node types to ${to}\n`);
    return 0;
  }

  deps.write(`Downloading n8n ${version} node types from the npm registry...\n`);
  try {
    await fetchBundle(version, cacheDir(), deps.fetch ? { fetch: deps.fetch } : {});
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
  deps.write(`Installed n8n ${version} node types to ${to}\n`);
  return 0;
}
