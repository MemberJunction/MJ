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

MJAPI can now live under a path prefix without per-route CDN patches (#5674). A new setting, `MJAPI_BASE_PATH` (default `/`), is the prefix MJAPI mounts every route under. `GRAPHQL_ROOT_PATH` stays only where Apollo listens, and `MJAPI_PUBLIC_URL` stays where the world reaches MJAPI.

- **`ApiRoute(subpath, { absolute? })`** (new, `@memberjunction/server`): the mount path under `MJAPI_BASE_PATH`, or with `absolute` the public URL (`MJAPI_PUBLIC_URL` + subpath). Also exports `ApiRootPath()`, `ConfiguredPublicUrl()`, `JoinApiRoute()` and `NormalizeApiRootPath()`.
- **Core mounts** (`/healthcheck`, `/oauth`, `/esignature`, `/media`, `/realtime/sdp-exchange`, `/magic-link`, `/widget`, `/realtime/verify`, `/health/extensions`, `/auth`) are composed under the base path, as are the magic-link and realtime-verify form actions, `CreateMediaAccessToken`'s URL and `CreateUploadStageToken`'s `Url`.
- **Server extensions:** every `RootPath` is relative to the base path. `PrepareServerExtensionConfigs({ apiRootPath })` composes the mount path (new `ComposeServerExtensionMountPath`), and `ServerExtensionInitContext.apiRootPath` carries it. `graphqlRootPath` is no longer a reserved root, and `CoreReservedServerExtensionRoots()` no longer takes it.
- **Explorer is told where MJAPI is.** New optional `MJAPI_URI` environment value (`MJEnvironmentConfig`, `WorkspaceEnvironment`, `GraphQLProviderConfigData.MJAPIURL`) and `ResolveMJAPIURL(graphqlUrl, mjapiUrl?)` in `@memberjunction/core`. The auth-provider catalog, the healthcheck poll, the OAuth code exchange and the upload-stage POST use it. Unset, it falls back to `GRAPHQL_URI` minus a trailing `/graphql`, as those sites mostly did before. The catalog and healthcheck previously resolved against the origin root (`new URL('/auth/providers', …)`), which dropped any `/api` prefix.
- Default config changes nothing: with `MJAPI_BASE_PATH` unset every mount path and emitted URL is unchanged, whatever `GRAPHQL_ROOT_PATH` is. REST stays at the origin-absolute `/api/v1`.

**Opting in (`MJAPI_BASE_PATH=/api`, e.g. behind MJ Central's CloudFront, which forwards `/api/*` unstripped).** Every route moves under the prefix, and nothing on the MJ side reports a caller still using the old address. In the same change:

- Set `MJAPI_PUBLIC_URL` to the prefixed address (`https://host/api`) so links MJAPI hands out carry it, and set Explorer's `MJAPI_URI` to the same.
- Re-register every URL an outside party holds, or keep a temporary edge redirect from the old path: provider webhooks (Open App extensions such as Orders' `/webhooks/payments` and `/webhooks/billcom`, telephony `/telephony/*` and `/meetings/teams`, Slack/Teams messaging, core `/esignature/webhook/:driverKey`), OAuth redirect URIs (`/oauth/callback`), and links already emailed (magic-link invites, realtime-verify links). Carrier URLs MJ registers itself (`BuildCallbackUrl`) follow automatically.
- Remove CDN behaviors added per route for the old root paths once nothing calls them.

Telephony media WebSocket URLs (`/telephony/*/media`) and `/realtime-proxy` do not move.
