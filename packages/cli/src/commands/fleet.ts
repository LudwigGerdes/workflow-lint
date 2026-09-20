import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stringify } from 'yaml';
import { UsageError } from '../files.js';

/**
 * The manifest shape this command consumes: a JSON object with an optional
 * default `n8nVersion` and an `instances` array, each entry naming an
 * environment (`name`), the `directory` holding its workflows, and optionally
 * its own `n8nVersion`. Extra fields are ignored, so a deployment manifest
 * that already carries these keys can be passed in as-is, and workflow-lint knows
 * nothing about whatever tool produced it.
 */
export interface FleetManifest {
  n8nVersion?: string;
  instances?: Array<{
    name?: string;
    directory?: string;
    n8nVersion?: string;
    versionPolicy?: string;
  }>;
}

export interface FleetDeps {
  write: (text: string) => void;
  writeErr: (text: string) => void;
  cwd: string;
}

export interface FleetOptions {
  /** Emit the whole config rather than only the overrides block. */
  full?: boolean;
}

/**
 * Turn a fleet manifest into per-directory `overrides`, so each environment is
 * linted against the n8n it actually runs.
 *
 * This exists because a single repo-wide `settings.n8nVersion` cannot describe
 * a fleet: the same workflow legitimately lives in several directories at
 * different versions, and that divergence is the system working. Checking
 * `prod/personal/invoice.json` against dev's n8n would report drift that is
 * not there, and miss drift that is.
 *
 * An environment pinned to a floating version is skipped rather than guessed:
 * nothing is known about its version, so asserting one would be a lie.
 */
export async function runFleet(
  manifestPath: string,
  options: FleetOptions,
  deps: FleetDeps,
): Promise<number> {
  const path = resolve(deps.cwd, manifestPath);
  let manifest: FleetManifest;
  try {
    manifest = JSON.parse(await readFile(path, 'utf8')) as FleetManifest;
  } catch (error) {
    throw new UsageError(
      `could not read fleet manifest ${manifestPath}: ${(error as Error).message}`,
    );
  }

  const fallback = manifest.n8nVersion;
  const overrides: Array<Record<string, unknown>> = [];
  const skipped: string[] = [];

  for (const instance of manifest.instances ?? []) {
    const directory = instance.directory;
    if (directory === undefined || directory === '') continue;
    if (instance.versionPolicy === 'floating') {
      skipped.push(instance.name ?? directory);
      continue;
    }
    const version = instance.n8nVersion ?? fallback;
    if (version === undefined) {
      skipped.push(instance.name ?? directory);
      continue;
    }
    overrides.push({
      files: [`${directory.replace(/\/+$/, '')}/**`],
      reason: `targets the n8n running on ${instance.name ?? directory}`,
      settings: { n8nVersion: version },
    });
  }

  if (overrides.length === 0) {
    throw new UsageError(`no environment in ${manifestPath} declares a directory and a version`);
  }

  deps.write(stringify(options.full ? { extends: ['workflow-lint:recommended'], overrides } : { overrides }));

  if (skipped.length > 0) {
    // Silence here would look like these environments were checked.
    deps.writeErr(
      `workflow-lint: ${skipped.length} environment${skipped.length === 1 ? '' : 's'} skipped, with no known version: ${skipped.join(', ')}\n`,
    );
  }
  return 0;
}
