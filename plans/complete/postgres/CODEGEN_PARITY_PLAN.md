# CodeGen Parity Plan: SQL Server ↔ PostgreSQL

## Overview

Validate that MemberJunction CodeGen produces identical artifacts when run against SQL Server vs PostgreSQL for all 17 sample schemas. Fix any bugs found in the CodeGen provider model (PG subclass, base classes, or SQL generation). Then run full integration testing via Playwright.

**Branch**: `postgres-5-0-implementation` (Docker only)
**Ground Truth**: `next` branch CodeGen (battle-tested on SQL Server)
**Supervisor**: Amith (host) — CC in Docker does all work

## Architecture Notes

- CodeGen uses a **provider model** with thin DB-specific subclasses
- SQL Server provider is battle-tested on `next` branch = ground truth
- PostgreSQL provider subclass is most likely source of bugs
- Base class refactor may also have introduced bugs
- When encountering bugs, ALWAYS check `next` branch CodeGen as reference

## Phase 0: CodeGen Orchestration Abstraction (PREREQUISITE) — COMPLETE

Abstracted CodeGen orchestration layer to support PostgreSQL via provider model.
All 22+ abstract methods implemented in PostgreSQLCodeGenProvider.

## Phase 1: CodeGen Parity Testing — COMPLETE (17/17 PASS)

### Method (for each migration)

1. Start with CLEAN databases (drop/recreate schema on both SQL Server and PostgreSQL)
2. Apply original T-SQL migration to SQL Server (`sql-claude`)
3. Apply converted PG migration to PostgreSQL (`postgres-claude`)
4. Run CodeGen against SQL Server — capture all generated DB objects
5. Run CodeGen against PostgreSQL — capture all generated DB objects
6. Exhaustive comparison of views, CRUD functions, entity metadata, fields, relationships, triggers
7. If differences → fix CodeGen → rebuild → clean DBs → re-run → re-compare
8. Iterate until ZERO differences

### Migration Results

| # | Schema | Domain | Status | Fixes | Commit |
|---|--------|--------|--------|-------|--------|
| 1 | sample_hr | HR / Employees | **PASS** | 17 bugs | fcd34f454 |
| 2 | sample_ecommerce | E-Commerce | **PASS** | 3 bugs | 2e130a287 |
| 3 | sample_lms | Learning Mgmt | **PASS** | 0 (clean) | - |
| 4 | sample_realestate | Real Estate | **PASS** | 4 bugs | 00abb1cff |
| 5 | sample_fitness | Fitness | **PASS** | 2 bugs | f93d74cec |
| 6 | sample_helpdesk | Help Desk | **PASS** | 2 bugs | 357f4f8df |
| 7 | sample_inventory | Inventory | **PASS** | 1 bug | ebe0e9943 |
| 8 | sample_library | Library | **PASS** | 4 infra fixes | 5feba890d |
| 9 | sample_restaurant | Restaurant | **PASS** | 0 (clean) | f2490006e |
| 10 | sample_clinic | Medical Clinic | **PASS** | 0 (clean) | - |
| 11 | sample_nonprofit | Nonprofit | **PASS** | 0 (clean) | 31e8cc45e |
| 12 | sample_travel | Travel | **PASS** | 0 (clean) | - |
| 13 | sample_fleet | Fleet Mgmt | **PASS** | 0 (clean) | c0aab1210 |
| 14 | sample_school | School | **PASS** | 0 (clean) | - |
| 15 | sample_warehouse | Warehouse | **PASS** | 1 bug | 140499f23 |
| 16 | sample_crm | CRM/Sales | **PASS** | 0 (clean) | 52cf73c0c |
| 17 | sample_property | Property Mgmt | **PASS** | 0 (clean) | 52cf73c0c |

### Cumulative Bug Fix Log

