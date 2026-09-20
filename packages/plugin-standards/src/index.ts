import type { Rule } from 'workflow-lint-core';
import { rule as noDefaultNodeName } from './rules/naming/no-default-node-name.js';
import { rule as externalNodeNameFormat } from './rules/naming/external-node-name-format.js';
import { rule as decisionNodeQuestionMark } from './rules/naming/decision-node-question-mark.js';
import { rule as noTypePrefixInName } from './rules/naming/no-type-prefix-in-name.js';
import { rule as agentToolSnakeCase } from './rules/naming/agent-tool-snake-case.js';
import { rule as branchEntryPassThrough } from './rules/structure/branch-entry-pass-through.js';
import { rule as ifInLoopReconverges } from './rules/structure/if-in-loop-reconverges.js';
import { rule as mergeForReconvergence } from './rules/structure/merge-for-reconvergence.js';
import { rule as setPassThroughIncludeOtherFields } from './rules/structure/set-pass-through-include-other-fields.js';
import { rule as cyclicRequiresExecutionOrderV1 } from './rules/structure/cyclic-requires-execution-order-v1.js';
import { rule as loopIterationGuard } from './rules/structure/loop-iteration-guard.js';
import { rule as noDanglingNode } from './rules/structure/no-dangling-node.js';
import { rule as noInlineSecrets } from './rules/hygiene/no-inline-secrets.js';
import { rule as noEnvironmentLiterals } from './rules/hygiene/no-environment-literals.js';
import { rule as noPlaceholderApiUrl } from './rules/hygiene/no-placeholder-api-url.js';
import { rule as errorWorkflowConfigured } from './rules/reliability/error-workflow-configured.js';
import { rule as continueOnFailOnlyTerminal } from './rules/reliability/continue-on-fail-only-terminal.js';
import { rule as errorOutputWired } from './rules/reliability/error-output-wired.js';
import { rule as errorPathHasAlert } from './rules/reliability/error-path-has-alert.js';
import { rule as httpRetryConfig } from './rules/reliability/http-retry-config.js';
import { rule as retryRespectsRetryAfter } from './rules/reliability/retry-respects-retry-after.js';
import { rule as webhookRespondsEarly } from './rules/reliability/webhook-responds-early.js';
import { rule as webhookInputContract } from './rules/reliability/webhook-input-contract.js';
import { rule as loopWithSingleHttpCall } from './rules/data/loop-with-single-http-call.js';
import { rule as batchResponseNotSplit } from './rules/data/batch-response-not-split.js';
import { rule as codeNodeMultiField } from './rules/data/code-node-multi-field.js';
import { rule as setRawModeForNested } from './rules/data/set-raw-mode-for-nested.js';
import { rule as layoutFormatted } from './rules/layout/formatted.js';

export const rules: Rule[] = [
  noDefaultNodeName,
  externalNodeNameFormat,
  decisionNodeQuestionMark,
  noTypePrefixInName,
  agentToolSnakeCase,
  branchEntryPassThrough,
  ifInLoopReconverges,
  mergeForReconvergence,
  setPassThroughIncludeOtherFields,
  cyclicRequiresExecutionOrderV1,
  loopIterationGuard,
  noDanglingNode,
  noInlineSecrets,
  noEnvironmentLiterals,
  noPlaceholderApiUrl,
  errorWorkflowConfigured,
  continueOnFailOnlyTerminal,
  errorOutputWired,
  errorPathHasAlert,
  httpRetryConfig,
  retryRespectsRetryAfter,
  webhookRespondsEarly,
  webhookInputContract,
  loopWithSingleHttpCall,
  batchResponseNotSplit,
  codeNodeMultiField,
  setRawModeForNested,
  layoutFormatted,
];
export const plugin = { name: 'standards', rules };
export {
  noDefaultNodeName,
  externalNodeNameFormat,
  decisionNodeQuestionMark,
  noTypePrefixInName,
  agentToolSnakeCase,
  branchEntryPassThrough,
  ifInLoopReconverges,
  mergeForReconvergence,
  setPassThroughIncludeOtherFields,
  cyclicRequiresExecutionOrderV1,
  loopIterationGuard,
  noDanglingNode,
  noInlineSecrets,
  noEnvironmentLiterals,
  noPlaceholderApiUrl,
  errorWorkflowConfigured,
  continueOnFailOnlyTerminal,
  errorOutputWired,
  errorPathHasAlert,
  httpRetryConfig,
  retryRespectsRetryAfter,
  webhookRespondsEarly,
  webhookInputContract,
  loopWithSingleHttpCall,
  batchResponseNotSplit,
  codeNodeMultiField,
  setRawModeForNested,
  layoutFormatted,
};
