#!/usr/bin/env node
/**
 * A runnable tour of workflow-lint, end to end, on a workflow built to be wrong in
 * instructive ways. Everything here is the real CLI and the real MCP server —
 * nothing is simulated.
 *
 *   pnpm demo
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = join(REPO, 'packages/cli/dist/bin.js');
const MCP = join(REPO, 'packages/cli/dist/mcp.js');

if (!existsSync(BIN) || !existsSync(MCP)) {
  console.error('Build first:  pnpm build');
  process.exit(2);
}

const dim = (s) => `[2m${s}[0m`;
const bold = (s) => `[1m${s}[0m`;

let act = 0;
const heading = (title) => {
  act += 1;
  console.log(`\n${bold(`── ${act}. ${title} `.padEnd(74, '─'))}`);
};
const show = (cmd) => console.log(dim(`\n$ ${cmd}`));

const dir = mkdtempSync(join(tmpdir(), 'workflow-lint-demo-'));

/** Deliberately wrong: default names, no retry, placeholder URL, messy layout. */
const workflow = JSON.parse(readFileSync(join(REPO, 'docs/demo/order-sync.json'), 'utf8'));

const file = join(dir, 'order-sync.json');
const write = () => writeFileSync(file, `${JSON.stringify(workflow, null, 2)}\n`);
write();

const run = (args, opts = {}) => {
  const r = spawnSync('node', [BIN, ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ...(opts.env ?? {}) },
  });
  if (r.stdout && !opts.silent) process.stdout.write(r.stdout);
  if (opts.showErr && r.stderr) process.stdout.write(dim(r.stderr));
  console.log(dim(`${opts.silent ? '(output suppressed)  ' : ''}exit ${r.status}`));
  return r;
};

// The shipped bundle. Pinning it is what turns typeVersion findings on.
const V = ['--n8n-version', '2.38.3'];

console.log(bold('\nworkflow-lint — end-to-end demo'));
console.log(dim(`workspace: ${dir}`));

heading('Lint a workflow that is wrong in several ways');
show('workflow-lint lint order-sync.json --n8n-version 2.38.3');
run(['lint', 'order-sync.json', ...V]);
console.log(dim('Exit 1: one finding is an error, and --fail-on defaults to error.'));

heading('Safe autofix, and what it deliberately leaves alone');
show('workflow-lint lint order-sync.json --fix');
run(['lint', 'order-sync.json', ...V, '--fix']);
const fixed = JSON.parse(readFileSync(file, 'utf8'));
console.log(dim(`  "Is Valid" renamed to "${fixed.nodes[1].name}" — and the connection`));
console.log(dim(`  key moved with it: ${Object.keys(fixed.connections).join(', ')}`));
console.log(dim('  The placeholder URL is NOT auto-fixed: no safe value exists.'));

heading('Exit codes are CI-shaped');
console.log(dim('  Same file, now that --fix has removed the only error-severity finding.'));
show('workflow-lint lint order-sync.json                  # default --fail-on error');
run(['lint', 'order-sync.json', ...V], { silent: true });
show('workflow-lint lint order-sync.json --fail-on warn');
run(['lint', 'order-sync.json', ...V, '--fail-on', 'warn'], { silent: true });
show('workflow-lint lint --format nope                    # usage error');
run(['lint', '--format', 'nope'], { showErr: true, silent: true });

heading('The formatter is separate from the linter');
write();
show('workflow-lint fmt order-sync.json --check');
run(['fmt', 'order-sync.json', ...V, '--check']);
show('workflow-lint fmt order-sync.json');
run(['fmt', 'order-sync.json', ...V]);
const laid = JSON.parse(readFileSync(file, 'utf8'));
console.log(dim(`  entry node keeps the author's position ${JSON.stringify(laid.nodes[0].position)};`));
console.log(dim(`  the rest follow from it: ${laid.nodes.slice(1).map((n) => JSON.stringify(n.position)).join(' ')}`));
show('workflow-lint fmt order-sync.json --check   # idempotent');
run(['fmt', 'order-sync.json', ...V, '--check']);

heading('Reporters for wherever the findings need to land');
write();
show('workflow-lint lint order-sync.json --format github-actions');
run(['lint', 'order-sync.json', ...V, '--format', 'github-actions']);
show('workflow-lint lint order-sync.json --format canvas-overlay   # reserved, seam S6');
const overlay = spawnSync('node', [BIN, 'lint', 'order-sync.json', ...V, '--format', 'canvas-overlay'],
  { cwd: dir, encoding: 'utf8' });
const parsed = JSON.parse(overlay.stdout);
console.log(JSON.stringify({ version: parsed.version, nodes: Object.keys(parsed.nodes), edges: parsed.edges }, null, 2));

heading('Baseline: adopt on a project that is already imperfect');
show('workflow-lint lint . --gen-baseline');
run(['lint', '.', ...V, '--gen-baseline']);
show('workflow-lint lint . --fail-on warn   # only NEW findings fail now');
run(['lint', '.', ...V, '--fail-on', 'warn']);

heading('The node-type bundle, and what changed between versions');
show('workflow-lint node-types list --json');
run(['node-types', 'list', '--json']);
console.log(dim('  One n8n version ships, so the diff below runs on the two tiny synthetic'));
console.log(dim('  bundles the test suite uses (WORKFLOW_LINT_HOME); real ones come from `node-types install`.'));
show('WORKFLOW_LINT_HOME=packages/cli/test/fixtures/workflow-lint-home workflow-lint node-types diff 1.0.0 1.1.0');
run(['node-types', 'diff', '1.0.0', '1.1.0'], {
  env: { WORKFLOW_LINT_HOME: join(REPO, 'packages/cli/test/fixtures/workflow-lint-home') },
});

heading('Rules are self-documenting');
show('workflow-lint rules --json');
const rules = JSON.parse(spawnSync('node', [BIN, 'rules', '--json'], { encoding: 'utf8' }).stdout);
console.log(`  ${rules.length} rules. One of them:`);
console.log(JSON.stringify(rules.find((r) => r.id === 'naming/decision-node-question-mark'), null, 2));

heading('The same checks over MCP, for an agent');
await new Promise((done) => {
  const child = spawn('node', [MCP], { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '';
  const seen = [];
  child.stdout.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) seen.push(JSON.parse(line));
    }
  });
  const send = (m) => child.stdin.write(`${JSON.stringify(m)}\n`);

  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
    protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'demo', version: '0' } } });
  setTimeout(() => {
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: {
      name: 'lint_workflow', arguments: { json: workflow } } });
    send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: {
      name: 'lint_workflow', arguments: { instance: 'https://attacker.test', workflowId: '1' } } });
  }, 400);

  setTimeout(() => {
    const tools = seen.find((m) => m.id === 2)?.result?.tools ?? [];
    console.log(dim('\n  (real stdio JSON-RPC to packages/mcp/dist/bin.js)'));
    console.log(`  tools: ${tools.map((t) => t.name).sort().join(', ')}`);
    const lint = JSON.parse(seen.find((m) => m.id === 3).result.content[0].text);
    console.log(`  lint_workflow → ${lint.findings.length} findings, summary ${JSON.stringify(lint.summary)}`);
    const refused = seen.find((m) => m.id === 4).result;
    console.log(`  instance access → ${refused.isError ? 'refused' : 'ALLOWED'}: ${refused.content[0].text}`);
    console.log(dim('  (the API key is never sent to a caller-named host)'));
    child.kill();
    done();
  }, 1800);
});

console.log(`\n${bold('── done ')}${'─'.repeat(66)}`);
console.log(`workspace kept for poking at: ${dir}\n`);
