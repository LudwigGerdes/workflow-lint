import { describe, expect, it } from 'vitest';
import { createLogger, isLogLevel, LOG_LEVELS } from '../src/log.js';

const collect = (level: Parameters<typeof createLogger>[0]) => {
  const lines: string[] = [];
  const log = createLogger(level, (t) => lines.push(t));
  log.error('E\n');
  log.warn('W\n');
  log.log('L\n');
  log.debug('D\n');
  return lines.join('');
};

describe('createLogger', () => {
  it('passes everything at debug', () => {
    expect(collect('debug')).toBe('E\nW\nL\nD\n');
  });

  it('drops debug at the default level', () => {
    expect(collect('log')).toBe('E\nW\nL\n');
  });

  it('keeps only errors and warnings at warn', () => {
    expect(collect('warn')).toBe('E\nW\n');
  });

  it('keeps only errors at error', () => {
    expect(collect('error')).toBe('E\n');
  });

  it('emits nothing at silent', () => {
    expect(collect('silent')).toBe('');
  });

  it('flags silent, which is what suppresses the findings report too', () => {
    expect(createLogger('silent', () => {}).silent).toBe(true);
    expect(createLogger('error', () => {}).silent).toBe(false);
  });
});

describe('isLogLevel', () => {
  it('accepts every documented level', () => {
    for (const level of LOG_LEVELS) expect(isLogLevel(level)).toBe(true);
  });

  it('rejects anything else, so a typo is a usage error not a silent default', () => {
    expect(isLogLevel('verbose')).toBe(false);
    expect(isLogLevel('')).toBe(false);
    expect(isLogLevel('DEBUG')).toBe(false);
  });
});
