import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';
import {
  applyBaseline,
  baselineKey,
  generateBaseline,
  lint,
  parseBaseline,
  resolveConfig,
  serializeBaseline,
  type Baseline,
  type LintResult,
} from 'workflow-lint-core';
import { buildRegistry } from '../src/index.js';

/**
 * Owner-only calibration suite. The corpus is a private set of reference
 * workflows that is not part of this repository; point WORKFLOW_LINT_CORPUS at its
 * root to run this file. Without it the suite is skipped.
 */
const CORPUS = process.env['WORKFLOW_LINT_CORPUS'] ?? '';
const available = CORPUS !== '' && existsSync(CORPUS);
const SKIPPED = 'corpus not present; owner-only calibration suite';
const BASELINE = fileURLToPath(new URL('./fixtures/corpus-baseline.yaml', import.meta.url));

/**
 * The corpus golden gate.
 *
 * The 64 curated example workflows do not lint clean, and should not: an
 * example legitimately has no retry policy, uses placeholder endpoints, and
 * leaves nodes at their default names. What must not happen is a rule
 * silently starting to fire somewhere new, or quietly stopping.
 *
 * So the gate is a committed baseline of exactly today's findings. Adding a
 * rule, or changing one's reach, changes this file — and that diff is the
 * thing to review. Regenerate deliberately, never to make CI green:
 *
 *   UPDATE_CORPUS_BASELINE=1 pnpm --filter workflow-lint test corpus.golden
 */
const config = resolveConfig(
  // Pinned: without a version, typeversion-policy collapses its findings into
  // one note per workflow and the baseline would depend on that.
  { extends: ['workflow-lint:recommended'], settings: { n8nVersion: '2.38.3' } },
  buildRegistry(),
);

const lintAll = async (): Promise<LintResult[]> => {
  const files = (
    await glob('*/references/examples/**/*.json', { cwd: CORPUS, absolute: true, nodir: true })
  ).sort();
  const results: LintResult[] = [];
  for (const file of files) {
    results.push(
      await lint({ text: readFileSync(file, 'utf8'), path: relative(CORPUS, file) }, config),
    );
  }
  return results;
};

describe.skipIf(!available)(available ? 'corpus golden gate' : 'corpus golden gate — ' + SKIPPED, () => {
  it('produces no finding outside the committed baseline', async () => {
    const results = await lintAll();

    if (process.env['UPDATE_CORPUS_BASELINE'] === '1') {
      const regenerated = generateBaseline(results, (r) => r.path);
      mkdirSync(dirname(BASELINE), { recursive: true });
      writeFileSync(BASELINE, serializeBaseline(regenerated), 'utf8');
      const total = Object.values(regenerated.entries).reduce((a, b) => a + b, 0);
      console.log(`regenerated corpus baseline: ${total} findings`);
    }

    const baseline = parseBaseline(readFileSync(BASELINE, 'utf8')) as Baseline;

    const surviving: string[] = [];
    for (const result of results) {
      const remaining = applyBaseline(result, baseline, result.path);
      for (const finding of remaining.findings) {
        surviving.push(`${result.path}  ${finding.ruleId}  ${finding.nodeName ?? '-'}`);
      }
    }

    // A new finding means a rule changed reach; decide whether that is wanted,
    // then regenerate deliberately.
    expect(surviving).toEqual([]);
  }, 180_000);

  it('has no stale baseline entries', async () => {
    const results = await lintAll();
    const produced = new Set<string>();
    for (const result of results) {
      for (const finding of result.findings) produced.add(baselineKey(result.path, finding));
    }

    const baseline = parseBaseline(readFileSync(BASELINE, 'utf8')) as Baseline;
    const stale = Object.keys(baseline.entries).filter((key) => !produced.has(key));

    // A stale entry means a rule stopped firing where it used to — just as
    // much a regression as a new finding, and invisible without this check.
    expect(stale).toEqual([]);
  }, 180_000);

  it('records what the baseline accepts', async () => {
    const baseline = parseBaseline(readFileSync(BASELINE, 'utf8')) as Baseline;
    const total = Object.values(baseline.entries).reduce((a, b) => a + b, 0);
    const byRule = new Map<string, number>();
    for (const [key, count] of Object.entries(baseline.entries)) {
      const ruleId = key.split('::').pop()!;
      byRule.set(ruleId, (byRule.get(ruleId) ?? 0) + count);
    }
    console.log(
      `corpus baseline: ${total} accepted findings\n` +
        [...byRule.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([rule, count]) => `  ${String(count).padStart(4)}  ${rule}`)
          .join('\n'),
    );
    expect(total).toBeGreaterThan(0);
  });
});
