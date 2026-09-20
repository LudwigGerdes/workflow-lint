# n8n/valid

Semantic checks n8n itself would make: unknown types, parameter issues, wiring and agent configuration.

|  |  |
|---|---|
| Department | `n8n` |
| Class | `quality` |
| Recommended | `error` |
| Fixable | no |

## Messages

| Message ID | Template |
|---|---|
| `unknownNodeType` | Node "{{name}}" has unknown type "{{type}}"; it will not run on this n8n version. |
| `parameterIssue` | Node "{{name}}": {{issue}} |
| `noTrigger` | This workflow has no trigger node, so nothing can start it. |
| `mergeInputCount` | Merge node "{{name}}" is configured for {{expected}} inputs but only {{wired}} are wired. |
| `subNodeNotConnected` | Sub-node "{{name}}" is not connected to anything, so it will never be used. |
| `toolNoParameters` | Tool "{{name}}" has no parameters configured. |
| `fromAiOutsideTool` | Node "{{name}}" uses $fromAI(), which only works inside a tool node. |
| `agentStaticPrompt` | Agent "{{name}}" has a static prompt; use an expression so it receives the incoming data. |
| `agentNoSystemMessage` | Agent "{{name}}" has no system message, leaving its role undefined. |
| `hardcodedCredentialInHttp` | Node "{{name}}" sends header "{{header}}" as a literal; use a credential instead. |
| `webhookResponseMismatch` | Webhook "{{name}}" uses responseMode "{{mode}}", which does not match the Respond to Webhook wiring. |
