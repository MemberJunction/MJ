# DBAutoDoc Benchmark Evaluation Plan

## Overview
Systematic evaluation of DBAutoDoc against well-known sample databases to measure and improve key detection and description generation accuracy.

## Target Metrics
- Primary Key Detection: **95%+ F1 score**
- Foreign Key Detection: **90%+ F1 score**  
- Description Coverage: **100% tables, 100% columns**

## Phase 1: AdventureWorks2022 (IN PROGRESS)
- **Status**: Baseline established (Run 001), iterating improvements
- **Branch**: `claude/dbautodoc-benchmark`
- **Ground Truth**: 71 tables, 71 PKs, 91 FKs, 556 descriptions
- **Baseline**: PK F1=48%, FK F1=37%, Desc=35%

## Phase 2: Additional Sample Databases
After achieving targets on AW, test generalization:

### Northwind
- Classic Microsoft sample database
- ~13 tables, simpler schema
- Good test for basic accuracy on smaller DB
- Download: Microsoft SQL Server Samples on GitHub

### WideWorldImporters
- Modern Microsoft sample database
- ~30+ tables, temporal tables, complex relationships
- Good test for advanced features
- Download: Microsoft SQL Server Samples on GitHub

### Spider / BIRD Datasets
- Academic text-to-SQL benchmarks
- Spider: 200+ databases across many domains
- BIRD: Real-world databases with dirty data
- Would provide diverse schema patterns for stress testing

### Chinook
- Cross-platform sample database (SQL Server, PostgreSQL, MySQL, SQLite)
- ~11 tables, music store domain
- Good for PostgreSQL compatibility testing

## Phase 3: PostgreSQL Compatibility
- Ensure all improvements work on PostgreSQL
- Test with Chinook (available as .sql for PG)
- Test with Pagila (PostgreSQL version of Sakila)

## Phase 4: Real-World Databases
- Test on actual customer databases (anonymized in reports)
- Label as "Real World #1", "Real World #2", etc.
- Focus on edge cases not present in sample databases

## Methodology
1. Extract ground truth (PKs, FKs, descriptions) from original database
2. Create stripped copy (remove all constraints and documentation)
3. Run DBAutoDoc with standard config
4. Compare against ground truth using precision/recall/F1
5. Iterate: hypothesize → implement → test → measure
6. All runs tracked in `packages/DBAutoDoc/benchmark/`
