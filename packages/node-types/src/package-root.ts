import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The directory of the nearest `package.json` at or above a module.
 *
 * Code in this repo runs from three places: TypeScript source under
 * `packages/<lib>/src` (tests, tsx), the per-library `tsc` output under
 * `packages/<lib>/dist`, and the single esbuild bundle under
 * `packages/cli/dist` — which is also what an installed
 * `node_modules/workflow-lint/dist` is. Counting `..` segments from
 * `import.meta.url` is wrong in at least one of them; walking up to the
 * manifest is right in all.
 *
 * Pass `import.meta.url` of the calling module.
 */
export function packageRoot(from: string): string {
  let dir = dirname(from.startsWith('file:') ? fileURLToPath(from) : from);
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`no package.json at or above ${from}`);
    dir = parent;
  }
}

/**
 * THE data-root resolver: the directory holding the shipped node-type
 * bundles (`<root>/<n8nVersion>/{base,langchain,meta}.json`). Every lookup of
 * shipped data goes through here. In order:
 *
 * 1. `WORKFLOW_LINT_DATA_DIR` — explicit override, used as given.
 * 2. `<package root>/versions` — the packed tarball (`prepack` copies the
 *    bundles into the published package) and the `workflow-lint-node-types`
 *    workspace package itself, whether running from `src` or `dist`.
 * 3. `<package root>/../node-types/versions` — the esbuild bundle running from
 *    a workspace checkout, where the package root is `packages/cli` and the
 *    data still lives in its sibling.
 *
 * The directory may not exist (a package stripped of its data is supported);
 * callers check. The per-user cache (`WORKFLOW_LINT_HOME`) is a separate,
 * writable location and is searched before this one — see `cacheDir`.
 */
export function dataRoot(): string {
  const override = process.env['WORKFLOW_LINT_DATA_DIR'];
  if (override !== undefined && override !== '') return resolve(override);
  const root = packageRoot(import.meta.url);
  const own = join(root, 'versions');
  if (existsSync(own)) return own;
  const sibling = join(root, '..', 'node-types', 'versions');
  return existsSync(sibling) ? sibling : own;
}
