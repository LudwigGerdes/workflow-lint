export interface InstanceOptions {
  apiKey: string;
  /**
   * The single instance this fetcher may talk to. Required, so a fetcher
   * cannot be built without saying where the key is allowed to go.
   */
  allowedInstance: string;
  /** Injected for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/** n8n workflow ids are plain identifiers; anything else is an attempt to retarget the path. */
const WORKFLOW_ID = /^[A-Za-z0-9_-]+$/;

const normalise = (url: string): string => url.replace(/\/+$/, '');

const requireHttp = (url: string): URL => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`instance is not a valid URL: ${url}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`instance must be http or https, got ${parsed.protocol}`);
  }
  return parsed;
};

/**
 * The only networked code in the shipped product.
 *
 * It carries an API key, and the caller — an agent, which may be acting on
 * text it just read — chooses the instance. So the instance is pinned at
 * construction: a request to anywhere else is refused before any request is
 * made, and the key never leaves the process. The workflow id is validated
 * and encoded so it cannot walk the API path either.
 *
 * The response is returned verbatim: n8n wraps a workflow as `{ "data": … }`,
 * which the parser already unwraps.
 */
export function createInstanceFetcher(
  options: InstanceOptions,
): (instance: string, workflowId: string) => Promise<string> {
  const allowed = normalise(options.allowedInstance);
  const allowedUrl = requireHttp(allowed);
  const call = options.fetchImpl ?? fetch;

  return async (instance: string, workflowId: string): Promise<string> => {
    const requested = normalise(instance);
    const requestedUrl = requireHttp(requested);

    if (requestedUrl.origin !== allowedUrl.origin || requested !== allowed) {
      // Deliberately does not echo the configured instance: the caller may be
      // a model acting on untrusted text, and it does not need the host name.
      throw new Error(`${instance} is not an allowed instance for this server`);
    }
    if (!WORKFLOW_ID.test(workflowId)) {
      throw new Error(`invalid workflow id: ${workflowId}`);
    }

    const response = await call(
      `${allowed}/api/v1/workflows/${encodeURIComponent(workflowId)}`,
      { headers: { 'X-N8N-API-KEY': options.apiKey, Accept: 'application/json' } },
    );
    if (!response.ok) {
      throw new Error(`n8n API responded ${response.status} for workflow ${workflowId}`);
    }
    return await response.text();
  };
}
