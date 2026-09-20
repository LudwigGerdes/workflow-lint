export const CORE_VERSION = '0.0.1';

export * from './n8n.js';
export * from './types.js';
export * from './parse.js';
export * from './graph.js';
export * from './selectors.js';
export * from './fixer.js';
export * from './context.js';
export * from './config.js';
export * from './ignore.js';
export * from './presets.js';
export * from './disables.js';
export * from './baseline.js';
export * from './runner.js';
export * from './rule-docs.js';
export * from './source-map-adapter.js';
// RuleTester is deliberately NOT exported here: it imports vitest, which must
// not be pulled into production consumers. It lives at workflow-lint-core/rule-tester.
// Types from the node-types library that appear in this package's public
// signatures (RuleContext, LintGraph). Re-exported so a consumer of the
// published `workflow-lint/core` can name them.
export type { NodeTypePack } from 'workflow-lint-node-types';
