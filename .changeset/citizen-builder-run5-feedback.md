---
"@memberjunction/open-app-engine": patch
"@memberjunction/installer": patch
"@memberjunction/cli": patch
"@memberjunction/ai-cli": patch
"@memberjunction/ai-engine-base": patch
"@memberjunction/ai-agents": patch
"@memberjunction/metadata-sync": patch
"@memberjunction/templates": patch
---

Harden Citizen Agent Builder runtime, OpenApp installation against edge/prerelease builds, and AI CLI audit and execution tooling:

- **OpenApp Engine & Installer**: Evaluate prerelease MJ versions (such as `6.3.0-edge.3`) cleanly against `mjVersionRange` and dependency ranges; resolve the newest MJ-compatible published tag instead of defaulting remote installs to git `HEAD` (while supporting explicit `--version HEAD`); configure `shamefully-hoist=true` in standalone pnpm workspaces so MJExplorer Vite resolves transitive OpenApp imports; and probe active API/Explorer HTTP endpoints during `mj doctor` instead of emitting false port-conflict warnings.
- **Citizen Builder Workspace & `mj agent init`**: Target distributed MJ releases without running full `mj codegen`; add anti-restart-loop failure hold with root-cause preservation to prevent exhausting GitHub anonymous API rate limits; auto-provision a read-only SQL login (`DB_READ_ONLY_USERNAME`/`DB_READ_ONLY_PASSWORD`) for Explorer Chat ad-hoc queries; supervise MJAPI and MJExplorer under `pm2-runtime` with Docker `/healthcheck` and `Cache-Control: no-cache` headers; bind-mount `CAPABILITIES.md` and emit schema/view/field metadata in `generate-capabilities.sh`; include root and child `.mj-sync.json` files in promotion packaging docs; and guard Docker auto-start and system memory checks in `mj agent init`.
- **AI CLI, Personas, MetadataSync & Templates**: Flush piped stdout and close the MJ provider cleanly before CLI exit to prevent large JSON output truncation; suppress progress output on stdout in `--format json` mode; include full cost rollups, token counts, actions, step statuses, and `PromptRun` traces in `mj ai audit` and `ExecutionLogger`; prevent unassigned text agents from inheriting voice-only model fallback personas (`Shimmer`); treat warnings-only `mj sync push` validation as non-failing in the progress spinner; and downgrade non-fatal template parameter warnings from `LogError` to `LogStatus`.
