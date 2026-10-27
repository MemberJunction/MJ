---
"@memberjunction/core": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/server": patch
"@memberjunction/ng-dashboard-viewer": patch
"@memberjunction/ng-query-viewer": patch
"@memberjunction/ng-entity-viewer": patch
---

Context tokens, the caller's time zone, and provider threading for dashboard parts.

- `@memberjunction/core` adds the context-token module: the closed `ContextToken` list, `PropertyDefault`, `UserViewProperty`, `ResolvePropertyDefault` / `ResolveContextToken` (user tokens; date tokens worked out in an IANA zone with Monday or Sunday week starts and day to year offsets), `ValidatePropertyDefault`, `IsValidTimeZone` and `GetLocalTimeZone`. `RunViewParams` and `RunQueryParams` gain a server-only `TimeZone`. Nothing reads them yet.
- `GraphQLDataProvider` sends the runtime's IANA zone as `x-mj-timezone` on every HTTP request; MJServer validates it into `UserPayload.TimeZone`, and the view and query resolvers pass it on as `TimeZone`. An absent or invalid header leaves it unset (UTC).
- The dashboard viewer hands its `Provider` to the parts it creates, the View, Query and Artifact parts pass it to their viewers, and the query viewer, its grid and info panel, and the entity viewer's recycle bin read through it. With no `Provider` set, behaviour is unchanged.
- `SERVER_ONLY_RUN_VIEW_PARAMS` / `StripServerOnlyRunViewParams` name the run fields only server code sets. The REST view routes strip them from the request body, and the route's entity name now wins over an `EntityName` in the body (before, the body could replace it and skip the entity allowlist check).
- **Deployments:** browser requests now carry an `x-mj-timezone` header. MJAPI's CORS setup reflects requested headers, so it needs nothing, but a proxy or gateway that pins `Access-Control-Allow-Headers` must add `x-mj-timezone`, or browser preflights will fail.
