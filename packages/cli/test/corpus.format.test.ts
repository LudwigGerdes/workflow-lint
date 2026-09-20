import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { glob } from 'glob';
import { formatText } from 'workflow-lint-fmt';

/**
 * Owner-only calibration suite. The corpus is a private set of reference
 * workflows that is not part of this repository; point WORKFLOW_LINT_CORPUS at its
 * root to run this file. Without it the suite is skipped.
 */
const CORPUS = process.env['WORKFLOW_LINT_CORPUS'] ?? '';
const available = CORPUS !== '' && existsSync(CORPUS);
const SKIPPED = 'corpus not present; owner-only calibration suite';
const V = { n8nVersion: '2.38.3' };
const STICKY = 'n8n-nodes-base.stickyNote';

interface Wf {
  nodes: Array<{ name: string; type: string; position: [number, number] }>;
  connections: Record<string, Record<string, Array<Array<{ node: string }> | null>>>;
}

const documentOf = (file: string): Wf => {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  return (Array.isArray(raw['nodes']) ? raw : raw['data']) as Wf;
};

/**
 * A workflow already matching the formatter's x conventions: every node on
 * the spacing grid, and every main edge exactly one column wide.
 */
const conformant = (wf: Wf): boolean => {
  const byName = new Map(wf.nodes.map((n) => [n.name, n]));
  const real = wf.nodes.filter((n) => n.type !== STICKY);
  if (real.length === 0) return false;
  if (real.some((n) => n.position[0] % 192 !== 0)) return false;

  for (const [from, types] of Object.entries(wf.connections ?? {})) {
    const src = byName.get(from);
    if (!src || src.type === STICKY) continue;
    for (const list of types['main'] ?? []) {
      for (const c of list ?? []) {
        const dst = byName.get(c.node);
        if (dst && dst.position[0] - src.position[0] !== 192) return false;
      }
    }
  }
  return true;
};

const files = available
  ? (await glob('*/references/examples/**/*.json', { cwd: CORPUS, absolute: true, nodir: true })).sort()
  : [];

/**
 * Three x-conformant workflows the formatter still moves, each for a reason
 * measured and understood rather than guessed at:
 *
 *  - progressive-escalation and actionable-error-messages mix vertical
 *    baselines inside one document (an Error Trigger and a Code node at 208
 *    while the Switch below them sits at 192).
 *
 *    The obvious theory — a per-node-type centring nudge for taller nodes —
 *    was tested against the corpus and rejected: off-grid offsets scatter
 *    across 16/32/48/64/80 for every node type (set uses five different ones,
 *    debugHelper five), where a convention would cluster on one. These two
 *    files are simply not perfectly formatted, like the 34 of 64 that deviate
 *    somewhere. Do not implement a per-type offset; it would fit noise and
 *    risk the 27 conformant files that pass today.
 *  - well-composed-webhook packs a diamond by its shortest path, while the
 *    formatter uses the longest path — which is what correctly places a Merge
 *    past both of its arms everywhere else in the corpus.
 *
 * They are named rather than filtered out, so any *other* conformant workflow
 * that starts drifting fails the build.
 */
const KNOWN_DRIFT = new Set([
  'n8n-workflow-expert/references/examples/04-error-handling/46-progressive-escalation.json',
  'n8n-workflow-expert/references/examples/04-error-handling/64-actionable-error-messages.json',
  'n8n-workflow-expert/references/examples/05-composition/16-well-composed-webhook.json',
]);

describe.skipIf(!available)(available ? 'corpus formatting' : 'corpus formatting — ' + SKIPPED, () => {
  it('is idempotent on every example workflow', async () => {
    const unstable: string[] = [];

    for (const file of files) {
      const path = relative(CORPUS, file);
      const first = await formatText({ text: readFileSync(file, 'utf8'), path }, V);
      if (!first.result) continue;

      const onceText = JSON.stringify(first.result.json, null, 2);
      const second = await formatText({ text: onceText, path }, V);
      if (JSON.stringify(second.result!.json, null, 2) !== onceText) unstable.push(path);
      if (second.result!.changed) unstable.push(`${path}: still reports changes`);
    }

    expect(unstable).toEqual([]);
  }, 180_000);

  it('leaves workflows already on the grid untouched, and reports drift on the rest', async () => {
    const drifted: string[] = [];
    let conformantCount = 0;
    let changedCount = 0;
    let moveCount = 0;

    for (const file of files) {
      const path = relative(CORPUS, file);
      const text = readFileSync(file, 'utf8');
      const { result } = await formatText({ text, path }, V);
      if (!result) continue;

      moveCount += result.moves.length;
      if (result.changed) changedCount += 1;

      if (conformant(documentOf(file))) {
        conformantCount += 1;
        if (result.moves.length > 0 && !KNOWN_DRIFT.has(path)) {
          drifted.push(`${path}: ${result.moves.length} moved`);
        }
      }
    }

    console.log(
      `format drift: ${files.length} workflows, ${conformantCount} already on the grid, ` +
        `${changedCount} would change, ${moveCount} node moves total`,
    );
    if (drifted.length > 0) console.log(`conformant but moved:\n${drifted.join('\n')}`);

    // No conformant workflow may drift except the three documented above.
    expect(drifted).toEqual([]);
  }, 180_000);
});
