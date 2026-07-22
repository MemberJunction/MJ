---
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/testing-integration": patch
---

Headless clients can now run AI agents over the GraphQL wire.

- **`graphql-dataprovider`** — `GraphQLAIClient.RunAIAgent` forced `fireAndForget = true` for every caller, and `FireAndForgetHelper.subscribeToPubSub` called `dataProvider.PushStatusUpdates` — a browser/Angular-only channel. Any provider lacking it (a headless integration client, Node/MCP consumer) crashed with `PushStatusUpdates is not a function`. The helper now feature-detects the channel at its single choke point: when `PushStatusUpdates` is absent it delegates to the resolver's already-existing **synchronous** mode (re-send with `fireAndForget: false`, await the inline sanitized result via a new optional `extractSyncResult` seam). The browser/full-provider path is byte-for-byte unchanged — WebSocket completion + idle-stall reconcile, needed for Azure's ~230s proxy timeout — so only providers without the channel take the synchronous branch. `graphQLAIClient` wires both `RunAIAgent` and `RunAIAgentFromConversationDetail` to the seam. Known follow-up: `conversationId` is still not a wire mutation arg (the resolver passes `undefined`); `conversationDetailId` works.
- **`testing-integration`** — `ai-verify.fetchById` now bounded-polls (fire-and-forget Action-Execution-Log / child-prompt-run writes can land after a run handle returns, especially under the fast server-in-process transport), `verifyAgentRun` gains a `skipActionLogs` option, and `WireRunOptions` threads `conversationId`.
