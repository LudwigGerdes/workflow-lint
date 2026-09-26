#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createInstanceFetcher } from './instance.js';
import { createServer } from './server.js';

// Instance access is off unless BOTH a key and the instance it belongs to are
// configured. Pinning the instance is what stops a caller naming a host of
// its own and being handed the API key.
const apiKey = process.env['WORKFLOW_LINT_N8N_API_KEY'];
const allowedInstance = process.env['WORKFLOW_LINT_N8N_INSTANCE'];
const n8nVersion = process.env['WORKFLOW_LINT_N8N_VERSION'];
const configPath = process.env['WORKFLOW_LINT_CONFIG'];

const server = createServer({
  ...(n8nVersion !== undefined ? { n8nVersion } : {}),
  ...(configPath !== undefined ? { configPath } : {}),
  ...(apiKey && allowedInstance
    ? { fetchWorkflow: createInstanceFetcher({ apiKey, allowedInstance }) }
    : {}),
});

// Nothing may write to stdout but the transport; stdout carries protocol frames.
await server.connect(new StdioServerTransport());
