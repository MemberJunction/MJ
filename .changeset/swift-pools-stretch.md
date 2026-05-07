---
"@memberjunction/codegen-lib": patch
---

Make the CodeGen SQL request timeout configurable via `dbRequestTimeout` in `mj.config.cjs` or the `MJ_CODEGEN_REQUEST_TIMEOUT` environment variable. Default behavior is unchanged (120000ms); the config-file field name matches MJCLI's existing `dbRequestTimeout` so a single value covers both `mj migrate` and `mj codegen`.
