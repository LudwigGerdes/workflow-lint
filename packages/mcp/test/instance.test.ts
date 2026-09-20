import { describe, it, expect } from 'vitest';
import { createInstanceFetcher } from '../src/instance.js';

// Every test injects fetch. The suite runs under `unshare -rn` in CI, so a
// handler reaching the real network would fail the offline gate.
const stub = (
  response: { ok: boolean; status: number; body: string },
  seen: { url?: string; headers?: Record<string, string> },
) =>
  (async (url: string | URL, init?: { headers?: Record<string, string> }) => {
    seen.url = String(url);
    seen.headers = init?.headers;
    return {
      ok: response.ok,
      status: response.status,
      text: async () => response.body,
    };
  }) as unknown as typeof fetch;

describe('createInstanceFetcher', () => {
  it('calls the public workflow endpoint with the API key header', async () => {
    const seen: { url?: string; headers?: Record<string, string> } = {};
    const fetcher = createInstanceFetcher({
      apiKey: 'k-123',
      allowedInstance: 'https://dev.example',
      fetchImpl: stub({ ok: true, status: 200, body: '{"data":{"nodes":[]}}' }, seen),
    });

    const body = await fetcher('https://dev.example', '42');
    expect(seen.url).toBe('https://dev.example/api/v1/workflows/42');
    expect(seen.headers?.['X-N8N-API-KEY']).toBe('k-123');
    expect(body).toBe('{"data":{"nodes":[]}}');
  });

  it('does not double up a trailing slash', async () => {
    const seen: { url?: string } = {};
    const fetcher = createInstanceFetcher({
      apiKey: 'k',
      allowedInstance: 'https://dev.example',
      fetchImpl: stub({ ok: true, status: 200, body: '{}' }, seen),
    });
    await fetcher('https://dev.example/', '7');
    expect(seen.url).toBe('https://dev.example/api/v1/workflows/7');
  });

  it('throws naming the status and workflow', async () => {
    const fetcher = createInstanceFetcher({
      apiKey: 'k',
      allowedInstance: 'https://dev.example',
      fetchImpl: stub({ ok: false, status: 404, body: 'not found' }, {}),
    });
    await expect(fetcher('https://dev.example', '42')).rejects.toThrow(
      /n8n API responded 404 for workflow 42/,
    );
  });
});
