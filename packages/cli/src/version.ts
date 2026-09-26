import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { packageRoot } from 'workflow-lint-node-types';

/**
 * The package's own version, read from `package.json`, so neither `--version`
 * nor a report can advertise a stale literal.
 */
export function packageVersion(): string {
  const manifest: unknown = JSON.parse(
    readFileSync(join(packageRoot(import.meta.url), 'package.json'), 'utf8'),
  );
  if (
    typeof manifest === 'object' &&
    manifest !== null &&
    'version' in manifest &&
    typeof manifest.version === 'string'
  ) {
    return manifest.version;
  }
  throw new Error('workflow-lint: package.json has no version');
}
