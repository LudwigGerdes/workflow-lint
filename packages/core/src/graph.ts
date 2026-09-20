import { WorkflowClass, isSubNodeType } from './n8n.js';
import type {
  Workflow,
  IConnections,
  IDataObject,
  INode,
  INodeType,
  INodeTypeDescription,
  INodeTypes,
  IVersionedNodeType,
  IWorkflowSettings,
  NodeConnectionType,
} from 'n8n-workflow';
import type { NodeTypePack } from 'workflow-lint-node-types';
import type { LintWorkflow } from './types.js';

export const STICKY_NOTE_TYPE = 'n8n-nodes-base.stickyNote';

const DEFAULT_STICKY_WIDTH = 240;
const DEFAULT_STICKY_HEIGHT = 160;

export interface OutgoingRef {
  output: number;
  type: string;
  to: string;
  input: number;
}
export interface IncomingRef {
  from: string;
  output: number;
  type: string;
  input: number;
}

/**
 * `Workflow` expects `getByNameAndVersion` to return `undefined` for a node
 * type it does not know, and skips such nodes. `NodeTypePack` deliberately
 * throws instead (its own contract), so wrap it in a lenient adapter for the
 * engine while rules keep the strict pack.
 */
const lenient = (pack: NodeTypePack): INodeTypes => ({
  getByName: (nodeType: string): INodeType | IVersionedNodeType =>
    ({ description: pack.describe(nodeType) }) as INodeType,
  getByNameAndVersion: (nodeType: string, version?: number): INodeType => {
    const description = pack.describe(nodeType, version);
    return (description ? { description } : undefined) as INodeType;
  },
  getKnownTypes: (): IDataObject => pack.getKnownTypes(),
});

type RawConnections = Record<string, Record<string, Array<Array<{ node: string; index: number }> | null>>>;

/** Graph facade over `n8n-workflow`'s `Workflow`, plus the helpers rules need. */
export class LintGraph {
  readonly workflow: Workflow;
  readonly nodes: INode[];
  readonly stickies: INode[];
  private byName = new Map<string, INode>();

  constructor(
    readonly lintWorkflow: LintWorkflow,
    readonly pack: NodeTypePack,
  ) {
    const json = lintWorkflow.json;
    // `Workflow`'s constructor fills in default parameters on the nodes it is
    // given. Hand it a clone so the linted document stays exactly as authored:
    // rules and the fixer must see the original JSON, not a defaulted one.
    this.workflow = new WorkflowClass({
      id: json.id,
      name: json.name,
      nodes: structuredClone(json.nodes),
      connections: structuredClone(json.connections),
      active: false,
      nodeTypes: lenient(pack),
      settings: json.settings as IWorkflowSettings | undefined,
    });

    this.nodes = json.nodes.filter((n) => n.type !== STICKY_NOTE_TYPE);
    this.stickies = json.nodes.filter((n) => n.type === STICKY_NOTE_TYPE);
    for (const n of json.nodes) this.byName.set(n.name, n);
  }

  private get connections(): RawConnections {
    return (this.lintWorkflow.json.connections ?? {}) as RawConnections;
  }

  node(name: string): INode | undefined {
    return this.byName.get(name);
  }

  /**
   * Direct children by default. Note this deviates from n8n's own
   * `getChildNodes`, whose default depth of -1 walks the whole subtree: rules
   * overwhelmingly want the immediate neighbour, so transitive callers must
   * ask for it explicitly with `depth = -1`.
   */
  children(
    name: string,
    type: NodeConnectionType | 'ALL' | 'ALL_NON_MAIN' = 'main' as NodeConnectionType,
    depth = 1,
  ): string[] {
    return this.workflow.getChildNodes(name, type, depth);
  }

  /** Direct parents by default; see the note on {@link children}. */
  parents(
    name: string,
    type: NodeConnectionType | 'ALL' | 'ALL_NON_MAIN' = 'main' as NodeConnectionType,
    depth = 1,
  ): string[] {
    return this.workflow.getParentNodes(name, type, depth);
  }

