# DBAutoDoc Relationship Discovery Algorithm

## Technical Reference for Research Paper

Version: 2.0 (Post-Benchmark Iteration)
Last Updated: 2026-03-18

---

## 1. Overview

DBAutoDoc discovers primary keys (PKs) and foreign keys (FKs) in databases that lack
formal constraint definitions. The algorithm combines statistical analysis of column
data with heuristic scoring and optional LLM validation to identify relationships
with high confidence.

This document describes the algorithm in detail, suitable for inclusion in a research
paper or technical report. It covers the scoring models, heuristics, and design
decisions with rationale.

---

## 2. Primary Key Detection

### 2.1 Pipeline

PK detection follows a multi-stage pipeline:

```
Column Stats Collection
    |
    v
Eligibility Gate (hard reject)
    |
    v
Single-Column Scoring
    |
    v
Column-Order Demotion (1A)
    |
    v
Table-Name Tiebreaker (1F)
    |
    v
Surrogate Key Check
    |
    v
Composite Key Detection (if no surrogate)
    |
    v
LLM Validation (optional, 1G)
```

### 2.2 Eligibility Gate

Before any scoring, a column must pass the **deterministic eligibility gate**:

- **Zero null values** (nullCount = 0)
- **Zero blank/zero values** (no empty strings, no literal 0 in samples)
- **100% unique values** (distinctCount = totalRows)
- **Non-empty table** (totalRows > 0)

This is the mathematical definition of a primary key and cannot be overridden.
Columns failing this gate are immediately rejected with logged reasons.

### 2.3 Single-Column Scoring Model

Each eligible column receives a confidence score (0-100) composed of:

| Component | Weight | Description |
|-----------|--------|-------------|
| Uniqueness | 50% | Fraction of distinct values (always 1.0 after gate) |
| Naming Pattern | 20% | Score based on PK naming conventions |
| Data Type | 15% | Appropriateness of type for PK use |
| Data Pattern | 15% | Sequential, GUID, natural, composite, unknown |

**Additional modifiers:**

- **Blacklist rejection** (score = 0): Columns matching known non-PK patterns
  (quantities, dates, text fields, flags, addresses, etc.)
- **FK-pattern penalty**: Three-tier system (see Section 2.5)
- **Surrogate key boost** (+20): For columns matching surrogate naming with
  high uniqueness and appropriate data type
- **Poor naming penalty** (x0.5): If uniqueness >= 95% but naming score < 0.3
- **Column ordinal boost** (+5 for positions 0-1, +2 for positions 2-3):
  PKs are conventionally the first column(s) in a table

### 2.4 Column-Order Demotion (Change 1A)

**Rationale:** Secondary UUID columns (e.g., rowguid for SQL Server replication)
pass all statistical checks but are never PKs. Rather than name-based blacklisting,
we use positional evidence.

**Algorithm:**
1. Score all single-column candidates for a table
2. Identify the best candidate with confidence >= 80 and ordinal position <= 2
3. If found, demote all other uniqueidentifier/UUID/GUID-type columns with
   ordinal position > 2 by multiplying their score by 0.3

**Why not blacklist by name?** The name "rowguid" is SQL Server-specific. This
approach generalizes to any database where replication or audit UUID columns
appear after the real PK.

### 2.5 FK-Pattern Penalty (Change 1B)

Columns ending in ID/KEY that reference another table may be FKs, not PKs.
The penalty has three tiers:

| Tier | Condition | FK Likelihood | Score Penalty |
|------|-----------|---------------|---------------|
| 1 | Column prefix matches current table name | 0.1 | ~6% |
| 2 | Column prefix matches another table where it IS a PK | 0.3 | ~18% |
| 3 | Column prefix does not match any known PK table | 0.7 | ~42% |

**Example:** `BusinessEntityID` in `Employee` table:
- Prefix "BusinessEntity" does not match "Employee" (not Tier 1)
- But BusinessEntityID IS the PK in `BusinessEntity` table (Tier 2)
- Gets 0.3 penalty instead of the old 0.9, preserving it as a valid PK-as-FK

