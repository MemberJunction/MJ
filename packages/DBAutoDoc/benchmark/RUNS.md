# DBAutoDoc Benchmark Runs — AdventureWorks2022

## Goal
- Primary Key Detection: **95%+ F1**
- Foreign Key Detection: **90%+ F1**
- Description Coverage: **100% tables, 100% columns**

## Ground Truth (AdventureWorks2022)
- 71 tables across 6 schemas (dbo, HumanResources, Person, Production, Purchasing, Sales)
- 71 primary keys (42 single, 17 composite 2-col, 12 composite 3+ col)
- 91 foreign key relationships (single-column decomposed)
- 556 extended properties (71 table descriptions, 485 column descriptions)

## Runs

### Run 001 — Baseline
- **Date**: 2026-03-18
- **Model**: gemini-3-flash-preview
- **Config**: maxIterations=3, maxTokensPerRun=500K, discovery enabled
- **Results**: PK F1=48.0%, FK F1=37.1%, Table Desc=35%, Col Desc=0%
- **Grade**: F (34.1%)
- **Key Issues**: 
  - Only 25/71 tables described, 0 column descriptions
  - 62 false positive PKs, 29 missed PKs (14 BusinessEntityID pattern, 17 composite)
  - Composite PK limit of 3 columns rejected valid 4-col PKs
  - FK detector skips PK columns, missing PK-as-FK patterns
- **Report**: [runs/run-001/report.md](runs/run-001/report.md)

---

*Subsequent runs will be added as improvements are tested.*
