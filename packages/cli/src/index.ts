import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { packageRoot } from 'workflow-lint-node-types';
import { runLint, type LintCommandOptions } from './commands/lint.js';
import { runInit } from './commands/init.js';
import { runRules } from './commands/rules.js';
import { runFmt, type FmtCommandOptions } from './commands/fmt.js';
import { runFleet, type FleetOptions } from './commands/fleet.js';
import {
  runNodeTypesDiff,
  runNodeTypesInstall,
  runNodeTypesList,
  type NodeTypesDiffOptions,
  type NodeTypesInstallOptions,
  type NodeTypesListOptions,
} from './commands/node-types.js';
import { ConfigError } from 'workflow-lint-core';
import { UsageError } from './files.js';

export interface CliDeps {
  write?: (text: string) => void;
  writeErr?: (text: string) => void;
  cwd?: string;
  readStdin?: () => Promise<string>;
  setExitCode?: (code: number) => void;
  /** Used only by `node-types install`; injected in tests to keep them offline. */
  fetch?: typeof globalThis.fetch;
}

const defaultStdin = async (): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
};

const collect = (value: string, previous: string[]): string[] => [...previous, value];

/** The package's own version, so `--version` can never advertise a stale literal. */
const packageVersion = (): string =>
  (
    JSON.parse(readFileSync(join(packageRoot(import.meta.url), 'package.json'), 'utf8')) as {
      version: string;
    }
  ).version;

/**
 * Build the CLI. Every side effect arrives through `deps`, so tests drive the
 * whole program without touching the real stdout or process exit code.
 */
