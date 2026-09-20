import { describe, it, expect } from 'vitest';
import { resolveSource, SourceError, type SourceDeps } from '../src/source.js';

const deps = (over: Partial<SourceDeps> = {}): SourceDeps => ({
  cwd: '/repo',
  readFile: async (p) => `{"read":"${p}"}`,
  ...over,
});

describe('resolveSource', () => {
  it('takes an inline workflow', async () => {
    const r = await resolveSource(deps(), { json: { nodes: [], connections: {} } });
    expect(r.path).toBe('<inline>');
    expect(JSON.parse(r.text)).toEqual({ nodes: [], connections: {} });
  });

  it('reads a path, resolved against cwd', async () => {
    const r = await resolveSource(deps(), { path: 'dev/w.json' });
    expect(r.path).toBe('dev/w.json');
    expect(r.text).toContain('/repo/dev/w.json');
  });

  it('fetches from an instance when a fetcher is supplied', async () => {
    const calls: string[] = [];
    const r = await resolveSource(
      deps({
        fetchWorkflow: async (i, id) => {
          calls.push(`${i}|${id}`);
          return '{"data":{}}';
        },
      }),
      { instance: 'https://dev.example', workflowId: '42' },
    );
    expect(calls).toEqual(['https://dev.example|42']);
    expect(r.path).toBe('https://dev.example/42');
  });

  it('refuses an instance when no fetcher is available', async () => {
    await expect(
      resolveSource(deps(), { instance: 'https://dev.example', workflowId: '42' }),
    ).rejects.toBeInstanceOf(SourceError);
  });

  it('refuses nothing, and refuses more than one source', async () => {
    await expect(resolveSource(deps(), {})).rejects.toBeInstanceOf(SourceError);
    await expect(resolveSource(deps(), { json: {}, path: 'a.json' })).rejects.toBeInstanceOf(
      SourceError,
    );
  });

  it('requires workflowId alongside instance', async () => {
    await expect(
      resolveSource(deps({ fetchWorkflow: async () => '{}' }), { instance: 'https://x' }),
    ).rejects.toBeInstanceOf(SourceError);
  });
});
