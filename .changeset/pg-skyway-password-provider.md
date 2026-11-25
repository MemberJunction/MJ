---
"@memberjunction/cli": patch
"@memberjunction/open-app-engine": patch
---

PostgreSQL token logins (`PG_AUTH_MODE`) now get a fresh token for every connection a migration run opens. `mj migrate` and Open App installs and upgrades hand the password source to Skyway 0.9's `PasswordProvider` instead of fetching one token up front, so a run that outlasts a token no longer fails when Skyway opens a later connection. Skyway is raised to `^0.9.0`.
