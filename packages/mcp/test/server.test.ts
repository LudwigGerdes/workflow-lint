import { describe, it, expect } from 'vitest';
import {
  TOOL_NAMES,
  createServer,
  defaultRegistry,
  runTool,
  toolError,
  toolResult,
} from '../src/server.js';

describe('tool results', () => {
  it('carries JSON as text content', () => {
    const out = toolResult({ a: 1 });
    expect(out.content[0]!.type).toBe('text');
    expect(JSON.parse(out.content[0]!.text)).toEqual({ a: 1 });
    expect(out.isError).toBeUndefined();
  });

  it('turns a thrown error into an error result rather than a crash', async () => {
    const out = await runTool(() => {
      throw new Error('unknown rule "nope/nope"');
    });
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toContain('unknown rule');
  });

  it('handles a rejected promise too', async () => {
    const out = await runTool(async () => {
      throw new Error('instance access is not enabled on this server');
    });
    expect(out.isError).toBe(true);
    expect(out.content[0]!.text).toContain('not enabled');
  });

  it('reports a non-Error throw without losing it', () => {
    expect(toolError('plain string').content[0]!.text).toBe('plain string');
  });
});

describe('createServer', () => {
  it('names the five tools from the spec', () => {
    expect([...TOOL_NAMES]).toEqual([
      'lint_workflow',
      'fix_workflow',
      'format_workflow',
      'list_rules',
      'explain_rule',
    ]);
  });

  it('builds without a fetcher, and registers every tool', () => {
    const server = createServer({ registry: defaultRegistry(), cwd: '/repo' });
    expect(server).toBeDefined();
    // The SDK keeps registered tools on the server; assert all five landed.
    const registered = Object.keys(
      (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools,
    ).sort();
    expect(registered).toEqual([...TOOL_NAMES].sort());
  });

  it('accepts an injected fetcher for instance access', () => {
    const server = createServer({ fetchWorkflow: async () => '{}' });
    expect(server).toBeDefined();
  });
});
