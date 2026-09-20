import semver from 'semver';
import { bundledVersions } from './manifest.js';

export interface ResolvedVersion {
  version: string;
  exact: boolean;
  note?: string;
}

/**
 * Resolve a requested n8n version against the shipped and installed packs.
 * Offline: never fetches. An inexact match carries a human-readable `note`
 * naming the install command that would make it exact.
 */
export function resolveVersion(requested?: string): ResolvedVersion {
  const vs = bundledVersions();
  if (vs.length === 0) {
    throw new Error(
      'no node-type bundles are available: none ship in this package and none are ' +
        'installed. Run `workflow-lint node-types install <n8n version>` (needs network), ' +
        'or set WORKFLOW_LINT_HOME to a directory containing node-types/<version>/.',
    );
  }
  const latest = vs.at(-1)!;
  if (!requested) {
    return { version: latest, exact: false, note: `n8n version not pinned; using ${latest}` };
  }
  if (vs.includes(requested)) return { version: requested, exact: true };
  const lower = vs.filter((v) => semver.lte(v, requested)).at(-1);
  const install = `run \`workflow-lint node-types install ${requested}\` for exact results`;
  if (lower !== undefined) {
    return { version: lower, exact: false, note: `n8n ${requested} not installed; using nearest older ${lower} — ${install}` };
  }
  // Nothing older is available, so the nearest is newer than the instance:
  // it may describe parameters and versions the instance does not have.
  const newer = vs[0]!;
  return {
    version: newer,
    exact: false,
    note: `n8n ${requested} not installed and nothing older is; using newer ${newer}, which may describe nodes the instance lacks — ${install}`,
  };
}
