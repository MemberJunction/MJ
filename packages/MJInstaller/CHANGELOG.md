# @memberjunction/installer

## 5.11.0

## 5.10.1

## 5.10.0

## 5.9.0

## 5.8.0

## 5.7.0

## 5.6.0

## 5.5.0

### Patch Changes

- 1d3dec4: Add new headless, event-driven installer engine for MemberJunction. Features 9-phase install pipeline (preflight, scaffold, configure, database, platform compat, dependencies, migrate, codegen, smoke test), checkpoint/resume via state file, non-interactive CI/Docker mode (`--yes` + `--config`), `mj doctor` diagnostics, `--fast` optimistic mode, known-issue patching system, stdout-based service readiness detection, cross-platform Windows compatibility fixes, and 425 unit tests across 20 Vitest test files.
