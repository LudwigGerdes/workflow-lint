import { describe, it, expect } from 'vitest';
import { resolveSource, SourceError, type SourceDeps } from '../src/source.js';
import { createInstanceFetcher } from '../src/instance.js';

const deps = (over: Partial<SourceDeps> = {}): SourceDeps => ({
  cwd: '/repo',
  readFile: async (p) => `{"read":"${p}"}`,
  ...over,
});

describe('path traversal', () => {
  it('refuses a path escaping the working directory', async () => {
    await expect(resolveSource(deps(), { path: '../../etc/passwd' })).rejects.toBeInstanceOf(
      SourceError,
    );
  });

  it('refuses an absolute path outside the working directory', async () => {
    await expect(resolveSource(deps(), { path: '/etc/passwd' })).rejects.toBeInstanceOf(
      SourceError,
    );
  });

  it('still allows a path inside the working directory', async () => {
    const r = await resolveSource(deps(), { path: 'dev/w.json' });
    expect(r.path).toBe('dev/w.json');
  });

  it('allows an absolute path that is inside the working directory', async () => {
    const r = await resolveSource(deps(), { path: '/repo/dev/w.json' });
    expect(r.text).toContain('/repo/dev/w.json');
  });
});

const stub = (seen: { url?: string }) =>
  (async (url: string | URL) => {
    seen.url = String(url);
    return { ok: true, status: 200, text: async () => '{}' };
  }) as unknown as typeof fetch;

describe('credential exfiltration', () => {
  it('refuses to send the API key to an instance it was not configured for', async () => {
    const seen: { url?: string } = {};
    const fetcher = createInstanceFetcher({
      apiKey: 'secret',
      allowedInstance: 'https://dev.example',
      fetchImpl: stub(seen),
    });
    await expect(fetcher('https://attacker.test', '1')).rejects.toThrow(/not an allowed instance/i);
    // The key must never have left the process.
    expect(seen.url).toBeUndefined();

    // Nor should the refusal disclose which instance the server is pinned to.
    await expect(fetcher('https://attacker.test', '1')).rejects.not.toThrow(/dev\.example/);
  });

  it('allows the configured instance, ignoring a trailing slash', async () => {
    const seen: { url?: string } = {};
    const fetcher = createInstanceFetcher({
      apiKey: 'secret',
      allowedInstance: 'https://dev.example/',
      fetchImpl: stub(seen),
    });
    await fetcher('https://dev.example', '42');
    expect(seen.url).toBe('https://dev.example/api/v1/workflows/42');
  });
});

describe('url injection', () => {
  it('refuses a workflow id that is not a plain identifier', async () => {
    const seen: { url?: string } = {};
    const fetcher = createInstanceFetcher({
      apiKey: 'k',
      allowedInstance: 'https://dev.example',
      fetchImpl: stub(seen),
    });
    await expect(fetcher('https://dev.example', '1/../../users')).rejects.toThrow(
      /invalid workflow id/i,
    );
    expect(seen.url).toBeUndefined();
  });

  it('refuses a non-http instance scheme at construction, not at call time', () => {
    expect(() =>
      createInstanceFetcher({ apiKey: 'k', allowedInstance: 'file:///etc', fetchImpl: stub({}) }),
    ).toThrow(/http/i);
  });

  it('refuses a caller-supplied non-http instance too', async () => {
    const seen: { url?: string } = {};
    const fetcher = createInstanceFetcher({
      apiKey: 'k',
      allowedInstance: 'https://dev.example',
      fetchImpl: stub(seen),
    });
    await expect(fetcher('file:///etc/passwd', '1')).rejects.toThrow(/http/i);
    expect(seen.url).toBeUndefined();
  });
});
