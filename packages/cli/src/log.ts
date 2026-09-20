/** Diagnostic verbosity, lowest to highest. Prettier's set, same names. */
export const LOG_LEVELS = ['silent', 'error', 'warn', 'log', 'debug'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export const DEFAULT_LOG_LEVEL: LogLevel = 'log';

const RANK: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  log: 3,
  debug: 4,
};

export const isLogLevel = (value: string): value is LogLevel =>
  (LOG_LEVELS as readonly string[]).includes(value);

export interface Logger {
  level: LogLevel;
  /**
   * True only at `silent`, where the findings report is suppressed as well.
   * Every other level gates diagnostics alone — what a run *found* is the
   * business of --quiet, --fail-on and --format, not of verbosity.
   */
  silent: boolean;
  error: (text: string) => void;
  warn: (text: string) => void;
  log: (text: string) => void;
  debug: (text: string) => void;
}

/**
 * Build the diagnostic logger. Everything it emits goes to stderr, so stdout
 * stays a clean stream for `--format json` and `-l` at any level above silent.
 */
export function createLogger(level: LogLevel, writeErr: (text: string) => void): Logger {
  const at = (min: LogLevel) => (text: string) => {
    if (RANK[level] >= RANK[min]) writeErr(text);
  };
  return {
    level,
    silent: level === 'silent',
    error: at('error'),
    warn: at('warn'),
    log: at('log'),
    debug: at('debug'),
  };
}
