---
"@memberjunction/installer": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/sqlglot-ts": patch
---

Installer: run child processes without building shell command strings. `Run` spawns through `cross-spawn` instead of `shell: true` on Windows, and port and process-tree cleanup pass arguments to `taskkill`, `netstat` and `lsof` as arrays and parse their output in code. SQLGlotTS writes its BIT-column registry into a private `mkdtemp` directory. CodeGen's `WriteFileIfChanged` reads the target directly instead of checking that it exists first.
