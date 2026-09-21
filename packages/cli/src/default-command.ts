import { existsSync } from 'node:fs';

/**
 * Subcommands that must not be mistaken for a path. Everything else in argv
 * position 0 is treated as a path and routed to `lint`, so `workflow-lint dev/` works
 * the way `prettier`/`eslint` do rather than demanding `workflow-lint lint dev/`.
 */
// Every verb must be listed, or the default-command routing below mistakes it
// for a path and hands it to `lint`.
export const COMMANDS = ['lint', 'fmt', 'fleet', 'node-types', 'init', 'rules', 'help'] as const;
const COMMAND_SET = new Set<string>(COMMANDS);

export class UnknownCommandError extends Error {}

/** A bare word, as opposed to something that can only be a path. */
const looksLikeCommand = (arg: string): boolean => /^[a-z][a-z-]*$/i.test(arg);

export function withDefaultCommand(
  argv: string[],
  exists: (path: string) => boolean = existsSync,
): string[] {
  const [node, script, first, ...rest] = argv;
  // No args, a flag (--help, --version), or an explicit subcommand: leave alone.
  if (first === undefined || first.startsWith('-') || COMMAND_SET.has(first)) return argv;
  // A bare word that names nothing on disk is a mistyped command, not a path;
  // "no such file or directory: lnt" would send the reader looking for a file.
  if (looksLikeCommand(first) && !exists(first)) {
    throw new UnknownCommandError(
      `unknown command "${first}" — commands are ${COMMANDS.join(', ')}; anything else is a path to lint, and no file or directory is named "${first}"`,
    );
  }
  return [node!, script!, 'lint', first, ...rest];
}
