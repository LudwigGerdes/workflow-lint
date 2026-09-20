import type { Rule, Severity, UserConfig } from './types.js';

/**
 * A preset is built from the rule registry rather than being a fixed literal:
 * `workflow-lint:recommended` is defined as "every rule at its own
 * `meta.docs.recommended` level", so it cannot be a static UserConfig.
 */
export type PresetBuilder = (registry: Map<string, Rule>) => UserConfig;

const enabled = (registry: Map<string, Rule>): Rule[] =>
  [...registry.values()].filter((r) => r.meta.docs.recommended !== false);

const at = (rules: Rule[], severity: (rule: Rule) => Severity): UserConfig => ({
  rules: Object.fromEntries(rules.map((r) => [r.meta.id, severity(r)])),
});

/**
 * What `workflow-lint:production` insists on beyond the recommended levels: the
 * findings that turn into an incident rather than a review comment.
 */
const PRODUCTION_LEVELS: Record<string, Severity> = {
  'n8n/valid': 'error',
  'hygiene/no-inline-secrets': 'error',
  'reliability/error-workflow-configured': 'error',
  'reliability/http-retry-config': 'error',
  'reliability/webhook-input-contract': 'warn',
};

export const presets: Record<string, PresetBuilder> = {
  'workflow-lint:recommended': (registry) =>
    at(enabled(registry), (r) => r.meta.docs.recommended as Severity),
  /** Everything the recommended preset enables, raised to error. */
  'workflow-lint:strict': (registry) => at(enabled(registry), () => 'error'),
  'workflow-lint:production': (registry) => {
    const base = at(enabled(registry), (r) => r.meta.docs.recommended as Severity);
    const raised: Record<string, Severity> = {};
    for (const [id, severity] of Object.entries(PRODUCTION_LEVELS)) {
      if (registry.has(id)) raised[id] = severity;
    }
    return { rules: { ...base.rules, ...raised } };
  },
};
