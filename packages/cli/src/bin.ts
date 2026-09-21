#!/usr/bin/env node
import { CommanderError } from 'commander';
import { withDefaultCommand } from './default-command.js';
import { buildProgram } from './index.js';

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
