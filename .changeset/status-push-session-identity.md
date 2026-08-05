---
"@memberjunction/server": patch
---

Bind `statusUpdates` push-subscription delivery to the authenticated connection identity (fixes a session-hijack, B49).

The `statusUpdates` GraphQL subscription filtered only on the client-supplied `sessionId` (`payload.sessionId === args.sessionId`) and never checked it against the subscriber's authenticated identity. Because `sessionId` is a client-generated (per-tab) UUID persisted in browser storage, a subscriber who obtained another user's `sessionId` would receive their pushes (agent-run progress, MCP/test/remote-browser progress, notifications).

**Fix:** every push now carries the authenticated owner's user ID, and the subscription filter additionally requires it to match the subscriber CONNECTION's server-authenticated identity (`context.userPayload.userRecord.ID`, established once at WS connect and refreshed on token expiry). `sessionId` still routes a push to the right browser tab, but is no longer the trust anchor — knowing it is no longer sufficient. The filter fails closed (missing owner or connection identity → no delivery).

**Centralized so it can't regress:** all ~22 publish sites now route through a single `publishStatusUpdate(pubSub, { sessionId, ownerUserId, message })` helper (resolvers via the new `ResolverBase.PublishStatusUpdate` wrapper; non-resolver services/heartbeat call the helper directly). `ownerUserId` is a **required** field, so the compiler rejects any publish that omits identity — a future publisher physically cannot forget it. Also normalized three previously-malformed publishes that sent no `sessionId`. The security-critical filter is unit-tested in isolation.

`ownerUserId` is used only server-side by the filter and is deliberately not exposed on the client-facing `PushStatusNotification` (no user IDs leak to subscribers).
