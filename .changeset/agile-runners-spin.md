---
"@memberjunction/cli": patch
"@memberjunction/computer-use": patch
"@memberjunction/computer-use-engine": patch
"@memberjunction/metadata-sync": patch
"@memberjunction/ng-base-application": patch
"@memberjunction/testing-cli": patch
"@memberjunction/testing-engine": patch
"@memberjunction/testing-engine-base": patch
---

Add full-stack MJ Explorer regression test suite — Docker-based runner with Computer Use engine, parallel workers via HeadlessBrowserEngine, bacpac mode, standalone compose for external use, and `mj test regression init` templates (remote-mj, generic-web, bring-your-own-app, static-file-server). Includes ephemeral workspace guard for cross-test isolation and stabilizes the suite at 25/25.
