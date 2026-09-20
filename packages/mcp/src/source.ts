import { resolve, sep } from 'node:path';

export interface WorkflowSource {
  json?: unknown;
  path?: string;
  instance?: string;
  workflowId?: string;
}

export interface SourceDeps {
  cwd: string;
  readFile: (path: string) => Promise<string>;
  /**
   * Injected so the network stays out of the default build and out of every
   * test — CI runs the suite with no network namespace at all. Absent means
   * instance access is simply unavailable.
   */
  fetchWorkflow?: (instance: string, workflowId: string) => Promise<string>;
}

export class SourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceError';
  }
}

/**
 * Turn one of the three accepted inputs — an inline workflow, a path, or a
 * workflow living on an n8n instance — into text the linter can parse, plus a
 * label to report findings against.
 */
export async function resolveSource(
  deps: SourceDeps,
  source: WorkflowSource,
): Promise<{ text: string; path: string }> {
  const given = [
    source.json !== undefined ? 'json' : undefined,
    source.path !== undefined ? 'path' : undefined,
    source.instance !== undefined ? 'instance' : undefined,
  ].filter((x): x is string => x !== undefined);

  if (given.length === 0) {
    throw new SourceError('give one of json, path, or instance + workflowId');
  }
  if (given.length > 1) {
    throw new SourceError(`give only one source, got ${given.join(' and ')}`);
  }

  if (source.json !== undefined) {
    // A model frequently sends the document as a JSON string rather than an
    // object. Parse it, so the string is linted rather than mistaken for a
    // (clean, empty) document — and say so plainly when it is not JSON at all.
    let document: unknown = source.json;
    if (typeof document === 'string') {
      try {
        document = JSON.parse(document) as unknown;
      } catch (error) {
        throw new SourceError(
          `json is a string that is not valid JSON (${(error as Error).message}); pass the workflow as an object`,
        );
      }
    }
    return { text: JSON.stringify(document, null, 2), path: '<inline>' };
  }

  if (source.path !== undefined) {
    // Confine reads to the working directory. An MCP server runs with the
    // user's privileges and is driven by a model that can be steered by the
    // very content it reads, so `../../` must not reach the filesystem.
    const root = resolve(deps.cwd);
    const target = resolve(root, source.path);
    if (target !== root && !target.startsWith(`${root}${sep}`)) {
      throw new SourceError(`path escapes the working directory: ${source.path}`);
    }
    return { text: await deps.readFile(target), path: source.path };
  }

  const instance = source.instance!;
  if (source.workflowId === undefined) {
    throw new SourceError('instance requires workflowId');
  }
  if (!deps.fetchWorkflow) {
    throw new SourceError('instance access is not enabled on this server');
  }
  return {
    text: await deps.fetchWorkflow(instance, source.workflowId),
    path: `${instance}/${source.workflowId}`,
  };
}