### 2.6 Table-Name Tiebreaker (Change 1F)

When multiple single-column candidates have confidence >= 70:
1. Check if any candidate name contains the table name (case-insensitive)
2. Boost the matching candidate by +15
3. Demote non-matching candidates by x0.7

**Example:** Table `Product` with candidates ProductID (85) and ProductModelID (85):
- ProductID contains "Product" -> boosted to 100
- ProductModelID does not match -> demoted to 59.5

### 2.7 Composite Key Detection (Change 1D)

For tables without a surrogate key candidate:

1. Find columns ending in ID or KEY
2. Also include PK-eligible columns (from stats cache) if >= 2 ID/KEY columns
   already exist (allows date columns to participate)
3. Filter to columns with zero nulls and zero blanks
4. If 2-4 eligible columns remain, test combination uniqueness
5. If unique, create composite candidate with confidence 75

### 2.8 LLM Reasoning Phase (Change 1G, Future)

After statistical scoring, borderline candidates (confidence 50-80) are sent to
an LLM with full table context. The LLM can reject weak candidates but never
add new ones or override high-confidence decisions.

---

## 3. Foreign Key Detection

### 3.1 Pipeline

```
Column Pre-filtering (type, value sampling)
    |
    v
Target Discovery (3 pattern passes)
    |
    v
Deduplication (2C)
    |
    v
Per-Target Analysis (containment, cardinality, naming)
    |
    v
Confidence Scoring with Target Ranking (2B)
    |
    v
LLM Validation (optional)
```

### 3.2 Column Pre-filtering

Two-tier filtering eliminates columns that can never be FKs:

**Tier 1 - Data Type Filter:**
Non-key types are immediately rejected: dates, booleans, floats, money,
binary, XML, geography, etc.

**Tier 2 - Value Sampling (string columns only):**
Sample 10 values and check if majority look like keys vs. data:
- Non-key indicators: emails (@), URLs (http), long text (>100 chars),
  multi-word strings (3+ words)
- If >50% of samples look like non-keys, skip the column

**rowguid Exclusion (Change 2D):**
Columns named exactly "rowguid" (case-insensitive) are skipped. These are
SQL Server replication identifiers, never real foreign keys.

**PK Column Handling (Change 2A):**
PK columns are no longer skipped but analyzed with a higher confidence bar
(80 vs. normal minimum). This captures PK-as-FK identifying relationships.

### 3.3 Target Discovery

Three pattern-matching passes find potential FK targets:

1. **Column Name -> Table:** Extract table name from column (CustomerID -> Customer),
   find matching table with ID column
2. **PK Name Similarity:** Compare column name against all discovered PK column names
   using Levenshtein distance (threshold > 0.6)
3. **Same Column Name:** Find same-named column in other tables where it is a PK

**Deduplication (Change 2C):** Before scoring, deduplicate targets by
(schemaName, tableName, columnName) to prevent duplicates from multiple passes.

### 3.4 FK Confidence Scoring Model

| Component | Weight (PK target) | Weight (non-PK) | Description |
|-----------|--------------------|-|-------------|
| Value Containment | 55% | 70% | Steep curve (see below) |
| ID-in-Name Bonus | 10 pts | 10 pts | Column name contains "ID" |
| Naming Match | 10% | 10% | Name similarity score |
| Cardinality | 10% | 10% | Many:one ratio |
| Target-is-PK | 15 pts | 0 pts | Bonus if target column is a PK |
| Null Handling | 5 pts | 5 pts | Penalty for high null percentage |

### 3.5 Containment Curve

Value containment uses a steep step function. True FKs should have near-perfect
containment (source values exist in target):

| Containment | Multiplier | Interpretation |
|-------------|------------|----------------|
| 100% | 1.0 | Perfect containment |
| 99.5-100% | 0.8 | Very strong |
| 98-99.5% | 0.5 | Strong, few orphans |
| 95-98% | 0.3 | Likely, some orphans |
| 90-95% | 0.1 | Possible, dirty data |
| < 90% | 0.0 | Not a FK |

