import { describe, expect, it } from 'vitest';
import { UnknownCommandError, withDefaultCommand } from '../src/default-command.js';

const argv = (...args: string[]) => ['node', 'workflow-lint', ...args];
const nothingExists = () => false;
const everythingExists = () => true;

describe('withDefaultCommand', () => {
  it('leaves commands, flags and an empty argv alone', () => {
    expect(withDefaultCommand(argv('fmt', 'x.json'), nothingExists)).toEqual(argv('fmt', 'x.json'));
    expect(withDefaultCommand(argv('--version'), nothingExists)).toEqual(argv('--version'));
    expect(withDefaultCommand(argv(), nothingExists)).toEqual(argv());
  });

  it('routes a path to lint', () => {
    expect(withDefaultCommand(argv('workflows/'), nothingExists)).toEqual(argv('lint', 'workflows/'));
    expect(withDefaultCommand(argv('orders.json'), nothingExists)).toEqual(argv('lint', 'orders.json'));
    // A directory whose name is a bare word is still a path when it exists.
    expect(withDefaultCommand(argv('workflows'), everythingExists)).toEqual(argv('lint', 'workflows'));
  });

  it('calls a bare word that names nothing on disk an unknown command', () => {
    expect(() => withDefaultCommand(argv('lnt', 'x.json'), nothingExists)).toThrow(UnknownCommandError);
    expect(() => withDefaultCommand(argv('lnt'), nothingExists)).toThrow(/unknown command "lnt".*lint, fmt/);
  });
});
