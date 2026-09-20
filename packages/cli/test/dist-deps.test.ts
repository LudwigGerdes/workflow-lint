import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(PKG, 'dist');
const built = existsSync(join(DIST, 'bin.js'));

/** `fs.globSync` is Node 22+; and the package now requires Node >= 24, but plain readdir keeps this portable. */
const filesUnder = (dir: string, suffix: string): string[] =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith(suffix));

/** Only real module specifiers — prose inside a string or comment is not an import. */
const PATTERNS = [
  /^\s*(?:import|export)\b[^;\n]*?\bfrom\s*['"]([^'"\n]+)['"]/gm,
  /^\s*import\s*['"]([^'"\n]+)['"]/gm,
  /\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  /\brequire\d*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
];

const bareName = (spec: string): string =>
  spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!;

const isBuiltin = (spec: string): boolean =>
  spec.startsWith('node:') || builtinModules.includes(bareName(spec));

function importedPackages(suffix: string): Set<string> {
  const found = new Set<string>();
  for (const file of filesUnder(DIST, suffix)) {
    const src = readFileSync(join(DIST, file), 'utf8');
    for (const pattern of PATTERNS) {
      for (const m of src.matchAll(pattern)) {
        const spec = m[1]!;
        if (spec.startsWith('.') || spec.startsWith('/') || isBuiltin(spec)) continue;
        if (!/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+(\/.*)?$/.test(spec)) continue; // a template, not a specifier
        found.add(bareName(spec));
      }
    }
  }
  return found;
}

/**
 * The published package is one esbuild bundle: the internal workspace
 * libraries are inlined, every third-party package stays an external import.
 * Inside the workspace everything is hoisted, so an import the manifest does
 * not declare works here and is fatal for anyone installing from npm. Only a
 * check against the *declared* dependencies catches that.
 *
 * Needs a build (`pnpm build`); skipped otherwise, and `pnpm smoke` and CI
 * always build first.
 */
describe.skipIf(!built)('the published bundle declares what it imports', () => {
  const manifest = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  const deps = new Set(Object.keys(manifest.dependencies ?? {}));
  const peers = new Set(Object.keys(manifest.peerDependencies ?? {}));

  it('imports no package missing from dependencies / peerDependencies', () => {
    const undeclared = [...importedPackages('.js')].filter((p) => !deps.has(p) && !peers.has(p));
    expect(undeclared.sort()).toEqual([]);
  });

  it('inlines every internal workspace library', () => {
    const internal = [...importedPackages('.js'), ...importedPackages('.d.ts')].filter((p) =>
      /^workflow-lint-/.test(p),
    );
    expect(internal).toEqual([]);
    const listed = [...deps, ...peers, ...Object.keys(manifest.devDependencies ?? {})].filter((p) =>
      /^workflow-lint-/.test(p),
    );
    expect(listed).toEqual([]);
  });

  it('declares no dependency the bundle never imports', () => {
    const imported = importedPackages('.js');
    expect([...deps].filter((p) => !imported.has(p)).sort()).toEqual([]);
  });

  it('only vitest is a peer, and only the rule-tester entry needs it', () => {
    expect([...peers]).toEqual(['vitest']);
    for (const file of filesUnder(DIST, '.js')) {
      if (file === 'rule-tester.js') continue;
      expect(readFileSync(join(DIST, file), 'utf8'), file).not.toMatch(/from\s*['"]vitest['"]/);
    }
  });

  it('types import only declared packages', () => {
    const undeclared = [...importedPackages('.d.ts')].filter((p) => !deps.has(p) && !peers.has(p));
    expect(undeclared.sort()).toEqual([]);
  });
});
