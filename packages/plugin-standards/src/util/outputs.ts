import type { INodeTypeDescription } from 'n8n-workflow';

/**
 * How many main outputs a node type has. `outputs` is usually an array, but
 * some nodes (the Webhook, for one) compute it from parameters and store an
 * expression string; one main output is the right assumption there.
 */
export function mainOutputCount(description: INodeTypeDescription | undefined): number {
  const outputs = description?.outputs;
  if (!Array.isArray(outputs)) return 1;
  const main = outputs.filter((o) =>
    typeof o === 'string' ? o === 'main' : (o as { type?: string })?.type === 'main',
  ).length;
  return main > 0 ? main : 1;
}

/**
 * With `onError: 'continueErrorOutput'` n8n appends an error output after the
 * node's main outputs, so its index is the main output count.
 */
export const errorOutputIndex = (description: INodeTypeDescription | undefined): number =>
  mainOutputCount(description);