  outgoing(name: string): OutgoingRef[] {
    const out: OutgoingRef[] = [];
    for (const [type, outputs] of Object.entries(this.connections[name] ?? {})) {
      outputs.forEach((list, output) =>
        (list ?? []).forEach((c) => out.push({ output, type, to: c.node, input: c.index })),
      );
    }
    return out;
  }

  incoming(name: string): IncomingRef[] {
    const out: IncomingRef[] = [];
    for (const [from, types] of Object.entries(this.connections)) {
      for (const [type, outputs] of Object.entries(types)) {
        outputs.forEach((list, output) =>
          (list ?? []).forEach((c) => {
            if (c.node === name) out.push({ from, output, type, input: c.index });
          }),
        );
      }
    }
    return out;
  }

  describe(node: INode): INodeTypeDescription | undefined {
    return this.pack.describe(node.type, node.typeVersion);
  }

  isSubNode(node: INode): boolean {
    const d = this.describe(node);
    return d ? isSubNodeType(d) : false;
  }

  /** A node is a trigger when its description says so, or its type says Trigger. */
  isTrigger(node: INode): boolean {
    const d = this.describe(node);
    if (d === undefined) return false;
    return d.group?.includes('trigger') === true || node.type.endsWith('Trigger');
  }

  triggers(): INode[] {
    return this.nodes.filter((n) => this.isTrigger(n));
  }

  /**
   * Strongly connected components of the main-connection graph (Tarjan),
   * restricted to real cycles: components of more than one node, or a single
   * node with a self-loop.
   */
  cycles(): string[][] {
    const succ = new Map<string, string[]>();
    for (const n of this.nodes) succ.set(n.name, []);
    for (const [from, types] of Object.entries(this.connections)) {
      const list = succ.get(from);
      if (!list) continue;
      for (const c of (types['main'] ?? []).flatMap((l) => l ?? [])) {
        if (succ.has(c.node)) list.push(c.node);
      }
    }

    let counter = 0;
    const index = new Map<string, number>();
    const low = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const found: string[][] = [];

    const strongConnect = (v: string): void => {
      index.set(v, counter);
      low.set(v, counter);
      counter += 1;
      stack.push(v);
      onStack.add(v);

      for (const w of succ.get(v) ?? []) {
        if (!index.has(w)) {
          strongConnect(w);
          low.set(v, Math.min(low.get(v)!, low.get(w)!));
        } else if (onStack.has(w)) {
          low.set(v, Math.min(low.get(v)!, index.get(w)!));
        }
      }

      if (low.get(v) === index.get(v)) {
        const component: string[] = [];
        for (;;) {
          const w = stack.pop()!;
          onStack.delete(w);
          component.push(w);
          if (w === v) break;
        }
        const selfLoop = component.length === 1 && (succ.get(v) ?? []).includes(v);
        if (component.length > 1 || selfLoop) found.push(component);
      }
    };

    for (const n of this.nodes) if (!index.has(n.name)) strongConnect(n.name);
    return found;
  }

  bounds(sticky: INode): { x: number; y: number; width: number; height: number } {
    const p = sticky.parameters as { width?: number; height?: number };
    return {
      x: sticky.position[0],
      y: sticky.position[1],
      width: typeof p.width === 'number' ? p.width : DEFAULT_STICKY_WIDTH,
      height: typeof p.height === 'number' ? p.height : DEFAULT_STICKY_HEIGHT,
    };
  }

  nodesInside(sticky: INode): INode[] {
    const b = this.bounds(sticky);
    return this.nodes.filter(
      (n) =>
        n.position[0] >= b.x &&
        n.position[0] <= b.x + b.width &&
        n.position[1] >= b.y &&
        n.position[1] <= b.y + b.height,
    );
  }
}
