import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from './config.js';
import { lint, type LintOptions } from './runner.js';
import type { LintResult, ResolvedSettings, Rule, Severity, WorkflowJson } from './types.js';

export interface RuleTestCase {
  name?: string;
  /** A workflow literal, or a path to a workflow JSON file. */
  workflow: WorkflowJson | string;
  options?: unknown;
  settings?: ResolvedSettings;
}

export interface ExpectedError {
  messageId: string;
  nodeName?: string;
  data?: Record<string, string | number>;
}

export interface InvalidCase extends RuleTestCase {
  errors: ExpectedError[];
  /** When given, `--fix` must produce exactly this document. */
  output?: WorkflowJson;
}

/** ESLint-style fixture runner; registers vitest describe/it blocks. */
export class RuleTester {
  constructor(private readonly defaults: { settings?: ResolvedSettings } = {}) {}

  private textOf(workflow: WorkflowJson | string): string {
    return typeof workflow === 'string'
      ? readFileSync(workflow, 'utf8')
      : JSON.stringify(workflow, null, 2);
  }

  private async lintCase(
    rule: Rule,
    testCase: RuleTestCase,
    workflow: WorkflowJson | string,
    opts: LintOptions = {},
  ): Promise<LintResult> {
    const severity: Severity =
      rule.meta.docs.recommended === false ? 'warn' : rule.meta.docs.recommended;
    const registry = new Map([[rule.meta.id, rule]]);
    const config = resolveConfig(
      {
        settings: testCase.settings ?? this.defaults.settings ?? {},
        rules: {
          [rule.meta.id]:
            testCase.options !== undefined ? [severity, testCase.options] : severity,
        },
      },
      registry,
    );
    const result = await lint({ text: this.textOf(workflow), path: 'rule-tester.json' }, config, opts);
    expect(result.parseErrors).toEqual([]);
    return result;
  }

  run(rule: Rule, cases: { valid: RuleTestCase[]; invalid: InvalidCase[] }): void {
    describe(rule.meta.id, () => {
      if (cases.valid.length > 0) {
        describe('valid', () => {
          cases.valid.forEach((c, i) => {
            it(c.name ?? `valid #${i + 1}`, async () => {
              const result = await this.lintCase(rule, c, c.workflow);
              expect(result.findings).toEqual([]);
            });
          });
        });
      }

      if (cases.invalid.length > 0) {
        describe('invalid', () => {
          cases.invalid.forEach((c, i) => {
            it(c.name ?? `invalid #${i + 1}`, async () => {
              const result = await this.lintCase(rule, c, c.workflow);
              expect(result.findings.map((f) => f.messageId)).toEqual(
                c.errors.map((e) => e.messageId),
              );
              c.errors.forEach((expected, j) => {
                const actual = result.findings[j]!;
                if (expected.nodeName !== undefined) expect(actual.nodeName).toBe(expected.nodeName);
                if (expected.data !== undefined) expect(actual.data).toMatchObject(expected.data);
              });

              if (c.output !== undefined) {
                const fixed = await this.lintCase(rule, c, c.workflow, {
                  fix: true,
                  // A rule whose fixes are unsafe still has to prove its output.
                  fixUnsafe: rule.meta.fixSafety === 'unsafe',
                });
                expect(fixed.fixedJson).toEqual(c.output);
                // A fix must be complete: the fixed document must lint clean.
                const after = await this.lintCase(rule, c, c.output);
                expect(after.findings).toEqual([]);
              }
            });
          });
        });
      }
    });
  }
}
