import { createHash } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import type { PackManifest } from './manifest.js';

/**
 * Download one n8n version's node descriptions from the npm registry.
 *
 * It runs only when someone asks for it (`node-types install`, or the
 * dev-time `bundle` script). Linting and formatting read what is already on
 * disk and never call it.
 *
 * The <version> is the n8n APP version (what an instance reports). n8n's
 * libraries carry their own version numbers, so the app's dependency pins are
 * resolved first and recorded in meta.json as the version manifest.
 */

export const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

const LIBS = ['n8n-workflow', 'n8n-nodes-base', '@n8n/n8n-nodes-langchain'] as const;
const NODES_JSON = 'package/dist/types/nodes.json';

export interface FetchBundleOptions {
  /** Injected in tests; defaults to the global `fetch`. */
  fetch?: typeof globalThis.fetch;
  registry?: string;
  /** Injected in tests; defaults to now. */
  now?: () => Date;
}

/**
 * Fetch n8n `version` and write `<root>/<version>/{base,langchain,meta}.json`.
 * The files are staged beside the target and renamed into place last, so a
 * failed download never leaves a half-written bundle that looks installed.
 */
export async function fetchBundle(
  version: string,
  root: string,
  options: FetchBundleOptions = {},
): Promise<PackManifest> {
  // The version becomes a directory name, so accept nothing but x.y.z.
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`"${version}" is not an n8n version`);
  const fetch = options.fetch ?? globalThis.fetch;
  const registry = (options.registry ?? DEFAULT_REGISTRY).replace(/\/$/, '');

  const getJson = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${registry}/${path}`);
    if (!res.ok) throw new Error(`npm registry: GET ${path} returned ${res.status}`);
    return (await res.json()) as T;
  };

  let app: { dependencies?: Record<string, string> };
  try {
    app = await getJson(`n8n/${version}`);
  } catch (error) {
    throw new Error(`could not resolve n8n@${version} on the npm registry: ${(error as Error).message}`);
  }
  const deps = app.dependencies ?? {};
  const libs = Object.fromEntries(
    LIBS.map((name) => {
      const pin = deps[name];
      if (pin === undefined || !/^\d+\.\d+\.\d+$/.test(pin)) {
        throw new Error(`n8n@${version}: no exact pin for ${name} (got ${pin ?? 'nothing'})`);
      }
      return [name, pin];
    }),
  ) as NonNullable<PackManifest['libs']>;

  const nodesJson = async (pkg: string, pin: string): Promise<Buffer> => {
    const meta = await getJson<{ dist: { tarball: string; integrity?: string } }>(
      `${pkg.replace('/', '%2f')}/${pin}`,
    );
    const res = await fetch(meta.dist.tarball);
    if (!res.ok) throw new Error(`npm registry: download of ${pkg}@${pin} returned ${res.status}`);
    const tgz = Buffer.from(await res.arrayBuffer());
    verifyIntegrity(tgz, meta.dist.integrity, `${pkg}@${pin}`);
    const file = await extractTarEntry(Readable.from([tgz]).pipe(createGunzip()), NODES_JSON);
    if (file === undefined) throw new Error(`${pkg}@${pin} has no ${NODES_JSON}`);
    return file;
  };

  const [base, langchain] = await Promise.all([
    nodesJson('n8n-nodes-base', libs['n8n-nodes-base']),
    nodesJson('@n8n/n8n-nodes-langchain', libs['@n8n/n8n-nodes-langchain']),
  ]);

  const manifest: PackManifest = {
    n8nVersion: version,
    bundledAt: (options.now ?? (() => new Date()))().toISOString(),
    libs,
    sources: {
      base: `n8n-nodes-base@${libs['n8n-nodes-base']}`,
      langchain: `@n8n/n8n-nodes-langchain@${libs['@n8n/n8n-nodes-langchain']}`,
    },
  };

  const target = join(root, version);
  const staging = join(root, `.${version}.${process.pid}.partial`);
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  try {
    await writeFile(join(staging, 'base.json'), base);
    await writeFile(join(staging, 'langchain.json'), langchain);
    await writeFile(join(staging, 'meta.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await rm(target, { recursive: true, force: true });
    await rename(staging, target);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  return manifest;
}

/** Check an npm `dist.integrity` string (`sha512-<base64>`) against the bytes. */
function verifyIntegrity(bytes: Buffer, integrity: string | undefined, label: string): void {
  if (integrity === undefined) throw new Error(`${label}: the registry gave no integrity hash`);
  const match = /^sha512-(.+)$/.exec(integrity.split(/\s+/).find((i) => i.startsWith('sha512-')) ?? '');
  if (!match) throw new Error(`${label}: no sha512 integrity hash to verify against`);
  const actual = createHash('sha512').update(bytes).digest('base64');
  if (actual !== match[1]) throw new Error(`${label}: integrity check failed`);
}

const BLOCK = 512;

/**
 * Read one file out of an uncompressed tar stream, holding only that file in
 * memory. Handles ustar prefixes and the pax / GNU long-name headers npm
 * tarballs may carry; everything else is skipped.
 */
export async function extractTarEntry(
  stream: AsyncIterable<Uint8Array>,
  wanted: string,
): Promise<Buffer | undefined> {
  let pending = Buffer.alloc(0);
  let result: Buffer | undefined;
  // Body of the current entry: bytes left to read, and where they go.
  let remaining = 0;
  let padding = 0;
  let sink: 'skip' | 'wanted' | 'longname' | 'pax' = 'skip';
  let parts: Buffer[] = [];
  let nextName: string | undefined;

  const finishBody = (): void => {
    const body = Buffer.concat(parts);
    parts = [];
    if (sink === 'wanted') result = body;
    if (sink === 'longname') nextName = body.toString('utf8').replace(/\0.*$/s, '');
    // A pax header is `<len> key=value\n` records; only `path` matters here.
    if (sink === 'pax') {
      const path = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString('utf8'));
      if (path) nextName = path[1];
    }
  };

  for await (const chunk of stream) {
    pending = pending.length === 0 ? Buffer.from(chunk) : Buffer.concat([pending, chunk]);
    for (;;) {
      if (remaining > 0) {
        const take = Math.min(remaining, pending.length);
        if (take === 0) break;
        if (sink !== 'skip') parts.push(pending.subarray(0, take));
        pending = pending.subarray(take);
        remaining -= take;
        if (remaining === 0) finishBody();
        continue;
      }
      if (padding > 0) {
        const take = Math.min(padding, pending.length);
        if (take === 0) break;
        pending = pending.subarray(take);
        padding -= take;
        continue;
      }
      if (pending.length < BLOCK) break;
      const header = pending.subarray(0, BLOCK);
      pending = pending.subarray(BLOCK);
      if (header.every((b) => b === 0)) continue;

      const field = (start: number, length: number): string =>
        header.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '');
      const size = parseInt(field(124, 12).trim() || '0', 8);
      const type = field(156, 1);
      const prefix = field(257, 5) === 'ustar' ? field(345, 155) : '';
      const name = nextName ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));

      if (type === 'x') {
        sink = 'pax';
      } else if (type === 'L') {
        sink = 'longname';
      } else if (type === 'g') {
        sink = 'skip';
      } else {
        nextName = undefined;
        sink = name === wanted && (type === '0' || type === '') ? 'wanted' : 'skip';
      }
      remaining = size;
      padding = (BLOCK - (size % BLOCK)) % BLOCK;
      if (size === 0) finishBody();
    }
  }
  return result;
}