export function buildProgram(deps: CliDeps = {}): Command {
  const write = deps.write ?? ((t: string) => void process.stdout.write(t));
  const writeErr = deps.writeErr ?? ((t: string) => void process.stderr.write(t));
  const cwd = deps.cwd ?? process.cwd();
  const readStdin = deps.readStdin ?? defaultStdin;
  const setExitCode =
    deps.setExitCode ??
    ((code: number) => {
      process.exitCode = code;
    });

  const program = new Command();
  program
    .name('workflow-lint')
    .description('Semantic linter for n8n workflow JSON')
    .version(packageVersion(), '-V, --version', 'print the workflow-lint version')
    .exitOverride()
    .configureOutput({ writeOut: write, writeErr });

  program
    .command('lint')
    .description('Lint workflow JSON files')
    .argument('[paths...]', 'files or directories to lint; "-" reads stdin', ['.'])
    .option('--config <path>', 'path to a config file')
    .option('--format <format>', 'stylish, json, sarif, junit, github-actions or canvas-overlay', 'stylish')
    .option('--fail-on <level>', 'lowest severity that fails the run', 'error')
    .option('--n8n-version <version>', 'n8n version to lint against')
    .option('--fix', 'apply safe fixes in place')
    .option('--fix-unsafe', 'also apply fixes marked unsafe')
    .option('--fix-type <types>', 'limit --fix to these kinds: params, layout, connections')
    .option('--require-fixable-clean', 'fail when a finding remains that --fix could resolve')
    .option('--rule <id>', 'run only this rule (repeatable)', collect, [])
    .option('--class <class>', 'run only rules of this class: stylistic or quality')
    .option('--fail-on-stylistic', 'let stylistic findings fail the run')
    .option('-l, --list-different', 'print only the paths of files that fail the run')
    .option('--log-level <level>', 'silent, error, warn, log or debug', 'log')
    .option('--quiet', 'report errors only')
    .option('--max-warnings <n>', 'fail when warnings exceed this count')
    .option('--gen-baseline', 'record current findings as the accepted baseline')
    .option('--ignore-baseline', 'report every finding, baselined or not')
    .option('--baseline <path>', 'baseline file to use')
    .option('--no-ignore', 'lint ignored files too (config ignore + .gitignore)')
    .option('--no-inline-config', 'do not apply workflow-lint-disable directives in notes and sticky notes')
    .option('--no-error-on-unmatched-pattern', 'skip paths that do not exist')
    .exitOverride()
    .configureOutput({ writeOut: write, writeErr })
    .action(async (paths: string[], options: LintCommandOptions) => {
      try {
        setExitCode(await runLint(paths, options, { write, writeErr, cwd, readStdin }));
      } catch (error) {
        if (error instanceof UsageError || error instanceof ConfigError) {
          if (options.logLevel !== 'silent') writeErr(`workflow-lint: ${error.message}\n`);
          setExitCode(2);
          return;
        }
        throw error;
      }
    });

  program
    .command('fmt')
    .description('Format workflow layout')
    .argument('[paths...]', 'files or directories to format; "-" reads stdin', ['.'])
    .option('--check', 'report what would change without writing')
    .option('-l, --list-different', 'print only the paths that would be reformatted')
    .option('--log-level <level>', 'silent, error, warn, log or debug', 'log')
    .option('--n8n-version <version>', 'n8n version to resolve node types against')
    .option('--stickies', 'also resize sticky notes around their nodes')
    .option('--no-ignore', 'format ignored files too (config ignore + .gitignore)')
    .option('--no-error-on-unmatched-pattern', 'skip paths that do not exist')
    .exitOverride()
    .configureOutput({ writeOut: write, writeErr })
    .action(async (paths: string[], options: FmtCommandOptions) => {
      try {
        setExitCode(await runFmt(paths, options, { write, writeErr, cwd, readStdin }));
      } catch (error) {
        if (error instanceof UsageError || error instanceof ConfigError) {
          if (options.logLevel !== 'silent') writeErr(`workflow-lint: ${error.message}\n`);
          setExitCode(2);
          return;
        }
        throw error;
      }
    });

  const nodeTypes = program
    .command('node-types')
    .description('Inspect the bundled n8n node descriptions')
    .exitOverride()
    .configureOutput({ writeOut: write, writeErr });

  nodeTypes
    .command('list')
    .description('List bundled n8n versions')
    .option('--json', 'output as JSON')
    .exitOverride()
    .configureOutput({ writeOut: write, writeErr })
    .action((options: NodeTypesListOptions) => {
      setExitCode(runNodeTypesList({ write }, options));
    });

  nodeTypes
    .command('install')
    .description('Install a version into the ~/.workflow-lint cache, downloading it from npm if it is not shipped')
    .argument('<version>', 'n8n version to install')
    .option('--force', 'overwrite a version already in the cache')
    .exitOverride()
    .configureOutput({ writeOut: write, writeErr })
    .action(async (version: string, options: NodeTypesInstallOptions) => {
      try {
        setExitCode(
          await runNodeTypesInstall(version, options, { write, ...(deps.fetch ? { fetch: deps.fetch } : {}) }),
        );
      } catch (error) {
        if (error instanceof UsageError) {
          writeErr(`workflow-lint: ${error.message}\n`);
          setExitCode(2);
          return;
        }
        throw error;
      }
    });

  nodeTypes
    .command('diff')
    .description('Compare two installed versions (rename detection is out of scope)')
    .argument('<a>', 'earlier bundled version')
    .argument('<b>', 'later bundled version')
    .option('--format <format>', 'text, md or json', 'text')
    .option('--only <nodeType>', 'limit to these node types (repeatable)', collect, [])
    .option(
      '--ignore-generated-defaults',
      'hide date defaults that are regenerated on every bundle build',
    )
    .exitOverride()
    .configureOutput({ writeOut: write, writeErr })
    .action(async (a: string, b: string, options: NodeTypesDiffOptions) => {
      try {
        setExitCode(await runNodeTypesDiff(a, b, options, { write }));
      } catch (error) {
        if (error instanceof UsageError) {
          // node-types has no --log-level; it is an inspection command, not
          // something a hook or CI job runs.
          writeErr(`workflow-lint: ${error.message}\n`);
          setExitCode(2);
          return;
        }
        throw error;
      }
    });

  program
    .command('fleet')
    .description('Derive per-directory n8n version overrides from a fleet manifest')
    .argument('<manifest>', 'JSON manifest naming each environment directory and its n8n version')
    .option('--full', 'emit a complete config rather than only the overrides block')
    .exitOverride()
    .configureOutput({ writeOut: write, writeErr })
    .action(async (manifest: string, options: FleetOptions) => {
      try {
        setExitCode(await runFleet(manifest, options, { write, writeErr, cwd }));
      } catch (error) {
        if (error instanceof UsageError) {
          writeErr(`workflow-lint: ${error.message}\n`);
          setExitCode(2);
          return;
        }
        throw error;
      }
    });

  program
    .command('init')
    .description('Write a starter workflow-lint.config.yaml')
    .exitOverride()
    .configureOutput({ writeOut: write, writeErr })
    .action(async () => {
      setExitCode(await runInit({ write, writeErr, cwd }));
    });

  program
    .command('rules')
    .description('List every available rule')
    .option('--json', 'output as JSON')
    .option('-c, --config <path>', 'config file whose plugins to include')
    .exitOverride()
    .configureOutput({ writeOut: write, writeErr })
    .action(async (options: { json?: boolean; config?: string }) => {
      try {
        setExitCode(await runRules(options, { write, cwd }));
      } catch (error) {
        if (error instanceof ConfigError) {
          writeErr(`workflow-lint: ${error.message}\n`);
          setExitCode(2);
          return;
        }
        throw error;
      }
    });

  return program;
}

export { runLint, buildRegistry } from './commands/lint.js';
export { runInit, CONFIG_FILE } from './commands/init.js';
export { runRules } from './commands/rules.js';
export { runFmt } from './commands/fmt.js';
export { runFleet, type FleetManifest } from './commands/fleet.js';
export { runNodeTypesDiff, runNodeTypesList, runNodeTypesInstall } from './commands/node-types.js';
export { peek } from './workflow-file.js';
export { stylish } from './reporters/stylish.js';
export { json } from './reporters/json.js';
export { sarif } from './reporters/sarif.js';
export { junit } from './reporters/junit.js';
export { githubActions } from './reporters/github-actions.js';
export { canvasOverlay, type CanvasOverlay } from './reporters/canvas-overlay.js';
export { listDifferent } from './reporters/list.js';
export { summarise, type Summary } from './reporters/summary.js';
export { createLogger, isLogLevel, LOG_LEVELS, type LogLevel, type Logger } from './log.js';
export { UsageError } from './files.js';
