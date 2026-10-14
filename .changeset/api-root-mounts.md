---
"@memberjunction/server": patch
"@memberjunction/server-extensions-core": patch
"@memberjunction/core": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/ng-bootstrap": patch
"@memberjunction/ng-auth-services": patch
"@memberjunction/ng-workspace-initializer": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-file-storage": patch
"@memberjunction/ng-explorer-app": patch
---

Every MJAPI route now lives under the API root, `GRAPHQL_ROOT_PATH` (#5674). Behind a CDN that forwards only `/api/*`, core routes were unreachable and `/media` links landed on the SPA.

- **`ApiRoute(subpath, { absolute? })`** (new, `@memberjunction/server`): the mount path under the API root, or with `absolute` the public URL (`MJAPI_PUBLIC_URL` + subpath). Also exports `ApiRootPath()`, `PublicApiRootUrl()`, `JoinApiRoute()` and `NormalizeApiRootPath()`.
- **Core mounts** (`/healthcheck`, `/oauth`, `/esignature`, `/media`, `/realtime/sdp-exchange`, `/magic-link`, `/widget`, `/realtime/verify`, `/health/extensions`, `/auth`) are composed under the API root, as are the magic-link and realtime-verify form actions and `CreateUploadStageToken`'s `Url`.
- **Server extensions:** every `RootPath` is now relative to the API root. `PrepareServerExtensionConfigs({ apiRootPath })` composes the mount path (new `ComposeServerExtensionMountPath`), and `ServerExtensionInitContext.apiRootPath` carries the root. `graphqlRootPath` is no longer a reserved root, and `CoreReservedServerExtensionRoots()` no longer takes it.
- **Explorer follows the server.** New optional `API_ROOT_URI` environment value (`MJEnvironmentConfig`, `WorkspaceEnvironment`) and `ResolveAPIRootURL(graphqlUrl, apiRootUrl?)` in `@memberjunction/core`: the explicit value, else `GRAPHQL_URI` minus a trailing `/graphql`. The auth-provider catalog, the healthcheck poll, the OAuth code exchange and the upload-stage POST resolve against it (`GraphQLProviderConfigData.APIRootURL`). The catalog and healthcheck previously resolved against the origin root (`new URL('/auth/providers', …)`), which dropped the `/api` prefix.
- With `GRAPHQL_ROOT_PATH=/` (the default) every mount path and emitted URL is unchanged. REST stays at the origin-absolute `/api/v1`.

**Upgrade note for deployments with `GRAPHQL_ROOT_PATH` other than `/` (every MJ Central host serves the API under `/api`).** Routes that used to answer at the origin root now answer only under the API root, and nothing on the MJ side reports the old address being called. Before upgrading, list every URL an outside party holds and re-register it under the root (or keep a temporary edge redirect from the old path):

- Webhooks registered with providers: Open App server extensions such as Orders' `/webhooks/payments` and `/webhooks/billcom`, telephony's `/telephony/*` and `/meetings/teams`, Slack/Teams messaging extensions, and core's `/esignature/webhook/:driverKey` (DocuSign Connect, etc.). The carrier URLs MJ builds itself (`BuildCallbackUrl`) follow automatically; ones pasted into a provider console do not.
- OAuth redirect URIs registered with identity providers (`/oauth/callback`).
- Links already sent by email: magic-link invites (`/magic-link/redeem`) and realtime identity-verification links (`/realtime/verify/:token`). These were built from `MJAPI_PUBLIC_URL`, so they already carry the root when it is set correctly. Check the value before you rely on that.
- CDN behaviors added per route for the old root paths (e.g. `/auth/*`, `/oauth/*`, `/magic-link/*`) can be removed once nothing calls them.

Telephony media WebSocket URLs (`/telephony/*/media`) and `/realtime-proxy` do not move.
