---
"@memberjunction/server": patch
"@memberjunction/core": patch
---

Execution entry points now refuse scope-limited sessions: anonymous magic-link guests and resource-scoped magic-link sessions. Those sessions are confined by row-level security on entity reads, which does not bound server-side execution.

- **New `@RefuseScopeLimitedPrincipals()` decorator** (`@memberjunction/server`). Put it on a resolver class to guard all of its root fields, or on a single `@Query`/`@Mutation`/`@Subscription`. `Serve()` attaches the guard just before it builds the schema. Marking a resolver at import time does not touch type-graphql, so tests that mock type-graphql are unaffected. The guard throws an `AuthorizationError`; the system user always passes.
- **Now refused for these sessions:**
  - entity actions (`RunEntityAction`; `RunAction` already refuses these sessions inline);
  - AI prompts, simple prompts and embeddings;
  - `RunAIAgent`, `RespondToAgentRequest`, `ReassignAgentRequest`;
  - templates;
  - stored queries and SQL tests;
  - data-context data;
  - MCP tools;
  - integrations, runtime schema updates, cluster analysis and entity communications;
  - autotagging, tag governance and seed taxonomy;
  - vectorization and vector fetches;
  - record dependency and merge;
  - API-key creation and revocation;
  - test runs, SQL logging and telemetry;
  - duplicate checks (`CheckDuplicateEntry`, `GetRecordDuplicates`);
  - knowledge search (`SearchKnowledge`, `SearchScopes`, `PreviewSearch`, `StreamScopedSearch`);
  - remote browser control;
  - meetings;
  - component registry search, dependency resolution and feedback. `GetRegistryComponent` stays open, because rendering a shared interactive artifact fetches external-registry component specs through it.
- **`RunAIAgentFromConversationDetail` serves only public web-widget guests.** The widget instance pins their agent, and it runs under a server principal. Any other scope-limited session is refused before anything loads. Previously, a widget guest whose widget could not be resolved fell back to running the client-supplied agent as the guest; that request is now refused instead.
- **Remote Operations need an explicit opt-in.** `ExecuteRemoteOperation` refuses scope-limited sessions unless the operation sets the new `BaseRemotableOperation.AllowScopeLimitedPrincipals` (`@memberjunction/core`). An operation that opts in must check the caller's scope in `Authorize`. See the Remote Operations Guide, "Serving magic-link guests".
- **No change for anyone else.** Ordinary signed-in users, API-key callers and magic-link sessions that carry a role but no resource scope behave exactly as before.
