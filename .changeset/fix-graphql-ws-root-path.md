---
"@memberjunction/server": patch
---

fix(server): accept GraphQL WS subscriptions on the default `GRAPHQL_ROOT_PATH`. The HTTP GraphQL endpoint is mounted with Express prefix matching (`app.use('/', …)` also serves `/graphql`), but the WebSocket upgrade handler required an exact pathname match — so a client whose WS URL ends in `/graphql` while the server ran on the default root path (`/`) had working HTTP but silently 400-rejected subscriptions. A shared `IsGraphQLWsPath` helper now treats `/graphql` as an alias of `/` (only when the root path is the default `/`), so custom non-default root paths (`/api`, etc.) still require an exact match and are unaffected.
