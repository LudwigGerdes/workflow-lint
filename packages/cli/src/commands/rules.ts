import type { Rule } from 'workflow-lint-core';
import { buildRegistry } from './lint.js';

export interface RulesDeps {
  write: (text: string) => void;
}

const level = (rule: Rule): string =>
  rule.meta.docs.recommended === false ? 'off' : rule.meta.docs.recommended;

const fixable = (rule: Rule): string =>
  rule.meta.fixable === null ? '' : (rule.meta.fixSafety ?? 'safe');

const sorted = (): Rule[] =>
  [...buildRegistry().values()].sort((a, b) => a.meta.id.localeCompare(b.meta.id));

/** List every registered rule, as a table or as JSON. */
export function runRules(options: { json?: boolean }, deps: RulesDeps): number {
  const rules = sorted();

  if (options.json) {
    deps.write(
      `${JSON.stringify(
        rules.map((r) => ({
          id: r.meta.id,
          class: r.meta.class,
          recommended: r.meta.docs.recommended,
          fixable: r.meta.fixable,
          fixSafety: r.meta.fixSafety ?? null,
          description: r.meta.docs.description,
        })),
        null,
        2,
      )}\n`,
    );
    return 0;
  }

  const widest = (pick: (r: Rule) => string): number =>
    Math.max(...rules.map((r) => pick(r).length));
  const wId = widest((r) => r.meta.id);
  const wLevel = widest(level);
  const wFix = widest(fixable);
  const wClass = widest((r) => r.meta.class);

  const lines = rules.map(
    (r) =>
      `${r.meta.id.padEnd(wId)}  ${r.meta.class.padEnd(wClass)}  ${level(r).padEnd(wLevel)}  ${fixable(r).padEnd(wFix)}  ${r.meta.docs.description}`,
  );
  deps.write(`${lines.join('\n')}\n\n${rules.length} rules\n`);
  return 0;
}