| # | File | Bug | Fix | Found In |
|---|------|-----|-----|----------|
| 1 | manage-metadata.ts | PG INSERT column quoting | Wrapped PascalCase cols in qi() | M1 |
| 2 | manage-metadata.ts | Timestamp type alias | Added PG type aliases | M1 |
| 3 | manage-metadata.ts | null DefaultValues as 'undefined' | Fixed null handling in parseDefaultValue | M1 |
| 4 | PostgreSQLCodeGenProvider.ts | fn_create DEFAULT param ordering | PG requires all params after first DEFAULT to have defaults | M1 |
| 5 | sql_codegen.ts | Null entity in generateRootFieldSelects | Passed actual entity instead of null! | M1 |
| 6 | PostgreSQLCodeGenProvider.ts | Double commas in view SELECT | Fixed select part assembly | M1 |
| 7 | PostgreSQLCodeGenProvider.ts | UUID type not recognized | Added 'uuid' check alongside 'uniqueidentifier' | M1 |
| 8 | PostgreSQLCodeGenProvider.ts | PK missing from fn_create INSERT | Include PK in INSERT for UUID types | M1 |
| 9 | PostgreSQLCodeGenProvider.ts | Duplicate view permissions | Removed duplicate generation | M1 |
| 10 | sql.ts | psql execution missing | Added psql-based SQL execution for PG | M2 |
| 11 | temp_batch_file.ts | GO separators in PG batch files | Use blank line instead of GO | M2 |
| 12 | PostgreSQLCodeGenProvider.ts | Root ID field naming | Fixed PG root field name handling | M2 |
| 13 | manage-metadata.ts | PG COUNT returns string | Added Number() coercion for COUNT values | M4 |
| 14 | manage-metadata.ts | vwSQLColumnsAndEntityFields AllowsNull | Use COALESCE(bt_a.attnotnull, a.attnotnull) | M5 |
| 15 | manage-metadata.ts | CHECK constraint handling | Fixed for PG compatibility | M5 |
| 16 | util.ts | bool type missing | Added 'bool' to TypeScriptTypeFromSQLType | M6 |
| 17 | graphql_server_codegen.ts | PG type mappings missing | Added uuid, timestamptz, bool, float4, float8, bytea | M6 |
| 18 | ExpressionHelpers.ts | String literal corruption | Fixed tokenization in SQL conversion | M7 |
| 19 | Various PG baseline views | Infrastructure view fixes | Fixed 4 PG views for compatibility | M8 |
| 20 | manage-metadata.ts | Unquoted EntityID column | Added qi() wrapper for PG | M15 |
| 21 | graphql_server_codegen.ts | MaxLength field reference | Use fieldInfo.MaxLength not fieldInfo.Length | M16 |
| 22 | SQLDialect tests | CurrentTimestampUTC() parens | Updated test expectations for parens wrapping | M17 |

### Unit Test Summary

- **CodeGenLib**: 211/211 passed
- **SQL Converter**: 614/614 passed (2 integration skipped)
- **SQLDialect**: 183/183 passed
- **Full monorepo**: ~4,960 tests, 0 failures

### Key Milestones

- Migrations 9-14: Six consecutive clean passes (zero bugs)
- Bug rate dropped dramatically after Migration 8
- All fixes follow proper OOP abstraction patterns (provider overrides, not if/isPostgreSQL checks)

## Phase 2: Full Integration Testing (Playwright Headless)

### Prerequisites
- [x] All 17 CodeGen parity tests PASS
- [ ] MJAPI running against PostgreSQL in Docker
- [ ] MJExplorer running in Docker

### Test Cases

| # | Test | Status |
|---|------|--------|
| 1 | Login/auth flow | PENDING |
| 2 | Entity browsing / data grids | PENDING |
| 3 | Record creation (Create) | PENDING |
| 4 | Record reading (Read) | PENDING |
| 5 | Record updating (Update) | PENDING |
| 6 | Record deletion (Delete) | PENDING |
| 7 | Record Changes (version tracking) — UI | PENDING |
| 8 | Record Changes — DB verification | PENDING |
| 9 | Navigation and routing | PENDING |
| 10 | Zero rendering variances vs SQL Server | PENDING |

### Integration Bug Fix Log

| # | Component | Bug | Fix | Commit |
|---|-----------|-----|-----|--------|
| (populated as bugs are found and fixed) | | | | |

## Progress Notes

- **2026-02-24**: Phase 1 COMPLETE — All 17 migrations pass CodeGen parity testing
- 22 source code bugs fixed across ~12 files
- 6 consecutive clean passes (migrations 9-14) demonstrated toolchain stability
- Phase 2 (Playwright integration testing) is next
