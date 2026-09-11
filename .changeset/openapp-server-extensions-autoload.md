---
"@memberjunction/server-extensions-core": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server": patch
---

Auto-load Open App `serverExtensions` from packages listed in host `dynamicPackages.server[]`. Packages declare them via the `MJ_SERVER_EXTENSIONS` export or `package.json` `memberjunction.serverExtensions`; `serve()` overlays host `mj.config.cjs` `serverExtensions[]` by DriverClass so operators no longer copy Open App extension blocks into the host config.
