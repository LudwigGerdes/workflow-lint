# reliability/error-workflow-configured

A production workflow needs an error workflow, or a failed run notifies nobody.

|  |  |
|---|---|
| Department | `reliability` |
| Class | `quality` |
| Recommended | off |
| Fixable | no |

## Messages

| Message ID | Template |
|---|---|
| `missing` | No error workflow is configured, so a failed run fails silently; set settings.errorWorkflow. |
