---
"@memberjunction/auth-providers": minor
"@memberjunction/server": minor
"@memberjunction/ng-auth-services": minor
"@memberjunction/installer": minor
"@memberjunction/open-app-engine": minor
"@memberjunction/ai-agents": minor
"@memberjunction/ai-cli": minor
"@memberjunction/core-actions": minor
"@memberjunction/cli": minor
"@memberjunction/generic-database-provider": minor
---

Round 2 Citizen Agent Builder feedback fixes and local development JWT auth provider (`local`):

- **Local Development Mock/Test JWT Auth (`local`)**: Added `LocalDevProvider` in `@memberjunction/auth-providers`, `/auth/dev-login` and `/auth/dev-users` endpoints in `@memberjunction/server` backed by `MagicLinkKeyManager` RS256 signing, `MJLocalDevProvider` in `@memberjunction/ng-auth-services`, and `AuthProvider: "local"` support in `@memberjunction/installer`. Enforced strict security guards: server startup refuses to boot if `MJ_DEV_AUTH_ENABLED=true` when `NODE_ENV=production`, and `/auth/dev-login` / `/auth/dev-users` reject any non-localhost request (`X-Forwarded-For`, `Forwarded`, `X-Real-IP`, `CF-Connecting-IP`, `Sec-Fetch-Site: cross-site`, `Host`, `Origin`, `Referer`, and socket remote address).
- **Single-Tarball OpenApp Archive Download**: Updated `GitHubClient` in `@memberjunction/open-app-engine` to download and extract `.sql` migrations from a single repository `.tar.gz` archive stream (`downloadTarballArchive`) instead of per-directory and per-file Contents/Blob API calls, avoiding anonymous GitHub API rate limits and large-file truncation.
- **Flow Agent & CLI Execution Fixes**: Enabled in-process `inRun` execution for Flow agents when no `AgentStepNode` task handler is registered, populated `userMessage` and `payload` in Flow prompt step context, supported multiple starting steps and join deferral, added `--prompt-file` (`-f`) to `mj ai agents run`, and wired `ClientClauseScreen` entity-view authorization for ad-hoc queries in `@memberjunction/ai-cli`.
- **Query Action Output & Truncation**: Updated `RunStoredQueryAction` and `RunAdhocQueryAction` in `@memberjunction/core-actions` to populate structured `Results`, `RowCount`, and `TotalRowCount` output parameters, raised default `ColumnMaxLength` to `500`, and appended `...[truncated]` when values are truncated.
- **Citizen Builder Template & Turbo Pass-Through**: Updated `citizen-builder` starter template to default to `Loop` agents, bind Docker host ports to `127.0.0.1`, pass `AI_VENDOR_API_KEY__*` and `MJ_*` through `turbo.json`, auto-select free host ports and unique `COMPOSE_PROJECT_NAME` in `mj agent init`, and added `AI_TURBO_ENV_PASSTHROUGH` doctor check in `@memberjunction/installer`.
