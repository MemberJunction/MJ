---
"@memberjunction/ng-explorer-core": patch
"@memberjunction/graphql-dataprovider": patch
---

The connectivity banner now says why it is showing. When the WebSocket drops, Explorer probes `/healthcheck` once, right away: if it answers, the banner says "Reconnecting to the server…"; if the request is accepted but not answered in time, "The server is busy… no need to refresh"; if it is refused or answers with an error, the existing "Server unavailable" text. Before, every drop said "Server unavailable", which sent users to refresh a server that was only busy or re-establishing the socket (MJ #5510). `ServerConnectivityService.ConnectionState$` exposes the state; `IsConnected$` is unchanged.
