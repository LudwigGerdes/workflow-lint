/** Node type identifiers used across the standards rules. */
export const SET = 'n8n-nodes-base.set';
export const IF = 'n8n-nodes-base.if';
export const SWITCH = 'n8n-nodes-base.switch';
export const FILTER = 'n8n-nodes-base.filter';
export const MERGE = 'n8n-nodes-base.merge';
export const NOOP = 'n8n-nodes-base.noOp';
export const SIB = 'n8n-nodes-base.splitInBatches';
export const HTTP = 'n8n-nodes-base.httpRequest';
export const CODE = 'n8n-nodes-base.code';
export const STICKY = 'n8n-nodes-base.stickyNote';
export const WEBHOOK = 'n8n-nodes-base.webhook';
export const RESPOND_TO_WEBHOOK = 'n8n-nodes-base.respondToWebhook';
export const STOP_AND_ERROR = 'n8n-nodes-base.stopAndError';
export const EXECUTE_WORKFLOW_TRIGGER = 'n8n-nodes-base.executeWorkflowTrigger';
export const AGENT = '@n8n/n8n-nodes-langchain.agent';
export const SPLIT_OUT = 'n8n-nodes-base.splitOut';
export const AGGREGATE = 'n8n-nodes-base.aggregate';
export const ITEM_LISTS = 'n8n-nodes-base.itemLists';
export const SUMMARIZE = 'n8n-nodes-base.summarize';

/** Decision nodes whose outputs fan the flow out. */
export const BRANCHING = [IF, SWITCH] as const;
