import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { glob } from 'glob';
import { MAX_FIX_PASSES, lint, resolveConfig } from 'workflow-lint-core';
import { buildRegistry } from '../src/index.js';

/**
 * Owner-only calibration suite. The corpus is a private set of reference
 * workflows that is not part of this repository; point WORKFLOW_LINT_CORPUS at its
 * root to run this file. Without it the suite is skipped.
 */
const CORPUS = process.env['WORKFLOW_LINT_CORPUS'] ?? '';
const available = CORPUS !== '' && existsSync(CORPUS);
const SKIPPED = 'corpus not present; owner-only calibration suite';

describe.skipIf(!available)(available ? 'corpus smoke' : 'corpus smoke — ' + SKIPPED, () => {
  it('lints every example workflow without parse errors or exceptions', async () => {
    const files = await glob('*/references/examples/**/*.json', {
      cwd: CORPUS,
      absolute: true,
      nodir: true,
    });
    expect(files.length).toBeGreaterThan(0);

    const registry = buildRegistry();
    const config = resolveConfig(
      { extends: ['workflow-lint:recommended'], settings: { n8nVersion: '2.38.3' } },
      registry,
    );

    const histogram = new Map<string, number>();
    const parseFailures: string[] = [];
    const crashes: string[] = [];
    let findings = 0;

    for (const file of files.sort()) {
      const path = relative(CORPUS, file);
      try {
        const result = await lint({ text: readFileSync(file, 'utf8'), path }, config);
        if (result.parseErrors.length > 0) {
          parseFailures.push(`${path}: ${result.parseErrors.map((e) => e.message).join('; ')}`);
        }
        for (const finding of result.findings) {
          findings += 1;
          histogram.set(finding.ruleId, (histogram.get(finding.ruleId) ?? 0) + 1);
        }
      } catch (error) {
        crashes.push(`${path}: ${(error as Error).message}`);
      }
    }

    const report = [...histogram.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([ruleId, count]) => `  ${String(count).padStart(4)}  ${ruleId}`)
      .join('\n');
    console.log(
      `corpus: ${files.length} workflows, ${findings} findings\n${report}`,
    );

    if (parseFailures.length > 0) console.log(`parse failures:\n${parseFailures.join('\n')}`);
    expect(crashes).toEqual([]);
    expect(parseFailures).toEqual([]);
  }, 180_000);

  it('applying safe fixes is idempotent', async () => {
    const files = await glob('*/references/examples/**/*.json', {
      cwd: CORPUS,
      absolute: true,
      nodir: true,
    });
    const registry = buildRegistry();
    const config = resolveConfig(
      { extends: ['workflow-lint:recommended'], settings: { n8nVersion: '2.38.3' } },
      registry,
    );

    const unstable: string[] = [];
    let fixed = 0;

    for (const file of files.sort()) {
      const path = relative(CORPUS, file);
      const first = await lint({ text: readFileSync(file, 'utf8'), path }, config, { fix: true });
      if (!first.fixedJson) continue;

      const firstText = JSON.stringify(first.fixedJson, null, 2);
      // A fix loop that hits the pass cap never reached a fixpoint.
      if ((first.fixPasses ?? 0) >= MAX_FIX_PASSES) unstable.push(`${path}: hit the pass limit`);

      const second = await lint({ text: firstText, path }, config, { fix: true });
      const secondText = JSON.stringify(second.fixedJson, null, 2);
      if (secondText !== firstText) unstable.push(`${path}: changed again on a second pass`);
      if (firstText !== JSON.stringify(JSON.parse(readFileSync(file, 'utf8')), null, 2)) fixed += 1;
    }

    console.log(`fix idempotency: ${files.length} workflows, ${fixed} changed by --fix`);
    expect(unstable).toEqual([]);
  }, 180_000);
});