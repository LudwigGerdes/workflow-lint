#!/usr/bin/env node
import { CommanderError } from 'commander';
import { buildProgram } from './index.js';

/**
 * Subcommands that must not be mistaken for a path. Everything else in argv
 * position 0 is treated as a path and routed to `lint`, so `workflow-lint dev/` works
 * the way `prettier`/`eslint` do rather than demanding `workflow-lint lint dev/`.
 */
// Every verb must be listed, or the default-command routing below mistakes it
// for a path and hands it to `lint`.
const COMMANDS = new Set(['lint', 'fmt', 'fleet', 'node-types', 'init', 'rules', 'help']);

function withDefaultCommand(argv: string[]): string[] {
  const [node, script, first, ...rest] = argv;
  // No args, a flag (--help, --version), or an explicit subcommand: leave alone.
  if (first === undefined || first.startsWith('-') || COMMANDS.has(first)) return argv;
  return [node!, script!, 'lint', first, ...rest];
}

try {
  await buildProgram().parseAsync(withDefaultCommand(process.argv));
} catch (error) {
  // exitOverride turns commander's own exits into throws; --help and
  // --version are successful exits, anything else is a usage error.
  if (error instanceof CommanderError) {
    process.exitCode = error.exitCode === 0 ? 0 : 2;
  } else {
    process.stderr.write(`workflow-lint: ${(error as Error).message}\n`);
    process.exitCode = 2;
  }
}
