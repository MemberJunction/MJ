---
"@memberjunction/codegen-lib": patch
---

Stop a working install from reporting itself as failed.

The CodeGen AFTER commands end with a boot check that runs `npm start` in MJAPI with a 30-second timeout. `npm start` is a server — it cannot exit on its own, so the timeout is the only way it can ever end, and `runCommand` hardcoded `success: false` on that path. `runCodeGen` fails the pipeline on any unsuccessful command, so every distribution install that reached CodeGen printed `Installation failed` and exited 1 on a system where the API had booted fine (verified: 390 tables, 388 entities, 87 migrations, API answering `401 Authentication required`).

`CommandInfo` gains `isDaemon`, which declares that staying up for the whole timeout is the pass. Exiting before the timeout is still a failure — a service that comes down on its own crashed — and `isDaemon` without a positive `timeout` is rejected up front rather than making CodeGen wait forever. Applied to the MJAPI boot check in both the shipped distribution config and the built-in default.
