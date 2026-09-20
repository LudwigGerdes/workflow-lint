import { describe, it, expect, vi } from 'vitest';

// The package with no n8n data at all: nothing shipped in versions/ and
// nothing installed in the cache. Linting cannot proceed, but the failure
// must be one clear, actionable message rather than a crash.
vi.mock('../src/manifest.js', () => ({ bundledVersions: () => [] }));

import { resolveVersion } from '../src/resolve.js';

describe('resolveVersion with no bundles anywhere', () => {
  it('throws one actionable error naming the install command', () => {
    expect(() => resolveVersion('2.38.3')).toThrow(/workflow-lint node-types install/);
    expect(() => resolveVersion(undefined)).toThrow(/WORKFLOW_LINT_HOME/);
  });
});
