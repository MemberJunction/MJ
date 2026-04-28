# Streaming Mechanism Decision (P2C.0)

**Status:** Decided — GraphQL Subscriptions over WebSocket
**Date:** 2026-04-28
**Owner:** Phase 2C implementation pair

## Question

Phase 2C streams search results to the agent and the UI as each provider returns, instead of blocking until full fusion + rerank completes. Three transports were on the table:

1. **GraphQL Subscriptions** over WebSocket (Apollo's native streaming)
2. **Server-Sent Events** (SSE) over plain HTTP
3. **Custom WebSocket** with a hand-rolled protocol

## Recommendation: GraphQL Subscriptions

### Reasons

- **Apollo Server already wires the subscription transport.** The MJAPI graphql server uses `type-graphql` + Apollo Server, both of which speak `@Subscription` natively over `graphql-ws`. There is no new transport to deploy or configure.
- **Existing precedent in the codebase.** Look for `@Subscription` decorators in `packages/MJServer/src/resolvers/` — there are already production subscriptions in the GraphQLDataProvider client that handle reconnect, auth handshake, and message ordering.
- **Auth, multiplexing, and back-pressure are already solved.** Subscription auth piggybacks on the unified auth middleware (`packages/MJServer/src/context.ts`); the connection's userPayload survives the lifetime of the stream. SSE would require us to re-implement auth on every streamed event because EventSource cannot send custom headers in the browser.
- **Single transport for the whole API.** Mixing HTTP (queries/mutations) + WebSocket (subscriptions) is already the deployed surface. Adding SSE would mean a third transport with its own load balancer + proxy + reverse-proxy considerations.
- **Apollo client deduplicates and re-subscribes** on reconnect — clients don't need to re-implement that.

### Risks Considered

- **WebSocket proxy compatibility** — already solved in production (the chat-overlay subscription uses the same transport).
- **Connection limits** — same as today; one connection per browser tab. Fan-out per scope is in-process, not per-connection.
- **HTTP/2 SSE simplicity** — appealing but doesn't outweigh the cost of building a second transport and re-doing auth.

## Rejected: SSE

EventSource lacks header-based auth, doesn't multiplex, and would require a parallel `/sse` endpoint with its own auth middleware. The "simpler than WebSocket" appeal evaporates once auth, reconnect, and multiplexing land.

## Rejected: Custom WebSocket

Reinvents Apollo's plumbing. Maintenance burden for zero feature win.

## Implementation Notes

- Subscription resolver: `streamScopedSearch` in `packages/MJServer/src/resolvers/SearchKnowledgeStreamResolver.ts`
- Engine source: `SearchEngine.streamSearch()` (P2C.1) — `AsyncIterable<SearchStreamEvent>`
- Event shape: discriminated union — `{ phase: 'provider'|'fused'|'reranked'|'final'|'error', ... }`
- Cancellation: `AbortSignal` from the subscription's onComplete handler
- Client: `GraphQLSearchClient.streamScopedSearch()` returns an Observable wrapper around the Apollo subscription
