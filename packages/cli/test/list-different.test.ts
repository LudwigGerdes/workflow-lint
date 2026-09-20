import { describe, expect, it } from 'vitest';
import type { Finding, LintResult } from 'workflow-lint-core';
import { listDifferent } from '../src/reporters/list.js';

const finding = (over: Partial<Finding> = {}): Finding => ({
  ruleId: 'naming/no-default-node-name',
  severity: 'warn',
  message: 'Node "Edit Fields" still has its default name.',
  messageId: 'defaultName',
  path: 'a.json',
  loc: { line: 1, column: 1 },
  ...over,
});

const result = (path: string, findings: Finding[], parseErrors: [] = []): LintResult => ({
  path,
  findings: findings.map((f) => ({ ...f, path })),
  parseErrors,
});

describe('listDifferent', () => {
  it('lists only files with findings at or above the fail-on level', () => {
    const results = [
      result('error.json', [finding({ severity: 'error' })]),
      result('warn.json', [finding({ severity: 'warn' })]),
      result('info.json', [finding({ severity: 'info' })]),
      result('clean.json', []),
    ];
    expect(listDifferent(results, { failOn: 'warn' })).toBe('error.json\nwarn.json\n');
  });

  it('narrows as the fail-on level rises, so -l tracks the exit code', () => {
    const results = [
      result('error.json', [finding({ severity: 'error' })]),
      result('warn.json', [finding({ severity: 'warn' })]),
    ];
    expect(listDifferent(results, { failOn: 'error' })).toBe('error.json\n');
  });

  it('lists a file that would not parse, since it plainly needs attention', () => {
    const results: LintResult[] = [
      { path: 'broken.json', findings: [], parseErrors: [{ message: 'Unexpected token' }] },
      result('clean.json', []),
    ];
    expect(listDifferent(results, { failOn: 'warn' })).toBe('broken.json\n');
  });

  it('emits nothing at all when every file passes, so the stream stays pipeable', () => {
    expect(listDifferent([result('clean.json', [])], { failOn: 'warn' })).toBe('');
  });

  it('names each file once however many findings it carries', () => {
    const results = [
      result('a.json', [finding({ severity: 'error' }), finding({ severity: 'error' })]),
    ];
    expect(listDifferent(results, { failOn: 'warn' })).toBe('a.json\n');
  });
});
