---
"@memberjunction/core": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/server": patch
"@memberjunction/metadata-sync": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/cli": patch
"@memberjunction/testing-integration": patch
---

Add configurable startup mode ('full' | 'task') for fast CLI/script boot. StartupManager.Startup() accepts startup options; 'task' mode skips all @RegisterForStartup engine pre-warm (engines lazy-load on first touch) while 'full' preserves existing behavior. Mode resolves via a shared four-level precedence chain (MJ_STARTUP_MODE env var > programmatic option > mj.config.cjs startup.mode > entry-point default). MJAPI defaults to 'full'; MJCLI, mj-sync, and CodeGen default to 'task'. Measured 14x CPU reduction on mj sync validate.
