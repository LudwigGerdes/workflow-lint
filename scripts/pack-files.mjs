// Stages the files the ONE published package (packages/cli → `workflow-lint`)
// needs but does not own, and removes them again after packing:
//
//   LICENSE, README.md, THIRD_PARTY_NOTICES.md   from the repo root
//   versions/                                    the node-type bundles, from
//                                                packages/node-types/versions
//
// The copies are gitignored. At runtime the bundles are found by `dataRoot()`
// (packages/node-types/src/package-root.ts): `<package>/versions` in an
// installed tarball, the sibling `packages/node-types/versions` in a checkout.
//
// Usage, from packages/cli:  node ../../scripts/pack-files.mjs pre|post
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(root, 'packages', 'cli');
const phase = process.argv[2];
if (phase !== 'pre' && phase !== 'post') {
  console.error('usage: pack-files.mjs pre|post');
  process.exit(2);
}

const staged = [
  ['LICENSE', 'LICENSE'],
  ['README.md', 'README.md'],
  ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
  [join('packages', 'node-types', 'versions'), 'versions'],
];

if (phase === 'pre') {
  for (const entry of ['dist/bin.js', 'dist/mcp.js', 'dist/core.js', 'dist/core.d.ts']) {
    if (!existsSync(join(pkgDir, entry))) {
      console.error(`packages/cli/${entry} is missing: run \`pnpm build\` before packing`);
      process.exit(1);
    }
  }
}

for (const [from, to] of staged) {
  const target = join(pkgDir, to);
  rmSync(target, { recursive: true, force: true });
  if (phase === 'pre') cpSync(join(root, from), target, { recursive: true });
}
