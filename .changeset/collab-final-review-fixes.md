---
"@memberjunction/actions-base": patch
"@memberjunction/actions": patch
"@memberjunction/core-actions": patch
"@memberjunction/action-runtime-host": patch
"@memberjunction/record-set-processor": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/server": patch
---

Final review fixes for retrieval scoping. Inside a tenant-scoped agent run, Scoped Search refuses the Global scope and
a search with no scope; runtime actions hand the run's scope (and audience) to the actions and agents they call
(`BridgeContext.runScope`/`audience`), and Loop, Parallel Execute, Conditional and Retry refuse. The legacy `CreateFile`
upload needs Write on the storage account and gets the tracked-file rule before it signs an upload URL. The GraphQL
clients throw when `ExecuteAgentParams` carries the server-only `Audience` or `TrustReservedRunData`. Record Set
Processor agent runs are trusted for reserved run data, since it comes from the admin-configured input mapping.
