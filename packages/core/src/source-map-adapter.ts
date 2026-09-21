import { readFileSync } from 'node:fs';
import { parseWorkflow } from './parse.js';
import type { Location } from './types.js';

/**
 * The whole surface another tool may rely on for turning a node name
 * into a position in the file it came from.
 *
 * Deliberately one synchronous method returning `undefined` rather than
 * throwing: consumers load this by dynamic import and are expected to ignore
 * failure, so an adapter that throws would push error handling onto every
 * caller for a feature none of them require.
 */
export interface SourceMapAdapter {
  nodeLine(filePath: string, nodeName: string): Location | undefined;
}

export interface SourceMapAdapterOptions {
  /** Injected for tests; defaults to reading the file synchronously. */
  readFile?: (path: string) => string;
}

type Lookup = ((nodeName: string) => Location | undefined) | null;

export function createSourceMapAdapter(
  options: SourceMapAdapterOptions = {},
): SourceMapAdapter {
  const read = options.readFile ?? ((path: string) => readFileSync(path, 'utf8'));

  // One parse per file for the adapter's lifetime. `null` records a file that
  // could not be read or parsed, so a bad path is not retried on every lookup;
  // `undefined` means simply not seen yet.
  const parsed = new Map<string, Lookup>();

  return {
    nodeLine(filePath: string, nodeName: string): Location | undefined {
      let lookup = parsed.get(filePath);
      if (lookup === undefined) {
        try {
          const { workflow } = parseWorkflow(read(filePath), filePath);
          lookup = workflow ? (name: string) => workflow.sourceMap.node(name) : null;
        } catch {
          lookup = null;
        }
        parsed.set(filePath, lookup);
      }
      return lookup ? lookup(nodeName) : undefined;
    },
  };
}
