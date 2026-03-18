# DBAutoDoc Benchmark Field Log

## 2026-03-18 — Session 1: Initial Benchmark Setup

### Environment
- Docker workbench (claude-dev container + sql-claude SQL Server 2022)
- Branch: `claude/dbautodoc-benchmark`
- Model: gemini-3-flash-preview (Gemini 3 Flash)
- Database: AdventureWorks2022 → AW_Stripped (all constraints, PKs, FKs, extended props removed)

### Setup Process
1. Restored AdventureWorks2022 from Microsoft's GitHub .bak (201MB)
2. Created AW_Stripped by cloning and removing:
   - All foreign keys (0 remaining)
   - All primary keys (required dropping full-text indexes and XML indexes first)
   - All CHECK constraints
   - All UNIQUE constraints
   - All DEFAULT constraints
   - All extended properties (table + column level)
   - All non-clustered indexes
3. Verified: 71 tables, 0 PKs, 0 FKs, 0 CHECKs, 0 UQs, 0 defaults, 0 table/column extended props

### Ground Truth Extracted
- 71 PKs (every table has one)
- 91 FK relationships (86 FK constraints, decomposed to 91 single-column relationships)
- 556 descriptions (71 table-level, 485 column-level)

### Run 001 — Baseline Results
- **Critical Discovery**: Description generation only covered 35% of tables and 0% of columns
  - The analysis engine ran 3 iterations but only processed ~25 tables
  - Need to investigate: is this a topological sort issue? Token budget? Level processing bug?
- **PK Detection Observations**:
  - Excellent at finding obvious surrogate keys (*ID columns) — 100% confidence
  - Completely misses BusinessEntityID-as-PK pattern (14 tables in AW use parent's PK as their own PK)
  - Composite key detection limited to 3 columns max — 4-col composites rejected by Rule 5
  - Natural key detection absent (CountryRegionCode, CurrencyCode, UnitMeasureCode)
  - Too many false positives (62) — rowguid columns, nullable columns, FK columns all flagged as PK candidates
- **FK Detection Observations**:
  - Many FKs are actually CORRECT but fail comparison due to schema prefix in target table name
  - After normalizing schema prefixes: 33/91 correct = 37.1% F1
  - PK-as-FK blind spot: once a column is detected as PK, it's skipped in FK analysis
  - Significant noise from BusinessEntityID appearing in many tables (valid overlap but not always a real FK)
- **Description Quality**: When descriptions ARE generated, they're semantically excellent — often more detailed than the original AW documentation

### Architecture Notes for Improvement
- `PKDetector` in `src/discovery/PKDetector.ts` — needs composite limit increase, BusinessEntityID pattern
- `FKDetector` in `src/discovery/FKDetector.ts` — needs to not skip PK columns for FK analysis
- `AnalysisOrchestrator` in `src/core/AnalysisOrchestrator.ts` — need to understand why only 25/71 tables processed
- Config guardrails may be too restrictive for 71-table database

