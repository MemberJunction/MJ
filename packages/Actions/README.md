# Action Packages

MemberJunction's action framework -- a metadata-driven abstraction layer for exposing functionality to workflow systems, agents, and low-code environments.

## Packages

### Core

| Package | npm | Description |
|---------|-----|-------------|
| [Engine](./Engine/README.md) | `@memberjunction/actions` | Main library for MemberJunction Actions. This library is only intended to be imported on the server side. |
| [Base](./Base/README.md) | `@memberjunction/actions-base` | Base classes and interfaces for the Actions framework. Used on both server and network nodes. |
| [CoreActions](./CoreActions/README.md) | `@memberjunction/core-actions` | Library of generated and custom actions for the core MemberJunction framework, maintained by MemberJunction. |
| [CodeExecution](./CodeExecution/README.md) | `@memberjunction/code-execution` | Sandboxed code execution service for MemberJunction actions and agents. |

### Integrations

| Package | npm | Description |
|---------|-----|-------------|
| [ApolloEnrichment](./ApolloEnrichment/README.md) | `@memberjunction/actions-apollo` | Action classes that wrap the Apollo.io data enrichment API for contacts and accounts. |
| [ContentAutotag](./ContentAutotag/README.md) | `@memberjunction/actions-content-autotag` | Action classes that execute the content autotagging and vectorization actions. |

### Scheduling

| Package | npm | Description |
|---------|-----|-------------|
| [ScheduledActions](./ScheduledActions/README.md) | `@memberjunction/scheduled-actions` | Allows system administrators to schedule any MemberJunction action for recurring or one-time future execution. |
| [ScheduledActionsServer](./ScheduledActionsServer/README.md) | `@memberjunction/scheduled-actions-server` | Simple application server that can be called via URL to invoke Scheduled Actions. |

### Sub-Directories

| Directory | Packages | Description |
|-----------|----------|-------------|
| [BizApps](./BizApps/README.md) | 5 | Business application-specific actions (Accounting, CRM, FormBuilders, LMS, Social). |
