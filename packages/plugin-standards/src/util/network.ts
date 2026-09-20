import type { INode, INodeTypeDescription } from 'n8n-workflow';
import { HTTP } from '../node-types.js';

/**
 * The slice of `ctx.n8n` these predicates need. Declaring it structurally
 * keeps the utilities testable against a bare node-type pack.
 */
export interface NodeClassifier {
  nodeType(node: INode): INodeTypeDescription | undefined;
  isTrigger(node: INode): boolean;
  isSubNode(node: INode): boolean;
}

/** Types that reach the network even when they declare no credentials. */
const NETWORK_TYPE = /graphql|webhook(?!Trigger)|ftp|ssh|imap|smtp|postgres|mysql|mongo|redis|s3/i;

const NOTIFICATION_TYPE =
  /slack|gmail|emailSend|telegram|discord|microsoftTeams|twilio|sendGrid|pagerDuty|opsgenie|datadog|sentry|stopAndError|respondToWebhook/i;

const NOTIFICATION_NAME = /log|alert|notify/i;

/** Databases and stores whose calls are slow enough to matter. */
const DATABASE_TYPE = /postgres|mysql|mongo|redis|snowflake|bigQuery|elasticsearch|supabase|s3/i;

/** LangChain nodes that call a model, and so cost real time. */
const AI_TYPE = /^@n8n\/n8n-nodes-langchain\.(agent|chain|openAi|lmChat)/i;

/**
 * A node that makes an outbound call, and so should carry retry settings.
 * Triggers and sub-nodes are excluded: they are not steps in the main flow.
 */
export function isNetworkNode(node: INode, n8n: NodeClassifier): boolean {
  if (n8n.isTrigger(node) || n8n.isSubNode(node)) return false;
  if (node.type === HTTP) return true;
  if ((n8n.nodeType(node)?.credentials?.length ?? 0) > 0) return true;
  return NETWORK_TYPE.test(node.type);
}

/**
 * A node whose point is to tell someone, or to stop the run. These are what a
 * failure path must reach, and the only thing allowed downstream of a
 * suppressed error.
 */
export function isNotificationNode(node: INode): boolean {
  if (NOTIFICATION_TYPE.test(node.type)) return true;
  return node.type === HTTP && NOTIFICATION_NAME.test(node.name);
}

/** Work heavy enough that it must not sit before a webhook's response. */
export function isHeavyNode(node: INode, n8n: NodeClassifier): boolean {
  if (n8n.isTrigger(node)) return false;
  if (node.type === HTTP) return true;
  if (AI_TYPE.test(node.type)) return true;
  return DATABASE_TYPE.test(node.type);
}
