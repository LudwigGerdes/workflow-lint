#!/usr/bin/env bash
# Install-level acceptance test: proves workflow-lint works for someone who
# clones the repository and for someone who installs the npm tarball.
#
#   scripts/smoke.sh [clone|npm|all]      (default: all)
#
# Every run works in fresh mktemp dirs with an isolated HOME and
# WORKFLOW_LINT_HOME, and removes them on exit. It never writes to the working
# tree or to the developer's ~/.workflow-lint. The only things shared with the
# real home are the content-addressed download caches (pnpm store, npm cache,
# corepack), so a run does not re-download the world; set
# SMOKE_ISOLATE_CACHES=1 to isolate those too.
#
# Never make this pass by asserting less.
set -euo pipefail

MODE="${1:-all}"
case "$MODE" in clone | npm | all) ;; *)
  echo "usage: scripts/smoke.sh [clone|npm|all]" >&2
  exit 2
  ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
N8N_VERSION="2.38.3"
DEMO="docs/demo/order-sync.json"

# ── isolation ────────────────────────────────────────────────────────────────
REAL_HOME="$HOME"
PNPM_STORE=""
if [ "${SMOKE_ISOLATE_CACHES:-0}" != "1" ]; then
  PNPM_STORE="$(pnpm store path 2>/dev/null || true)"
  NPM_CACHE="$(npm config get cache 2>/dev/null || true)"
  [ -n "$NPM_CACHE" ] && export npm_config_cache="$NPM_CACHE"
  if [ -z "${COREPACK_HOME:-}" ] && [ -d "$REAL_HOME/.cache/node/corepack" ]; then
    export COREPACK_HOME="$REAL_HOME/.cache/node/corepack"
  fi
fi
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

TMP="$(mktemp -d "${TMPDIR:-/tmp}/workflow-lint-smoke.XXXXXX")"
TMP="$(cd "$TMP" && pwd -P)" # macOS: /var -> /private/var, so path assertions compare like with like
PIDS=()
cleanup() {
  for pid in "${PIDS[@]:-}"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
  rm -rf "$TMP"
}
trap cleanup EXIT

export HOME="$TMP/home"
export WORKFLOW_LINT_HOME="$TMP/workflow-lint-home"
mkdir -p "$HOME"
unset WORKFLOW_LINT_CORPUS WORKFLOW_LINT_N8N_API_KEY WORKFLOW_LINT_N8N_INSTANCE WORKFLOW_LINT_N8N_VERSION
export NO_COLOR=1 CI=1 npm_config_update_notifier=false npm_config_fund=false npm_config_audit=false

# ── reporting ────────────────────────────────────────────────────────────────
PASSED=0
FAILED=0
FAILURES=()
pass() {
  PASSED=$((PASSED + 1))
  echo "PASS  [$PATH_NAME] $1"
}
fail() {
  FAILED=$((FAILED + 1))
  FAILURES+=("[$PATH_NAME] $1")
  echo "FAIL  [$PATH_NAME] $1"
  if [ -n "${2:-}" ]; then echo "$2" | tail -n 25 | sed 's/^/        /'; fi
}

# run <expected-exit> <name> <grep-pattern|-> -- cmd...
# Asserts the exit code AND (unless "-") that combined output matches the
# extended regex.
OUT=""
run() {
  local want="$1" name="$2" pattern="$3"
  shift 4
  local code=0
  OUT="$("$@" 2>&1)" || code=$?
  if [ "$code" != "$want" ]; then
    fail "$name (exit $code, wanted $want)" "$OUT"
    return 0
  fi
  if [ "$pattern" != "-" ] && ! grep -Eq -- "$pattern" <<<"$OUT"; then
    fail "$name (output does not match /$pattern/)" "$OUT"
    return 0
  fi
  pass "$name"
}

check() { # check <name> <command...>: passes when the command succeeds
  local name="$1"
  shift
  local out code=0
  out="$("$@" 2>&1)" || code=$?
  if [ "$code" = 0 ]; then pass "$name"; else fail "$name" "$out"; fi
}

