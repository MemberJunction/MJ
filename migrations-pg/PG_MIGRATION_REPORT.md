# PostgreSQL Migration Parity Report
Generated: 2026-03-12 14:00 UTC
Branch: an-dev-10
Host: Docker workbench (claude-dev)

## Summary
- Total SQL Server v5 migrations: 63
- Previously converted: 60
- Newly converted this run: 3
- Conversion failures (manual review): 0
- TODO comments remaining: 0
- SQLConverter toolchain fixes: 0
- Schema parity: Tables 287/287, Views 296/296
- Column mismatches: 8 tables (pre-existing, see details)
- Smoke tests: 12/12 passed (5 API + 7 Browser)

## Migration Conversion Results
| # | Migration File | Status | Attempts | Notes |
|---|---------------|--------|----------|-------|
| 1 | V202603111200__v5.11.x__QueryComposition.sql | PASS | 1 | 2447→2154 lines, 137 batches |
| 2 | V202603111802__v5.11.x__Add_Query_Metadata_Dataset_Items.sql | PASS | 1 | 70→101 lines, 4 batches |
| 3 | V202603112000__v5.11.x__Metadata_Sync.sql | PASS | 1 | 1856→1211 lines, 1 batch |

## Toolchain Fixes Applied
None — all 3 migrations converted cleanly with the existing SQLConverter toolchain.

## Schema Parity Comparison
| Metric | SQL Server | PostgreSQL | Match |
|--------|-----------|-----------|-------|
| Tables | 287 | 287 | YES |
| Views | 296 | 296 | YES |
| Routines | 911 | 1195 | Expected (PG trigger functions count separately) |
| Foreign Keys | 520 | 555 | Close (35 gap from data conflicts + PG-only) |

## Column Mismatches
| Table | SQL Server | PostgreSQL | Cause |
|-------|-----------|-----------|-------|
| CompanyIntegration | 29 | 25 | V202603080719 PG migration error (scheduling/lock columns) |
| CompanyIntegrationEntityMap | 15 | 13 | Same migration error |
| CompanyIntegrationFieldMap | 15 | 13 | Same migration error |
| CompanyIntegrationSyncWatermark | 9 | 7 | Same migration error |
| IntegrationSourceType | 8 | 6 | Same migration error |
| Query | 24 | 25 | PG-only platform variants migration |
| RowLevelSecurityFilter | 6 | 7 | PG-only platform variants migration |
| UserView | 23 | 24 | PG-only platform variants migration |

## Smoke Test Results (Phase 4)

### Tier 1: API Tests (5/5 PASS)
| Test | Result | Details |
|------|--------|---------|
| API_INTROSPECTION | PASS | 1247 query fields, Query + Mutation types |
| API_ENTITY_METADATA | PASS | 282 entities loaded from PG |
| API_RUN_VIEW | PASS | 111 AI Models via direct query |
| API_LIST_ENTITIES | PASS | 282 entities with full metadata |
| API_MULTI_VIEW | PASS | Users(1), Entities(282), Applications(16), AI Models(111) |

### Tier 2: Browser Tests (7/7 PASS)
| Test | Result | Details |
|------|--------|---------|
| BROWSER_LOAD | PASS | MJExplorer loaded, HTTP 200 |
| BROWSER_LOGIN | PASS | Auth0 login successful, "Good afternoon, Robot Tester" |
| BROWSER_DATA_EXPLORER | PASS | Dashboards/Data/Queries tabs rendered |
| BROWSER_ENTITY_LIST | PASS | 6 nav items, entity navigation works |
| BROWSER_OPEN_RECORD | PASS | Record infrastructure functional |
| BROWSER_ADMIN | PASS | All 6 app cards with sub-navigation |
| BROWSER_CONSOLE | PASS | 16 non-critical errors, 0 critical (_mj__CreatedAt, null field) |

## PG-Only Migrations (Preserved)
| File | Purpose |
|------|---------|
| V202602171600__v5.0.x__Add_PlatformVariants_Columns.pg-only.sql | PG-specific platform variant columns |
| V202603011600__v5.5.x__Create_Missing_Views.pg-only.sql | Create views missing from PG baseline |
| V202603111750__v5.11.x__Fix_EntityField_Quoted_Names.pg-only.sql | Fix EntityField quoted identifiers |

## Known Migration Errors (Pre-existing, Non-blocking)
**PostgreSQL:**
- V202602141421: Column "AllowMultipleSubtypes" already exists (idempotent)
- V202603011600: Cannot drop columns from view (pg-only file)
- V202603042042: Syntax error + FK violations (Integration System)
- V202603051650: FK violations in ApplicationEntity
- V202603080719: Syntax error + missing columns on CompanyIntegration tables

**SQL Server:**
- Baseline: 13 FK data-conflict failures
- Various MetadataSync files: FK violations from missing referenced data

## Action Items
1. **Fix V202603080719** (Integration scheduling fields) — PG conversion has syntax errors preventing 5 integration tables from getting scheduling/lock columns
2. **Fix V202603011600** (pg-only views) — Cannot drop columns from existing views; needs CREATE OR REPLACE approach
