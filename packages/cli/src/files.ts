import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { auditSuppressions, type IgnoreMatcher, type UserConfig } from 'workflow-lint-core';
import type { Logger } from './log.js';
import { glob } from 'glob';

/** Files that are JSON but never workflows. */
const IGNORE = [
  '**/node_modules/**',
  '**/package*.json',
  '**/tsconfig*.json',
  '**/*.config.json',
];

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export interface DiscoverOptions {
  /** When false, a path that does not exist is skipped instead of erroring. */
  errorOnUnmatched?: boolean;
  /**
   * Called for each skipped path. Skipping silently would let a malformed
   * file list — a whole newline-separated list arriving as one argument, say —
   * exit 0 having checked nothing, which reads as success.
   */
  onUnmatched?: (path: string) => void;
  /** Config `ignore:` + `.gitignore`, applied to directory scans only. */
  ignore?: IgnoreMatcher;
}

export interface Discovered {
  files: string[];
  /** How many a directory scan dropped, so an over-broad glob is visible. */
  ignored: number;
  /** Files named directly rather than found by a directory scan. */
  explicit: Set<string>;
}

/**
 * Expand the given paths into workflow candidates. A directory contributes its
 * `**\/*.json` minus the ignore list; a file named explicitly is always
 * included, whatever it is called.
 *
 * That asymmetry is the point. A repo-wide run skips gitignored scratch such
 * as `local/`, but `workflow-lint local/thing.json` still lints it — which is how a
 * developer checks a local workflow before promoting it up to `dev/`.
 */
export async function discover(
  paths: string[],
  cwd: string,
  options: DiscoverOptions = {},
): Promise<Discovered> {
  const found = new Set<string>();
  const explicit = new Set<string>();
  let ignored = 0;
  for (const path of paths) {
    const absolute = resolve(cwd, path);
    let stat;
    try {
      stat = statSync(absolute);
    } catch {
      // A pre-commit hook is handed paths deleted in the same commit, so
      // skipping is the difference between a usable hook and a blocked commit.
      if (options.errorOnUnmatched === false) {
        options.onUnmatched?.(path);
        continue;
      }
      throw new UsageError(`no such file or directory: ${path}`);
    }
    if (stat.isFile()) {
      found.add(absolute);
      explicit.add(absolute);
      continue;
    }
    const matches = await glob('**/*.json', {
      cwd: absolute,
      ignore: IGNORE,
      absolute: true,
      nodir: true,
    });
    for (const match of matches) {
      if (options.ignore?.ignores(match)) {
        ignored += 1;
        continue;
      }
      found.add(match);
    }
  }
  return { files: [...found].sort(), ignored, explicit };
}

/**
 * Report how many files the ignore rules dropped, and say how to lint one
 * anyway. Reporting the count is what makes an over-broad `vendor/**` visible;
 * naming the escape hatch is what stops a gitignored `local/` from looking
 * unlintable to whoever — or whatever — reads this output.
 */
export const reportIgnored = (ignored: number, log: Logger): void => {
  if (ignored === 0) return;
  const s = ignored === 1 ? '' : 's';
  log.log(
    `workflow-lint: ${ignored} file${s} ignored (workflow-lint.config ignore + .gitignore).\n` +
      `  Lint one anyway by naming it: workflow-lint path/to/workflow.json\n` +
      `  Lint everything: workflow-lint . --no-ignore\n`,
  );
};

/**
 * Nag, never block. An unreasoned suppression is legal; a standing count is
 * what gets someone to write down why, or to delete an exception that has
 * outlived whatever justified it.
 */
export const reportMissingReasons = (config: UserConfig, log: Logger): void => {
  const { withoutReason, locations } = auditSuppressions(config);
  if (withoutReason === 0) return;
  const s = withoutReason === 1 ? '' : 's';
  log.warn(
    `workflow-lint: ${withoutReason} suppression${s} missing a reason: ${locations.join(', ')}\n` +
      `  Add "reason:" to say why, so the next reader can judge whether it still applies.\n`,
  );
};

/** Tell the user what was skipped, so an empty run is never silent. */
export const reportSkipped = (skipped: string[], log: Logger): void => {
  if (skipped.length === 0) return;
  const what = skipped.length === 1 ? 'path that does not exist' : 'paths that do not exist';
  log.warn(
    `workflow-lint: skipped ${skipped.length} ${what}:\n` + skipped.map((p) => `  ${p}\n`).join(''),
  );
};
