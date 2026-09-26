import { readFile, writeFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { buildIgnore, readConfig } from 'workflow-lint-core';
import { formatText } from 'workflow-lint-fmt';
import { discover, reportIgnored, reportSkipped, UsageError } from '../files.js';
import { createLogger, DEFAULT_LOG_LEVEL, isLogLevel, LOG_LEVELS } from '../log.js';
import { NOT_A_WORKFLOW, peek } from '../workflow-file.js';

export interface FmtCommandOptions {
  check?: boolean;
  /** Print only the paths that would be reformatted, one per line. */
  listDifferent?: boolean;
  n8nVersion?: string;
  stickies?: boolean;
  errorOnUnmatchedPattern?: boolean;
  /** False when `--no-ignore` is passed. */
  ignore?: boolean;
  /** Diagnostic verbosity: silent, error, warn, log or debug. */
  logLevel?: string;
}

export interface FmtDeps {
  write: (text: string) => void;
  writeErr: (text: string) => void;
  cwd: string;
  readStdin: () => Promise<string>;
}

const STDIN = '<stdin>';

/** Run the fmt command and return the process exit code. */
export async function runFmt(
  paths: string[],
  options: FmtCommandOptions,
  deps: FmtDeps,
): Promise<number> {
  const { cwd } = deps;

  const level = options.logLevel ?? DEFAULT_LOG_LEVEL;
  if (!isLogLevel(level)) {
    throw new UsageError(`unknown --log-level "${level}"; expected one of ${LOG_LEVELS.join(', ')}`);
  }
  const log = createLogger(level, deps.writeErr);

  const targets: Array<{ text: string; path: string; file?: string; explicit: boolean }> = [];
  if (paths.includes('-')) targets.push({ text: await deps.readStdin(), path: STDIN, explicit: true });
  const skipped: string[] = [];
  // fmt reads the same ignore rules as lint. If `lint .` skips a gitignored
  // `local/` but `fmt .` rewrites it, the pair contradict each other.
  const { config } = await readConfig({ cwd });
  const matcher = await buildIgnore({
    root: cwd,
    ...(config.ignore ? { patterns: config.ignore } : {}),
    ...(options.ignore === false ? { gitignore: false } : {}),
  });
  const { files, ignored, explicit } = await discover(
    paths.filter((p) => p !== '-'),
    cwd,
    {
      ...(options.errorOnUnmatchedPattern === false
        ? { errorOnUnmatched: false, onUnmatched: (p: string) => skipped.push(p) }
        : {}),
      ...(options.ignore === false ? {} : { ignore: matcher }),
    },
  );
  for (const file of files) {
    targets.push({
      text: await readFile(file, 'utf8'),
      path: relative(cwd, file) || file,
      file,
      explicit: explicit.has(file),
    });
  }

  reportSkipped(skipped, log);
  reportIgnored(ignored, log);

  const layout = {
    ...(options.n8nVersion !== undefined ? { n8nVersion: options.n8nVersion } : {}),
    ...(options.stickies ? { stickies: true } : {}),
  };

  // `-l` reports without writing, exactly as `--check` does. Prettier's
  // `--list-different` never edits a file, and a CI check that silently
  // rewrote the tree would be a trap.
  const dryRun = options.check === true || options.listDifferent === true;

  const changed: string[] = [];
  let failedToParse = false;

  for (const target of targets) {
    if (!peek(target.text).isWorkflow) {
      // Same rule as lint: a scan skips it, a named file is reported.
      if (target.explicit) {
        failedToParse = true;
        log.error(`${target.path}: ${NOT_A_WORKFLOW}\n`);
      }
      continue;
    }

    const { parseErrors, result } = await formatText(
      { text: target.text, path: target.path },
      layout,
    );
    if (!result) {
      failedToParse = true;
      for (const error of parseErrors) {
        log.error(`${target.path}: ${error.message}\n`);
      }
      continue;
    }

    const formatted = `${JSON.stringify(result.json, null, 2)}\n`;

    if (target.file === undefined) {
      // stdin goes to stdout, unless we are only checking.
      if (!dryRun && !log.silent) deps.write(formatted);
      if (result.changed) changed.push(target.path);
      continue;
    }

    if (!result.changed) continue;
    changed.push(target.path);
    const detail = `${result.moves.length} node${result.moves.length === 1 ? '' : 's'} moved`;
    if (options.listDifferent) {
      // Bare path only. Anything else here would break the pipe.
      if (!log.silent) deps.write(`${target.path}\n`);
    } else if (options.check) {
      if (!log.silent) deps.write(`${target.path}  ${detail}\n`);
    } else {
      await writeFile(target.file, formatted, 'utf8');
      if (!log.silent) deps.write(`formatted ${target.path}  ${detail}\n`);
    }
  }

  if (failedToParse) return 2;
  if (dryRun && changed.length > 0) {
    if (!options.listDifferent && !log.silent) {
      deps.write(
        `\n${changed.length} file${changed.length === 1 ? '' : 's'} would be reformatted\n`,
      );
    }
    return 1;
  }
  return 0;
}
