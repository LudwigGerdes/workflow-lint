import type { Rule } from 'workflow-lint-core';
import type { INode } from 'n8n-workflow';
import { NOOP, RESPOND_TO_WEBHOOK, SET, STOP_AND_ERROR } from '../../node-types.js';

/** Nodes that legitimately end a path. */
const TERMINAL_TYPES = new Set<string>([RESPOND_TO_WEBHOOK, STOP_AND_ERROR, NOOP]);

/** Notification tails: the point is the side effect, not the output. */
const NOTIFICATION =
  /^n8n-nodes-base\.(slack|gmail|emailSend|telegram|discord|microsoftTeams|twilio|sendGrid)$/;

const PASS_THROUGH_NAME = /pass[- ]?through/i;

export const rule: Rule = {
  meta: {
    id: 'structure/no-dangling-node',
    type: 'suggestion',
    class: 'quality',
    fixable: null,
    docs: {
      description:
        'A path that stops short while the workflow carries on elsewhere is abandoned work.',
      recommended: 'warn',
    },
    schema: { type: 'object', properties: { terminalTypes: { type: 'array' } } },
    messages: {
      dangling:
        'Node "{{name}}" stops here while the workflow continues elsewhere; its output goes nowhere.',
    },
  },
  create(ctx) {
    const { terminalTypes = [] } = (ctx.options ?? {}) as { terminalTypes?: string[] };
    const extra = new Set(terminalTypes);

    const mainOut = (name: string) => ctx.graph.outgoing(name).filter((e) => e.type === 'main');
    const mainIn = (name: string) => ctx.graph.incoming(name).filter((e) => e.type === 'main');

    /**
     * How far each node sits from an entry point, and how far the furthest
     * ending sits. A workflow has to stop somewhere, so an ending at that
     * depth is the end; one short of it abandoned work the rest carried on
     * without.
     */
    let geometry: { depth: Map<string, number>; deepestEnd: number } | undefined;
    const measure = () => {
      if (geometry) return geometry;
      const depth = new Map<string, number>();
      const queue = ctx.graph.nodes
        .filter((n) => mainIn(n.name).length === 0)
        .map((n) => n.name);
      for (const root of queue) depth.set(root, 0);
      while (queue.length > 0) {
        const current = queue.shift()!;
        const at = depth.get(current) ?? 0;
        for (const edge of mainOut(current)) {
          if (depth.has(edge.to)) continue;
          depth.set(edge.to, at + 1);
          queue.push(edge.to);
        }
      }
      const deepestEnd = ctx.graph.nodes
        .filter((n) => mainOut(n.name).length === 0)
        .reduce((deepest, n) => Math.max(deepest, depth.get(n.name) ?? 0), 0);
      geometry = { depth, deepestEnd };
      return geometry;
    };

    const isTerminal = (node: INode): boolean =>
      TERMINAL_TYPES.has(node.type) ||
      extra.has(node.type) ||
      NOTIFICATION.test(node.type) ||
      (node.type === SET && PASS_THROUGH_NAME.test(node.name));

    return {
      Node(target) {
        const node = target as INode;
        // Sub-nodes and tools attach sideways; n8n/valid covers unconnected ones.
        if (ctx.n8n.isSubNode(node) || ctx.n8n.isTool(node)) return;
        // A type the pack does not know cannot be judged — and n8n generates
        // <node>Tool variants at runtime, so isTool() cannot recognise them.
        // n8n/valid reports the unknown type itself.
        if (ctx.n8n.nodeType(node) === undefined) return;
        if (mainOut(node.name).length > 0) return;
        if (isTerminal(node)) return;

        // Ending as deep as anything else in the workflow is just the end.
        const { depth, deepestEnd } = measure();
        if ((depth.get(node.name) ?? 0) >= deepestEnd) return;

        ctx.report({ node, messageId: 'dangling', data: { name: node.name } });
      },
    };
  },
};
