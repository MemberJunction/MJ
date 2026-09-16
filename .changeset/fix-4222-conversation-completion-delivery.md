---
'@memberjunction/graphql-dataprovider': minor
'@memberjunction/conversations-runtime': minor
'@memberjunction/ng-conversations': minor
'@memberjunction/server': minor
'@memberjunction/redis-provider': minor
---

fix: an agent completion reaches the conversation even when the WebSocket dies without closing (MJ#4222)

On an unstable connection, sending a message to an agent left the message spinning forever: status updates stopped, the elapsed timer counted up with no ceiling, and no error appeared. The agent ran fine and its answer persisted; only a refresh revealed it.

The cause was not a missing timeout but a single point of failure. Five recovery mechanisms — graphql-ws `retryAttempts`, `GraphQLDataProvider._socketStateSubject`, Explorer's `ServerConnectivityService`, `ConversationStreaming.scheduleReconnection()` and `FireAndForgetHelper.onStreamEnd` — were all triggered by the socket `closed` event, and the failure mode is precisely "the socket never closes". They failed together. graphql-ws re-arms its keepalive only on pong receipt, so a half-open socket gets one ping and then permanent silence; its own JSDoc says nothing happens automatically if the server never responds.

**Transport.** `getOrCreateWSClient()` now arms a pong watchdog on each ping it sends and calls `client.terminate()` if no pong returns, producing a real `4499` close that the existing retry apparatus can act on. Handlers bind to a local client so a watchdog armed on one socket can never terminate its replacement. `connectionAckWaitTimeout` is set, and `keepAlive` drops to 10s, making detection ~14s in practice instead of never. MJServer passes its `useServer` keepAlive explicitly rather than relying on an invisible library default.

**Recovery triggers.** New `ConversationLiveness` (L0, no Angular) aggregates socket reconnect, stream re-subscribe, tab-visible and browser-online into one coalesced reconciliation request, throttled leading-edge at 500ms. `ng-conversations` adds a root-provided DOM bridge and `ReconcileNow()`, which refreshes agent runs **before** comparing status — without that the comparison reads the stale in-memory map the outage froze and silently no-ops. The reconciliation path runs over HTTP, so it repairs a message while the socket is still dead.

**Durable read model.** New `TailConversationEvents` query over existing `AIAgentRunStep` rows — no table, no migration. The cursor never rewinds, events are capped at 200, authorization is delegated to `RunView` as the calling user, and not-found and not-authorized are indistinguishable. `FinalPayload` falls back to the conversation detail's message because `AIAgentRun.Result` is agent-dependent and null on many successful runs; callers must decide terminality from `IsInFlight`/`DetailStatus`, never from its presence. `GraphQLConversationClient` and `ConversationTail` hold a per-message cursor that advances only on a successful read.

**Cross-instance delivery.** Push-status updates now carry `SourceServerId` and fan out over Redis through a generic `PublishMessage`/`SubscribeToChannel` pair on `RedisLocalStorageProvider`, closing the case where the mutation lands on one replica and the browser's socket on another. Inbound messages republish onto the local topic and still pass the identity filter, so a replica never decides who sees what. Streaming deltas are deliberately not replicated. Measured: 5 push frames delivered cross-replica with Redis, 0 without — and the message still completed without it, so fan-out is a latency optimization rather than a requirement.

**Honest UI.** The message time pill degrades `live → checking → stalled`, with thresholds anchored to the agent watchdog's own 30s heartbeat and 5-minute stale threshold rather than invented values. The database timestamp is bounded by how long the component has been watching, so browser-versus-database clock skew cannot invent a stall.

Also fixes three defects found by manual testing that unit tests missed, each an instance of the same pattern as the original bug — a mechanism wired to a signal the failure mode suppresses: liveness was computed only in `ngDoCheck`, which `detectChanges()` does not re-invoke; `agentRunMap` was absent from `message-list`'s `ngOnChanges`, so a refreshed heartbeat never reached the rendered bubble; and the reconnection backoff reset on every re-subscribe, which succeeds against a dead socket, leaving both its escalation and its attempt cap inert.
