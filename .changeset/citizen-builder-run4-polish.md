---
"@memberjunction/ai-cli": patch
"@memberjunction/cli": patch
"@memberjunction/generic-database-provider": patch
---

Polish Citizen Agent Builder Docker runtime, audit CLI, and inactive credential decryption:
- Fix `mj ai audit agent-run --list` (`FormatRunList`) to handle plain objects returned by `ResultType: 'simple'` when formatting as JSON, and safely normalize `Date | string` step timestamps in `AgentAuditService`.
- Pass `-w /workspace` in `citizen-builder/scripts/query-run-history.sh` and `citizen-builder/scripts/sync-metadata.sh` so container CLI commands always resolve `/workspace/mj.config.cjs`.
- Pass `API_PORT` and `EXPLORER_PORT` into the `mj` container, sync `GRAPHQL_URI` and `GRAPHQL_WS_URI` in MJExplorer's environment files when `API_PORT` is non-default, and display actual host ports in the container startup banner.
- Cap SQL Server container memory (`MSSQL_MEMORY_LIMIT_MB`, default `3072`), run `mjapi` and `mjexplorer` directly under PM2 in `apps/MJAPI` and `apps/MJExplorer` so OOM exits are not masked by `turbo`, and add `globalPassThroughEnv` to `distribution.turbo.json`.
- Suppress false-alarm `LogError` messages when decrypting fields on explicitly inactive rows (`IsActive === false` or `0`) in `GenericDatabaseProvider`.
