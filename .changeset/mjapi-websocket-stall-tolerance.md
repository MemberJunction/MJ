---
"@memberjunction/server": patch
"@memberjunction/ng-explorer-core": patch
---

A short MJAPI stall no longer drops every WebSocket or tells users the server is down. The server's WebSocket heartbeat is now MJ's own instead of graphql-ws's keepalive: it decides "no pong" after the event loop has read pending frames, so a socket whose pong arrived during a stall is kept instead of terminated. In Explorer, a dropped socket triggers an immediate `/healthcheck` probe and the banner says why: "Reconnecting to the server…" when the server answers, "The server is busy…" when it accepts the request but does not answer in time, and the existing "Server unavailable" text only when the connection is refused or returns an error. `ServerConnectivityService.ConnectionState$` exposes the state; `IsConnected$` is unchanged.