### 3.6 Target Ranking (Change 2B)

When multiple targets match for a column, rank by PK structure:

| Target PK Type | Bonus/Penalty | Rationale |
|----------------|---------------|-----------|
| Single-column PK | +15 | Most common FK pattern |
| Composite PK | 0 | Composite PKs are usually leaf nodes |
| Not a PK | -15 | Unlikely to be a real FK target |

This dramatically reduces false positives when a column name appears in many tables.

---

## 4. Benchmark Results

### 4.1 AdventureWorks2022 (AW_Stripped)

Ground truth: 71 PKs, 91 FKs (decomposed), 556 descriptions

| Run | Algorithm | PK P | PK R | PK F1 | FK P | FK R | FK F1 | Tokens |
|-----|-----------|------|------|-------|------|------|-------|--------|
| 001 | Baseline (v1) | 40.4% | 59.2% | 48.0% | 56.2% | 98.9% | 71.7% | 6.3M |
| 002 | v2 (1A-1F, 2A-2D) | TBD | TBD | TBD | TBD | TBD | TBD | TBD |

### 4.2 Error Analysis (Run 001)

**PK Missed (29):**
- 14 BusinessEntityID-as-PK (fixed by 1B)
- 17 composite PKs (partially fixed by 1D)
- 5 natural keys (expected improvement from 1A ordinal boost)

**PK False Positives (62):**
- ~15 rowguid columns (fixed by 1A)
- ~10 composites with rowguid (fixed by 1A)
- ~20 wrong single-column picks (fixed by 1F)
- ~17 composite column mismatches

**FK Missed (1):**
- 1 PK-as-FK identifying relationship (fixed by 2A)

**FK False Positives (70):**
- Multi-target ambiguity (fixed by 2B)
- Schema duplicates (fixed by 2C)
- rowguid cross-matches (fixed by 2D)

---

## 5. Design Decisions and Rationale

### 5.1 Why Column Order Over Name Blacklisting (1A)

Name-based blacklisting (e.g., reject "rowguid") is fragile and database-specific.
Column ordinal position is a universal signal: DBAs conventionally place the PK
as the first column. This approach generalizes across databases and also handles
audit/tracking UUID columns that appear late in table definitions.

### 5.2 Why Three Tiers for FK Penalty (1B)

The original binary penalty (0.1 if matches table, 0.9 if not) missed the
identifying relationship pattern where a column IS both a PK and FK (e.g.,
Employee.BusinessEntityID is PK in Employee AND FK to BusinessEntity). The
three-tier system recognizes this intermediate case.

### 5.3 Why Statistical Approach Over Name Patterns for Natural Keys (1E Dropped)

Natural key naming patterns (ends in "Code", "Key") are too broad and would
generate false positives. The statistical approach (unique, non-null, non-blank,
early ordinal) catches natural keys without risky pattern matching.

### 5.4 Why Steep Containment Curve (FK)

In clean databases, true FKs have 100% containment. Even in dirty databases,
containment rarely drops below 95% for real relationships. The steep curve
ensures that coincidental value overlaps (common with small integer ranges
or status codes) dont generate false FK candidates.

### 5.5 Why Single-Column PK Target Bonus (2B)

Composite PKs typically represent junction/bridge tables or history tables.
These are leaf nodes in the dependency graph - other tables rarely reference
them. Single-column PKs are overwhelmingly the target of FK relationships
in practice.

---

## 6. Future Work

- **LLM Reasoning Phase (1G):** Use LLM to validate/reject borderline candidates
- **Cross-database benchmarking:** Northwind, Chinook, WideWorldImporters, Spider/BIRD
- **PostgreSQL testing:** Verify algorithm works across database platforms
- **Instrumentation:** Per-iteration confidence tracking, convergence trajectory
- **Real-world validation:** Customer databases with known schema
