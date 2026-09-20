import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Rule } from 'workflow-lint-core';
import { rules as n8nRules } from 'workflow-lint-plugin-n8n';
import { rules as standardsRules } from 'workflow-lint-plugin-standards';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { packageRoot } from 'workflow-lint-node-types';
import {
  explainRule,
  fixWorkflow,
  formatWorkflow,
  lintWorkflow,
  listRules,
  type HandlerDeps,
} from './handlers.js';

/** The package's own version, so the server never advertises a stale literal. */
const packageVersion = (): string =>
  (
    JSON.parse(readFileSync(join(packageRoot(import.meta.url), 'package.json'), 'utf8')) as {
      version: string;
    }
  ).version;

export const TOOL_NAMES = [
  'lint_workflow',
  'fix_workflow',
  'format_workflow',
  'list_rules',
  'explain_rule',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

/**
 * A type alias, not an interface: the SDK's result type carries an index
 * signature, and TypeScript gives an implicit one to type aliases of object
 * literals but never to interfaces — so an interface here fails to assign.
 */
export type ToolContent = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

/** A tool result is JSON as text; stdio reserves stdout for protocol frames. */
export const toolResult = (value: unknown): ToolContent => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
});

export const toolError = (error: unknown): ToolContent => ({
  content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
  isError: true,
});

/** Run a handler, turning a throw into an MCP error result rather than a crash. */
export const runTool = async (fn: () => unknown | Promise<unknown>): Promise<ToolContent> => {
  try {
    return toolResult(await fn());
  } catch (error) {
    return toolError(error);
  }
};

export interface ServerOptions {
  registry?: Map<string, Rule>;
  cwd?: string;
  n8nVersion?: string;
  /** Set only when the server is configured for instance access. */
  fetchWorkflow?: (instance: string, workflowId: string) => Promise<string>;
}

export const defaultRegistry = (): Map<string, Rule> =>
  new Map([...n8nRules, ...standardsRules].map((r) => [r.meta.id, r]));

/** The three workflow tools all accept the same three source shapes. */
const sourceShape = {
  json: z
    .unknown()
    .optional()
    .describe('An inline workflow document, as a JSON object (a JSON string is parsed first)'),
  path: z.string().optional().describe('Path to a workflow JSON file, relative to cwd'),
  instance: z.string().optional().describe('Base URL of an n8n instance'),
  workflowId: z.string().optional().describe('Workflow id on that instance'),
};

export function createServer(options: ServerOptions = {}): McpServer {
  const deps: HandlerDeps = {
    registry: options.registry ?? defaultRegistry(),
    cwd: options.cwd ?? process.cwd(),
    readFile: (path) => readFile(path, 'utf8'),
    ...(options.n8nVersion !== undefined ? { n8nVersion: options.n8nVersion } : {}),
    ...(options.fetchWorkflow ? { fetchWorkflow: options.fetchWorkflow } : {}),
  };

  const server = new McpServer({ name: 'workflow-lint', version: packageVersion() });

  server.registerTool(
    'lint_workflow',
    {
      title: 'Lint an n8n workflow',
      description:
        'Report standards violations in a workflow. Give exactly one of json, path, or instance + workflowId.',
      inputSchema: sourceShape,
    },
    async (args) => runTool(() => lintWorkflow(deps, args)),
  );

  server.registerTool(
    'fix_workflow',
    {
      title: 'Apply safe fixes to an n8n workflow',
      description:
        'Return the workflow with safe fixes applied, and whatever findings remain. Set unsafe to also apply fixes that may change behaviour.',
      inputSchema: { ...sourceShape, unsafe: z.boolean().optional() },
    },
    async (args) => runTool(() => fixWorkflow(deps, args)),
  );

  server.registerTool(
    'format_workflow',
    {
      title: 'Lay out an n8n workflow canvas',
      description:
        'Return the workflow with node positions normalised. Set stickies to also resize sticky notes.',
      inputSchema: { ...sourceShape, stickies: z.boolean().optional() },
    },
    async (args) => runTool(() => formatWorkflow(deps, args)),
  );

  server.registerTool(
    'list_rules',
    {
      title: 'List every rule',
      description: 'Every rule this server enforces, with its level and whether it is fixable.',
      inputSchema: {},
    },
    async () => runTool(() => listRules(deps)),
  );

  server.registerTool(
    'explain_rule',
    {
      title: 'Explain one rule',
      description: 'The reference page for a rule, generated from its metadata.',
      inputSchema: { ruleId: z.string().describe('For example naming/no-default-node-name') },
    },
    async (args) => runTool(() => explainRule(deps, args)),
  );

  return server;
}
