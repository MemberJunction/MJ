Remove ALL CodeGen-generated files from the repository. This includes every `generated/` directory and any CodeGen/RSU migration files.

Delete the following directories (use `rm -rf`):

- `SQL Scripts/generated`
- `packages/GeneratedActions/src/generated`
- `packages/MJExplorer/src/app/generated`
- `packages/MJCodeGenAPI/src/generated`
- `packages/MJCoreEntities/src/generated`
- `packages/ServerBootstrap/src/generated`
- `packages/Angular/Bootstrap/src/generated`
- `packages/Angular/Explorer/explorer-core/src/generated`
- `packages/Angular/Explorer/core-entity-forms/src/lib/generated`
- `packages/Angular/BootstrapLite/src/generated`
- `packages/MJServer/src/generated`
- `packages/MJAPI/src/generated`
- `packages/AI/A2AServer/src/generated`
- `packages/AI/MCPServer/src/generated`
- `packages/ServerBootstrapLite/src/generated`
- `packages/Actions/CoreActions/src/generated`
- `packages/GeneratedEntities/src/generated`

Also delete:
- `migrations/v5/CodeGen_Run_*.sql` (CodeGen migration files)
- `migrations/rsu/*.sql` (RSU migration files)

After deletion, confirm the count of directories/files removed. Do NOT ask for confirmation -- just do it.
