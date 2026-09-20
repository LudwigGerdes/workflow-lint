import { createRequire } from 'node:module';

/**
 * The single runtime entry point to `n8n-workflow`.
 *
 * Its published ESM build cannot be loaded by Node: `dist/esm/index.js` uses
 * extensionless relative imports, which ESM forbids, and its `@n8n/tournament`
 * dependency maps its own `import` condition to raw TypeScript that does not
 * re-export everything the ESM build expects. Bundlers paper over both, which
 * is why the test suite never saw it, but the CLI and any plain-Node consumer
 * of this library would fail at import time.
 *
 * The CJS build is correct and complete, so we load that through
 * `createRequire`. Types still come from `import type` elsewhere, which is
 * erased and so unaffected.
 */
const require = createRequire(import.meta.url);
const n8nWorkflow = require('n8n-workflow') as typeof import('n8n-workflow');

export const {
  Workflow: WorkflowClass,
  isSubNodeType,
  isTool,
  isDefaultNodeName,
  getNodeParametersIssues,
} = n8nWorkflow;
