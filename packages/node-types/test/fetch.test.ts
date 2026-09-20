import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { beforeEach, describe, expect, it } from 'vitest';
import { extractTarEntry, fetchBundle } from '../src/fetch.js';

/** A ustar header block for a regular file (or a pax / long-name record). */
const header = (name: string, size: number, type = '0'): Buffer => {
  const h = Buffer.alloc(512);
  h.write(name.slice(0, 100), 0, 'utf8');
  h.write('0000644\0', 100);
  h.write('0000000\0', 108);
  h.write('0000000\0', 116);
  h.write(`${size.toString(8).padStart(11, '0')}\0`, 124);
  h.write('00000000000\0', 136);
  h.write('        ', 148);
  h.write(type, 156);
  h.write('ustar\0', 257);
  h.write('00', 263);
  const sum = h.reduce((a, b) => a + b, 0);
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  return h;
};

const pad = (b: Buffer): Buffer => Buffer.concat([b, Buffer.alloc((512 - (b.length % 512)) % 512)]);

type Entry = { name: string; body: string; pax?: boolean };

const tar = (entries: Entry[]): Buffer =>
  Buffer.concat([
    ...entries.flatMap(({ name, body, pax }) => {
      const data = Buffer.from(body);
      if (!pax) return [header(name, data.length), pad(data)];
      // Stand-in short name in the ustar header; the real path is in the pax record.
      const record = (len: number) => `${len} path=${name}\n`;
      let len = record(0).length;
      while (record(len).length !== len) len = record(len).length;
      const paxBody = Buffer.from(record(len));
      return [header('PaxHeader', paxBody.length, 'x'), pad(paxBody), header('short', data.length), pad(data)];
    }),
    Buffer.alloc(1024),
  ]);

const chunked = async function* (b: Buffer, size: number): AsyncIterable<Uint8Array> {
  for (let i = 0; i < b.length; i += size) yield b.subarray(i, i + size);
};

describe('extractTarEntry', () => {
  it('finds a file among others, across arbitrary chunk boundaries', async () => {
    const archive = tar([
      { name: 'package/README.md', body: 'x'.repeat(700) },
      { name: 'package/dist/types/nodes.json', body: '[{"name":"set"}]' },
      { name: 'package/other.js', body: 'y' },
    ]);
    for (const size of [1, 7, 511, 512, 513, 4096]) {
      const file = await extractTarEntry(chunked(archive, size), 'package/dist/types/nodes.json');
      expect(file?.toString()).toBe('[{"name":"set"}]');
    }
  });

  it('honours a pax path record', async () => {
    const archive = tar([{ name: 'package/dist/types/nodes.json', body: '[]', pax: true }]);
    const file = await extractTarEntry(chunked(archive, 100), 'package/dist/types/nodes.json');
    expect(file?.toString()).toBe('[]');
  });

  it('returns undefined when the file is absent', async () => {
    const archive = tar([{ name: 'package/a', body: 'a' }]);
    expect(await extractTarEntry(chunked(archive, 512), 'package/b')).toBeUndefined();
  });
});

const REGISTRY = 'https://registry.test';
const tgz = (nodes: string): Buffer =>
  gzipSync(tar([{ name: 'package/dist/types/nodes.json', body: nodes }]));
const sri = (b: Buffer): string => `sha512-${createHash('sha512').update(b).digest('base64')}`;

interface FakeRegistry {
  fetch: typeof globalThis.fetch;
  requests: string[];
}

const fakeRegistry = (
  overrides: { deps?: Record<string, string>; integrity?: string } = {},
): FakeRegistry => {
  const base = tgz('[{"name":"set"}]');
  const langchain = tgz('[{"name":"agent"}]');
  const routes: Record<string, unknown> = {
    [`${REGISTRY}/n8n/2.40.0`]: {
      dependencies: overrides.deps ?? {
        'n8n-workflow': '2.40.1',
        'n8n-nodes-base': '2.40.2',
        '@n8n/n8n-nodes-langchain': '2.40.3',
      },
    },
    [`${REGISTRY}/n8n-nodes-base/2.40.2`]: {
      dist: { tarball: `${REGISTRY}/base.tgz`, integrity: overrides.integrity ?? sri(base) },
    },
    [`${REGISTRY}/@n8n%2fn8n-nodes-langchain/2.40.3`]: {
      dist: { tarball: `${REGISTRY}/langchain.tgz`, integrity: sri(langchain) },
    },
    [`${REGISTRY}/base.tgz`]: base,
    [`${REGISTRY}/langchain.tgz`]: langchain,
  };
  const requests: string[] = [];
  const fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    requests.push(url);
    const body = routes[url];
    if (body === undefined) return new Response('not found', { status: 404 });
    return Buffer.isBuffer(body) ? new Response(body) : Response.json(body);
  }) as typeof globalThis.fetch;
  return { fetch, requests };
};

describe('fetchBundle', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'fetch-bundle-'));
  });

  const now = () => new Date('2026-09-13T00:00:00.000Z');

  it('writes base, langchain and a version manifest', async () => {
    const { fetch } = fakeRegistry();
    const manifest = await fetchBundle('2.40.0', root, { fetch, registry: REGISTRY, now });
    expect(manifest).toEqual({
      n8nVersion: '2.40.0',
      bundledAt: '2026-09-13T00:00:00.000Z',
      libs: { 'n8n-workflow': '2.40.1', 'n8n-nodes-base': '2.40.2', '@n8n/n8n-nodes-langchain': '2.40.3' },
      sources: { base: 'n8n-nodes-base@2.40.2', langchain: '@n8n/n8n-nodes-langchain@2.40.3' },
    });
    const dir = join(root, '2.40.0');
    expect(await readFile(join(dir, 'base.json'), 'utf8')).toBe('[{"name":"set"}]');
    expect(await readFile(join(dir, 'langchain.json'), 'utf8')).toBe('[{"name":"agent"}]');
    expect(JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'))).toEqual(manifest);
    // No staging directory is left behind.
    expect(await readdir(root)).toEqual(['2.40.0']);
  });

  it('refuses a tarball whose hash does not match, leaving nothing installed', async () => {
    const { fetch } = fakeRegistry({ integrity: sri(Buffer.from('something else')) });
    await expect(fetchBundle('2.40.0', root, { fetch, registry: REGISTRY })).rejects.toThrow(
      /integrity check failed/,
    );
    expect(await readdir(root)).toEqual([]);
  });

  it('refuses a dependency that is a range rather than an exact pin', async () => {
    const { fetch } = fakeRegistry({
      deps: { 'n8n-workflow': '^2.40.1', 'n8n-nodes-base': '2.40.2', '@n8n/n8n-nodes-langchain': '2.40.3' },
    });
    await expect(fetchBundle('2.40.0', root, { fetch, registry: REGISTRY })).rejects.toThrow(
      /no exact pin for n8n-workflow/,
    );
  });

  it('names the version when the registry does not know it', async () => {
    const { fetch } = fakeRegistry();
    await expect(fetchBundle('9.9.9', root, { fetch, registry: REGISTRY })).rejects.toThrow(
      /could not resolve n8n@9\.9\.9/,
    );
    expect(existsSync(join(root, '9.9.9'))).toBe(false);
  });

  it('rejects anything but x.y.z before touching the network or disk', async () => {
    const { fetch, requests } = fakeRegistry();
    await expect(fetchBundle('../../etc', root, { fetch, registry: REGISTRY })).rejects.toThrow(
      /not an n8n version/,
    );
    expect(requests).toEqual([]);
  });
});
