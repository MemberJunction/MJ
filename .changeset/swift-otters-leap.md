---
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/ng-explorer-app": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/server": patch
---

Replace 30s polling heartbeat with socket-primary server connectivity, using /healthcheck only as a fallback when the GraphQL socket is disconnected. Fix CORS on the /healthcheck route and derive the health URL via `new URL('/healthcheck', base)` so it resolves correctly regardless of the GRAPHQL_URI suffix.