# ── the MCP handshake ────────────────────────────────────────────────────────
# Spawns the server, sends `initialize` then `tools/list` over stdio, and
# prints "<serverInfo.name> <serverInfo.version> tools=<n>".
mcp_handshake() {
  node - "$@" <<'NODE'
const { spawn } = require('node:child_process');
const [cmd, ...args] = process.argv.slice(2);
const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
let buf = '';
let err = '';
let info;
const send = (m) => child.stdin.write(`${JSON.stringify(m)}\n`);
const timer = setTimeout(() => {
  console.error(`timeout waiting for the MCP server\n${err}`);
  child.kill();
  process.exit(1);
}, 20000);
child.stderr.on('data', (d) => (err += d));
child.on('error', (e) => { console.error(String(e)); process.exit(1); });
child.on('exit', (code) => {
  if (!info) { console.error(`server exited ${code} before answering\n${err}`); process.exit(1); }
});
child.stdout.on('data', (d) => {
  buf += d;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    const msg = JSON.parse(line); // anything that is not a protocol frame on stdout is a bug
    if (msg.id === 1) {
      info = msg.result.serverInfo;
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    } else if (msg.id === 2) {
      console.log(`${info.name} ${info.version} tools=${msg.result.tools.length}`);
      clearTimeout(timer);
      child.kill();
      process.exit(0);
    }
  }
});
send({
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } },
});
NODE
}

