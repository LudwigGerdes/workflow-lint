// Builds the ONE published package.
//
// 1. esbuild bundles every internal workspace library (workflow-lint-core,
//    -fmt, -plugin-*, -node-types, -mcp) into packages/cli/dist. Third-party
//    packages stay external and are declared in package.json `dependencies`
//    (test/dist-deps.test.ts enforces that).
// 2. All entry points come from ONE invocation with `splitting: true`, so the
//    CLI, the MCP server, `workflow-lint/core` and `workflow-lint/rule-tester`
//    share a single module instance of core (one ConfigError class, one n8n
//    loader) instead of each carrying a private copy.
// 3. Declarations: tsc emits them per library (the libraries' own `build`),
//    and rollup-plugin-dts rolls them up the same way — several inputs, shared
//    chunks — so a `Rule` from `workflow-lint/core` is the same type the
//    `RuleTester` from `workflow-lint/rule-tester` accepts.
//
// Requires the libraries to be built first (`pnpm build` at the root orders it).
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { rollup } from 'rollup';
import { dts } from 'rollup-plugin-dts';

const here = dirname(fileURLToPath(import.meta.url));
const at = (...p) => join(here, ...p);
const INTERNAL = /^workflow-lint-(core|fmt|mcp|node-types|plugin-n8n|plugin-standards)(\/|$)/;
const isBare = (id) => !id.startsWith('.') && !id.startsWith('/') && !/^[a-zA-Z]:[\\/]/.test(id);

rmSync(at('dist'), { recursive: true, force: true });
rmSync(at('.types'), { recursive: true, force: true });

// ── 1 + 2: code ─────────────────────────────────────────────────────────────
await build({
  absWorkingDir: here,
  entryPoints: {
    bin: at('src/bin.ts'),
    index: at('src/index.ts'),
    mcp: at('../mcp/src/bin.ts'),
    core: at('../core/src/index.ts'),
    'rule-tester': at('../core/src/rule-tester.ts'),
  },
  outdir: at('dist'),
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  sourcesContent: false,
  chunkNames: 'chunks/[name]-[hash]',
  // Internal libraries resolve to their TypeScript source through the
  // `development` export condition, exactly as the test suite sees them.
  conditions: ['development'],
  logLevel: 'warning',
  plugins: [
    {
      name: 'externalize-third-party',
      setup(b) {
        b.onResolve({ filter: /.*/ }, (args) => {
          if (args.kind === 'entry-point') return undefined;
          if (!isBare(args.path) || INTERNAL.test(args.path)) return undefined;
          return { path: args.path, external: true };
        });
      },
    },
  ],
});
for (const bin of ['bin.js', 'mcp.js']) chmodSync(at('dist', bin), 0o755);

// ── 3: declarations ─────────────────────────────────────────────────────────
for (const lib of ['core', 'node-types', 'fmt', 'plugin-n8n', 'plugin-standards']) {
  if (!existsSync(at('..', lib, 'dist/index.d.ts'))) {
    throw new Error(`packages/${lib} is not built; run \`pnpm build\` from the repo root`);
  }
}
const tsc = at('../../node_modules/.bin/tsc');
execFileSync(tsc, ['-p', at('tsconfig.json'), '--emitDeclarationOnly', '--declarationMap', 'false', '--outDir', at('.types')], {
  stdio: 'inherit',
  cwd: here,
});

const bundle = await rollup({
  input: {
    index: at('.types/index.d.ts'),
    core: at('../core/dist/index.d.ts'),
    'rule-tester': at('../core/dist/rule-tester.d.ts'),
  },
  external: (id) => isBare(id) && !INTERNAL.test(id),
  plugins: [dts({ respectExternal: true })],
  onwarn(warning) {
    throw new Error(`declaration rollup: ${warning.message}`);
  },
});
await bundle.write({
  dir: at('dist'),
  format: 'es',
  entryFileNames: '[name].d.ts',
  chunkFileNames: 'chunks/[name]-[hash].d.ts',
});
await bundle.close();
rmSync(at('.types'), { recursive: true, force: true });
