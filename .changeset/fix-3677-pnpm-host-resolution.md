---
"@memberjunction/server-bootstrap": patch
"@memberjunction/open-app-engine": patch
---

Fix Open App registration and migrations under pnpm (#3677). server-bootstrap now resolves runtime-configured packages (`dynamicPackages.server[]`, `codeGeneration.packages`) from the host application when a bare import cannot — pnpm's strict layout resolves bare specifiers from the importing package, which cannot declare runtime-known names. open-app-engine now declares the skyway packages as optionalDependencies so app migrations resolve them in every topology; a resolved provider's own load/constructor errors are no longer misreported as "provider not found".
