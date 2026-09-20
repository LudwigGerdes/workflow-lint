import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { resolveConfig, type UserConfig } from 'workflow-lint-core';
import { buildProgram, buildRegistry, CONFIG_FILE } from '../src/index.js';

let dir: string;
let out: string;
let err: string;
let code: number;

const run = async (args: string[]) => {
  out = '';
  err = '';
  code = 0;
  await buildProgram({
    write: (t) => {
      out += t;
    },
    writeErr: (t) => {
      err += t;
    },
    cwd: dir,
    setExitCode: (c) => {
      code = c;
    },
  }).parseAsync(args, { from: 'user' });
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'workflow-lint-init-'));
});

describe('workflow-lint init', () => {
  it('writes a config that parses and resolves', async () => {
    await run(['init']);
    expect(code).toBe(0);
    expect(out).toContain(CONFIG_FILE);
    const path = join(dir, CONFIG_FILE);
    expect(existsSync(path)).toBe(true);

    const config = parseYaml(readFileSync(path, 'utf8')) as UserConfig;
    expect(config.extends).toEqual(['workflow-lint:recommended']);
    // The generated file must actually work, not merely parse.
    const resolved = resolveConfig(config, buildRegistry());
    expect(resolved.rules.size).toBeGreaterThan(0);
  });

  it('refuses to overwrite an existing config', async () => {
    writeFileSync(join(dir, CONFIG_FILE), 'extends: []\n');
    await run(['init']);
    expect(code).toBe(2);
    expect(err).toContain('already exists');
    expect(readFileSync(join(dir, CONFIG_FILE), 'utf8')).toBe('extends: []\n');
  });
});

describe('workflow-lint rules', () => {
  it('lists rules as a table', async () => {
    await run(['rules']);
    expect(code).toBe(0);
    expect(out).toContain('naming/no-default-node-name');
    expect(out).toContain('n8n/valid');
    expect(out).toMatch(/\d+ rules/);
  });

  it('lists rules as JSON', async () => {
    await run(['rules', '--json']);
    const rules = JSON.parse(out) as Array<{ id: string; recommended: string; fixable: string | null }>;
    expect(rules.length).toBe(buildRegistry().size);
    const rule = rules.find((r) => r.id === 'naming/decision-node-question-mark')!;
    expect(rule.recommended).toBe('warn');
    expect(rule.fixable).toBe('connections');
  });
});
