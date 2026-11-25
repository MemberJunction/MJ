---
"@memberjunction/core-actions": patch
---

The Agent Channel actions (open, post, read) now fail with `Entity <name> not found in metadata or could not be created` when they cannot create an `MJ: Agent Channels`, `MJ: Agent Channel Participants` or `MJ: Conversation Details` object, for example on a database whose migration for it has not run. Before, `GetEntityObject` logged that and returned null, and the action failed with "Cannot read properties of null (reading 'NewRecord')", which hid the cause.
