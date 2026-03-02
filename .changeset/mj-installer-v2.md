---
"@memberjunction/installer": patch
"@memberjunction/cli": patch
---

Add new headless, event-driven installer engine for MemberJunction. Features 9-phase install pipeline (preflight, scaffold, configure, database, platform compat, dependencies, migrate, codegen, smoke test), checkpoint/resume via state file, non-interactive CI/Docker mode (`--yes` + `--config`), `mj doctor` diagnostics, `--fast` optimistic mode, known-issue patching system, stdout-based service readiness detection, cross-platform Windows compatibility fixes, and 425 unit tests across 20 Vitest test files.
