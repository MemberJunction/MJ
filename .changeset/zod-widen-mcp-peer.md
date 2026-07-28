---
"@memberjunction/actions-base": patch
"@memberjunction/core-actions": patch
"@memberjunction/a2aserver": patch
"@memberjunction/ai-mcp-client": patch
"@memberjunction/ai-mcp-server": patch
"@memberjunction/predictive-studio-core": patch
"@memberjunction/ng-file-storage": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/component-registry-server": patch
"@memberjunction/config": patch
"@memberjunction/db-auto-doc": patch
"@memberjunction/integration-connectors": patch
"@memberjunction/metadata-sync": patch
"@memberjunction/cli": patch
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/server": patch
"@memberjunction/storage": patch
"@memberjunction/testing-engine": patch
---

Widen the zod pin from `~3.24.4` to `^3.25.0` so it satisfies `@modelcontextprotocol/sdk`'s peer requirement (`zod ^3.25 || ^4.0`). The old tilde pin has no overlap with the SDK's peer range, which breaks strict package managers (pnpm) and MJCLI's oclif manifest generation under strict installs. zod 3.25.x keeps the classic v3 API at the root import, so this is a version-range correction with no behavior change.