# ── the quickstart: what the README promises ────────────────────────────────
# $1 = directory the shipped data must be found under
# $2 = directory to work in (holds a copy of the demo workflow)
# $3 = the package directory itself (n8n-workflow must resolve from it)
# WL / MCP arrays = how to invoke the two bins in this layout
quickstart() {
  local pkg_root="$1" work="$2" pkg_dir="$3"
  mkdir -p "$work"
  cp "$ROOT/$DEMO" "$work/order-sync.json"
  cd "$work"

  local version
  version="$(node -p "require('$ROOT/packages/cli/package.json').version")"
  run 0 "--version prints $version" "^${version//./\\.}\$" -- "${WL[@]}" --version
  run 0 "--help lists every command" "lint .*fmt .*node-types .*fleet .*init .*rules" -- \
    bash -c '"$@" --help | tr "\n" " "' _ "${WL[@]}"

  run 1 "lint exits 1 and reports 11 problems" "11 problems \(1 error, 9 warnings, 1 info\)" -- \
    "${WL[@]}" lint order-sync.json --n8n-version "$N8N_VERSION"
  run 1 "a bare path routes to lint" "11 problems" -- "${WL[@]}" order-sync.json --n8n-version "$N8N_VERSION"
  run 1 "--format json is parseable and names a rule" "structure/set-pass-through-include-other-fields" -- \
    bash -c '"$@" | node -e "JSON.parse(require(\"fs\").readFileSync(0,\"utf8\"))" && "$@"' _ \
    "${WL[@]}" lint order-sync.json --n8n-version "$N8N_VERSION" --format json
  run 1 "--format sarif emits SARIF 2.1.0" '"version": ?"2\.1\.0"' -- \
    "${WL[@]}" lint order-sync.json --n8n-version "$N8N_VERSION" --format sarif

  cp order-sync.json fixed.json
  run 0 "--fix exits 0 and leaves 7 problems" "7 problems \(0 errors" -- \
    "${WL[@]}" lint fixed.json --n8n-version "$N8N_VERSION" --fix
  if cmp -s order-sync.json fixed.json; then fail "--fix rewrites the file"; else pass "--fix rewrites the file"; fi
  check "--fix output is still valid JSON" node -e "JSON.parse(require('fs').readFileSync('fixed.json','utf8'))"

  run 1 "fmt --check exits 1 on an unformatted file" "1 file would be reformatted" -- \
    "${WL[@]}" fmt --check fixed.json --n8n-version "$N8N_VERSION"
  run 0 "fmt rewrites the layout" "formatted fixed\.json" -- "${WL[@]}" fmt fixed.json --n8n-version "$N8N_VERSION"
  run 0 "fmt --check exits 0 afterwards" "-" -- "${WL[@]}" fmt --check fixed.json --n8n-version "$N8N_VERSION"

  run 0 "init writes a config" "Created workflow-lint\.config\.yaml" -- "${WL[@]}" init
  check "the written config exists and is not empty" test -s workflow-lint.config.yaml
  run 1 "lint runs under the written config" "problems" -- "${WL[@]}" lint order-sync.json --n8n-version "$N8N_VERSION"
  rm -f workflow-lint.config.yaml

  run 0 "rules lists all 31 rules" "^31 rules" -- "${WL[@]}" rules

  # Node-type data: present, the shipped version, and found inside THIS
  # package rather than the repo, the cache or anywhere else.
  run 0 "node-types list shows the shipped $N8N_VERSION" "^${N8N_VERSION//./\\.}" -- "${WL[@]}" node-types list
  local dir
  dir="$("${WL[@]}" node-types list --json 2>/dev/null | node -e "
    const j = JSON.parse(require('fs').readFileSync(0, 'utf8'));
    process.stdout.write(require('fs').realpathSync(j.dirs['$N8N_VERSION']));
  " 2>&1)" || true
  case "$dir" in
  "$pkg_root"/*)
    pass "node-type data is found inside the package under test (${dir#"$pkg_root"/})"
    check "that directory holds base.json, langchain.json and meta.json" \
      test -s "$dir/base.json" -a -s "$dir/langchain.json" -a -s "$dir/meta.json"
    ;;
  *) fail "node-type data is found inside the package under test (wanted under $pkg_root)" "$dir" ;;
  esac
  if [ -e "$WORKFLOW_LINT_HOME" ]; then
    fail "linting the shipped version needs no cache (WORKFLOW_LINT_HOME was created)"
  else
    pass "linting the shipped version needs no cache (offline straight after install)"
  fi

  # n8n-workflow is an external dependency, loaded at runtime via createRequire.
  local n8n
  n8n="$(cd "$pkg_dir" && node -e "
    const { createRequire } = require('node:module');
    const r = createRequire(require('fs').realpathSync('$pkg_dir') + '/dist/bin.js');
    process.stdout.write(require('fs').realpathSync(r.resolve('n8n-workflow')));
  " 2>&1)" || true
  case "$n8n" in
  "$N8N_EXPECT"/*) pass "n8n-workflow resolves from the package's own dependencies" ;;
  *) fail "n8n-workflow resolves from the package's own dependencies (wanted under $N8N_EXPECT)" "$n8n" ;;
  esac

  run 0 "the MCP bin answers initialize and lists its tools" "^workflow-lint(-mcp)? ${version//./\\.} tools=[1-9]" -- \
    mcp_handshake "${MCP[@]}"

  cd "$TMP"
}

# ── clone path ───────────────────────────────────────────────────────────────
clone_path() {
  PATH_NAME="clone"
  local clone="$TMP/clone"
  echo "── clone: git clone → pnpm install --frozen-lockfile → pnpm build → quickstart"
  git clone --quiet "$ROOT" "$clone"
  local log="$TMP/clone-build.log"
  # --store-dir is passed as a flag, not as npm_config_store_dir: npm warns
  # about unknown npm_config_* keys and the npm path shares this environment.
  local store=()
  [ -n "$PNPM_STORE" ] && store=(--store-dir "$PNPM_STORE")
  if ! (cd "$clone" && pnpm install --frozen-lockfile ${store[@]+"${store[@]}"} && pnpm build) >"$log" 2>&1; then
    fail "fresh clone installs and builds" "$(cat "$log")"
    return 0
  fi
  pass "fresh clone installs and builds"

  # The checkout invocation the README documents.
  WL=(node "$clone/packages/cli/dist/bin.js")
  MCP=(node "$clone/packages/cli/dist/mcp.js")
  N8N_EXPECT="$clone/node_modules"
  check "the CLI a checkout-based hook runs exists" test -f "$clone/packages/cli/dist/bin.js"
  quickstart "$clone/packages" "$TMP/clone-work" "$clone/packages/cli"

  PATH_NAME="clone"
  run 0 "pnpm demo runs to the end" "-" -- bash -c "cd '$clone' && node scripts/demo.mjs"
}

# ── npm path ─────────────────────────────────────────────────────────────────
npm_path() {
  PATH_NAME="npm"
  echo "── npm: pnpm pack → npm install <tarball> in an empty dir → quickstart"
  if [ ! -f "$ROOT/packages/cli/dist/bin.js" ]; then
    fail "the working tree is built (run pnpm build first)"
    return 0
  fi

  local packdir="$TMP/pack" log="$TMP/pack.log"
  mkdir -p "$packdir"
  # prepack stages LICENSE/README/notices/versions into packages/cli and
  # postpack must remove them again: the tree looks the same before and after.
  local before after
  before="$(cd "$ROOT" && git status --porcelain --ignored packages/cli)"
  if ! (cd "$ROOT/packages/cli" && pnpm pack --pack-destination "$packdir") >"$log" 2>&1; then
    fail "pnpm pack" "$(cat "$log")"
    return 0
  fi
  local tarball
  tarball="$(ls "$packdir"/workflow-lint-*.tgz | head -n 1)"
  pass "pnpm pack → $(basename "$tarball")"
  after="$(cd "$ROOT" && git status --porcelain --ignored packages/cli)"
  if [ "$before" = "$after" ]; then
    pass "packing leaves nothing behind in packages/cli"
  else
    fail "packing leaves nothing behind in packages/cli" "$(diff <(echo "$before") <(echo "$after") || true)"
  fi

  # Tarball contents.
  local listing="$TMP/tarball.txt"
  tar -tzf "$tarball" | sed 's#^package/##' | sort >"$listing"
  local count size
  count="$(wc -l <"$listing" | tr -d ' ')"
  size="$(wc -c <"$tarball" | tr -d ' ')"
  echo "      tarball: $count files, $((size / 1024)) KiB packed"
  for f in package.json LICENSE README.md THIRD_PARTY_NOTICES.md dist/bin.js dist/mcp.js dist/core.js \
    dist/core.d.ts dist/rule-tester.js dist/rule-tester.d.ts \
    "versions/$N8N_VERSION/base.json" "versions/$N8N_VERSION/langchain.json" "versions/$N8N_VERSION/meta.json"; do
    if grep -qx -- "$f" "$listing"; then pass "tarball contains $f"; else fail "tarball contains $f"; fi
  done
  local bad
  bad="$(grep -E '(^|/)(src|test|tests|__tests__|fixtures|node_modules)/|\.test\.|\.tsbuildinfo$|(^|/)tsconfig.*\.json$' "$listing" || true)"
  if [ -z "$bad" ]; then pass "tarball has no src/, tests, fixtures or build leftovers"; else fail "tarball has no src/, tests, fixtures or build leftovers" "$bad"; fi
  bad="$(grep -E '\.ts$' "$listing" | grep -Ev '\.d\.ts$' || true)"
  if [ -z "$bad" ]; then pass "tarball has no TypeScript sources"; else fail "tarball has no TypeScript sources" "$bad"; fi
  bad=""
  while IFS= read -r js; do
    grep -qx -- "$js.map" "$listing" || bad+="$js"$'\n'
  done < <(grep -E '^dist/.*\.js$' "$listing")
  if [ -z "$bad" ]; then pass "every dist/*.js ships its source map"; else fail "every dist/*.js ships its source map" "$bad"; fi
  bad="$(grep -Ev '^(package\.json|LICENSE|README\.md|THIRD_PARTY_NOTICES\.md|dist/|versions/)' "$listing" || true)"
  if [ -z "$bad" ]; then pass "tarball holds only whitelisted top-level entries"; else fail "tarball holds only whitelisted top-level entries" "$bad"; fi
  # Every dependency field, devDependencies included: nothing may name a
  # workspace library or carry an unrewritten workspace: range.
  bad="$(tar -xzOf "$tarball" package/package.json | node -e "
    const m = JSON.parse(require('fs').readFileSync(0, 'utf8'));
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'bundledDependencies', 'bundleDependencies'])
      for (const [name, range] of Object.entries(m[field] ?? {}))
        if (/^workflow-lint/.test(name) || /^(workspace|link|file):/.test(String(range))) console.log(field + ': ' + name + '@' + range);
  " 2>&1 || true)"
  if [ -z "$bad" ]; then pass "published manifest depends on no workspace package"; else fail "published manifest depends on no workspace package" "$bad"; fi

  # Install into an empty project outside any workspace.
  local app="$TMP/app"
  mkdir -p "$app"
  cd "$app"
  log="$TMP/npm-install.log"
  if ! (npm init -y && npm install "$tarball") >"$log" 2>&1; then
    fail "npm install <tarball> in an empty project" "$(cat "$log")"
    cd "$TMP"
    return 0
  fi
  pass "npm install <tarball> in an empty project"

  WL=("$app/node_modules/.bin/workflow-lint")
  MCP=("$app/node_modules/.bin/workflow-lint-mcp")
  N8N_EXPECT="$app/node_modules"
  check "bin workflow-lint is linked" test -x "$app/node_modules/.bin/workflow-lint"
  check "bin workflow-lint-mcp is linked" test -x "$app/node_modules/.bin/workflow-lint-mcp"
  run 0 "npx --no-install workflow-lint --version" "^[0-9]+\.[0-9]+\.[0-9]+" -- npx --no-install workflow-lint --version
  quickstart "$app/node_modules/workflow-lint" "$TMP/npm-work" "$app/node_modules/workflow-lint"
  PATH_NAME="npm"
  cd "$app"

  # One copy of core: the CLI and `workflow-lint/core` share a module instance.
  local copies
  copies="$(grep -l -E '^(var|let|const) LintGraph = class|^class LintGraph\b' -r --include='*.js' "$app/node_modules/workflow-lint/dist" | wc -l | tr -d ' ' || true)"
  if [ "$copies" = "1" ]; then pass "dist holds exactly one copy of core (LintGraph defined once)"; else fail "dist holds exactly one copy of core (LintGraph defined in $copies files)"; fi

  # A third-party-style plugin, written against the public subpath exports.
  mkdir -p "$app/plugin"
  cat >"$app/plugin/rule.mjs" <<'JS'
// What a rule author outside this repo would write.
export const rule = {
  meta: {
    id: 'acme/no-http-request',
    type: 'problem',
    class: 'quality',
    fixable: null,
    docs: { description: 'Acme forbids raw HTTP Request nodes.', recommended: 'error' },
    messages: { found: 'HTTP Request node "{{name}}" is not allowed at Acme.' },
    schema: [],
  },
  create(ctx) {
    return {
      'Node[type="n8n-nodes-base.httpRequest"]'(node) {
        ctx.report({ node, messageId: 'found', data: { name: node.name } });
      },
    };
  },
};
JS
  cat >"$app/plugin/lint.mjs" <<'JS'
import { readFileSync } from 'node:fs';
import * as core from 'workflow-lint/core';
import * as cli from 'workflow-lint';
import { rule } from './rule.mjs';

const registry = new Map([[rule.meta.id, rule]]);
const config = core.resolveConfig(
  { settings: { n8nVersion: '2.38.3' }, rules: { [rule.meta.id]: 'error' } },
  registry,
);
const path = process.argv[2];
const result = await core.lint({ text: readFileSync(path, 'utf8'), path }, config);
if (result.parseErrors.length) throw new Error(JSON.stringify(result.parseErrors));
for (const f of result.findings) console.log(`${f.ruleId} ${f.severity} ${f.message}`);

// Shared state: an error thrown by the CLI's copy of core must be an
// instance of the class `workflow-lint/core` hands to plugin authors.
let thrown;
try {
  core.resolveConfig({ rules: { 'nope/nope': 'error' } }, registry);
} catch (e) {
  thrown = e;
}
if (!(thrown instanceof core.ConfigError)) throw new Error('ConfigError identity is split');
if (typeof cli.buildProgram !== 'function') throw new Error('the CLI entry does not export buildProgram');
console.log(`findings=${result.findings.length} single-instance=ok`);
JS
  run 0 "a third-party rule lints through workflow-lint/core" \
    'acme/no-http-request error HTTP Request node ".+" is not allowed at Acme\.' -- \
    node "$app/plugin/lint.mjs" "$TMP/npm-work/order-sync.json"
  run 0 "…and shares one module instance with the CLI" "single-instance=ok" -- \
    node "$app/plugin/lint.mjs" "$TMP/npm-work/order-sync.json"

  # Types: the subpath exports must type-check for a consumer, and
  # workflow-lint/rule-tester must run under the consumer's vitest.
  log="$TMP/npm-dev.log"
  if ! npm install --save-dev typescript@^5.5.0 @types/node@^20 vitest@^2.0.0 >"$log" 2>&1; then
    fail "install typescript + vitest for the consumer checks" "$(cat "$log")"
    cd "$TMP"
    return 0
  fi
  cat >"$app/plugin/typed.ts" <<'TS'
import { lint, resolveConfig, type Rule, type LintResult } from 'workflow-lint/core';
import { RuleTester } from 'workflow-lint/rule-tester';
import { buildProgram } from 'workflow-lint';

export const rule: Rule = {
  meta: {
    id: 'acme/typed',
    type: 'problem',
    class: 'quality',
    fixable: null,
    docs: { description: 'typed', recommended: 'warn' },
    messages: { found: 'found' },
    schema: [],
  },
  create: () => ({}),
};
export async function go(text: string): Promise<LintResult> {
  return lint({ text, path: 'x.json' }, resolveConfig({}, new Map([[rule.meta.id, rule]])));
}
export const tester: RuleTester = new RuleTester();
// A Rule from /core must be the type /rule-tester accepts (one declaration, not two copies).
export const declare = (): void => tester.run(rule, { valid: [], invalid: [] });
export const program: ReturnType<typeof buildProgram> = buildProgram();
// @ts-expect-error — proves the types are real, not `any`
export const wrong: Rule = { meta: 42 };
TS
  cat >"$app/plugin/tsconfig.json" <<'JSON'
{
  "compilerOptions": {
    "module": "NodeNext", "moduleResolution": "NodeNext", "target": "ES2022",
    "strict": true, "noEmit": true, "skipLibCheck": true, "types": ["node"]
  },
  "files": ["typed.ts"]
}
JSON
  run 0 "workflow-lint/core and /rule-tester type-check for a consumer (tsc, NodeNext, strict)" "-" -- \
    "$app/node_modules/.bin/tsc" -p "$app/plugin/tsconfig.json"

  cat >"$app/plugin/rule.test.mjs" <<'JS'
import { RuleTester } from 'workflow-lint/rule-tester';
import { rule } from './rule.mjs';

const http = (name) => ({
  name: 'wf',
  nodes: [{ name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [0, 0], parameters: {} }],
  connections: {},
});
new RuleTester({ settings: { n8nVersion: '2.38.3' } }).run(rule, {
  valid: [{ workflow: { name: 'wf', nodes: [], connections: {} } }],
  invalid: [{ workflow: http('Call API'), errors: [{ messageId: 'found' }] }],
});
JS
  run 0 "RuleTester from workflow-lint/rule-tester runs under the consumer's vitest" "2 passed" -- \
    "$app/node_modules/.bin/vitest" run --root "$app/plugin"

  cd "$TMP"
}

PATH_NAME="$MODE"
case "$MODE" in
clone) clone_path ;;
npm) npm_path ;;
all)
  clone_path
  npm_path
  ;;
esac

echo
echo "── summary: $PASSED passed, $FAILED failed (node $(node -v), $(uname -s))"
if [ "$FAILED" -gt 0 ]; then
  for f in "${FAILURES[@]}"; do echo "   FAIL $f"; done
  exit 1
fi
echo "   all checks passed"
