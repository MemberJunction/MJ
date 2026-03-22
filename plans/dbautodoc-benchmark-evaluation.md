# DBAutoDoc Benchmark Evaluation Plan

## Purpose
Run DBAutoDoc against well-known public databases with ground truth (declared PKs, FKs, extended properties), then measure discovery accuracy and description quality. This provides reproducible proof points for the research paper.

--- 

## Benchmark Databases

| Database | Engine | Tables | Schemas | Complexity | Why |
|----------|--------|--------|---------|------------|-----|
| **AdventureWorks** | SQL Server | 70+ | 5 (HumanResources, Person, Production, Purchasing, Sales) | High | Multi-schema, rich FKs, extended properties, views, computed columns |
| **Northwind** | SQL Server / PostgreSQL | 13 | 1 | Low | Classic, well-understood, easy to validate manually |
| **Chinook** | Cross-platform | 11 | 1 | Low | Music store, simple relationships, good for baseline |
| **WideWorldImporters** | SQL Server | 30+ | 5 (Application, Purchasing, Sales, Warehouse, Website) | Medium-High | Modern MS sample DB, temporal tables, JSON columns |
| **OrgB** (enterprise) | SQL Server | 125 | 10 | High | Real-world association management, anonymized |

### Download Sources
- **AdventureWorks**: Microsoft SQL Server samples (GitHub `microsoft/sql-server-samples`)
- **Northwind**: Microsoft legacy samples or community PostgreSQL ports
- **Chinook**: `lerocha/chinook-database` on GitHub (multi-platform SQL scripts)
- **WideWorldImporters**: Microsoft SQL Server samples (`.bak` or creation scripts)

---

## Methodology

### Phase 1: Prepare Ground Truth

For each database:

1. **Restore/Create** the database with full schema (all PKs, FKs, indexes, extended properties)
2. **Extract ground truth** into a standardized JSON format:
   ```json
   {
     "database": "AdventureWorks",
     "tables": [
       {
         "schema": "Person",
         "name": "Person",
         "primaryKey": ["BusinessEntityID"],
         "description": "...(from extended properties)...",
         "columns": [
           { "name": "BusinessEntityID", "description": "..." },
           ...
         ],
         "foreignKeys": [
           { "column": "BusinessEntityID", "referencesSchema": "Person", "referencesTable": "BusinessEntity", "referencesColumn": "BusinessEntityID" }
         ]
       }
     ]
   }
   ```
3. **Create stripped copy**: Remove all PK/FK constraints, drop extended properties, remove column descriptions

### Phase 2: Run DBAutoDoc (Blind)

For each stripped database:
1. Create a config file with seed context (just the database name and general domain — no table-specific hints)
2. Run full analysis: key discovery → topo sort → LLM description → backpropagation → convergence
3. Save state.json and all exports

### Phase 3: Run Ablation Variants

For each database, run additional configurations:
- **No backpropagation**: `backpropagation.enabled = false`
- **Single pass**: `maxIterations = 1`, no backprop, no sanity checks
- **With ground truth on 10%**: Provide expert descriptions for ~10% of tables, measure propagation
- **Different LLMs**: Compare Gemini Flash vs Claude Sonnet vs GPT-4o-mini (cost vs quality)

### Phase 4: Measure Results

#### Key Discovery Metrics
- **PK Precision**: % of discovered PKs that match ground truth
- **PK Recall**: % of ground truth PKs that were discovered
- **FK Precision**: % of discovered FKs that match ground truth
- **FK Recall**: % of ground truth FKs that were discovered
- **F1 Score**: Harmonic mean of precision and recall

#### Description Quality Metrics
- **Cosine similarity**: Embed both ground truth and generated descriptions, compute similarity
- **Human evaluation** (1-5 scale): Accuracy, completeness, clarity, domain relevance
- **Factual accuracy**: Does the description contain incorrect claims?
- **Specificity**: Does it reference actual data patterns vs generic boilerplate?

#### Convergence Metrics
- **Iterations to stability**: How many iterations before convergence
- **Backprop impact**: % of tables revised by backpropagation
- **Confidence trajectory**: Average confidence per iteration (convergence curve)
- **Token efficiency**: Total tokens / table count

#### Cost Metrics
- **Total tokens** (input + output)
- **Estimated cost** per database
- **Cost per table** average
- **Time to completion**

---

## Scripts to Build

### 1. `scripts/eval/extract-ground-truth.ts`
Connects to a fully-keyed database and extracts all PKs, FKs, descriptions, and extended properties into the ground truth JSON format.

### 2. `scripts/eval/strip-keys.sql`
SQL script that:
- Drops all foreign key constraints
- Drops all primary key constraints (but keeps the columns)
- Removes all extended properties (MS_Description)
- Removes all column descriptions
- Preserves data and indexes

```sql
-- Template for SQL Server
DECLARE @sql NVARCHAR(MAX) = '';

-- Drop all foreign keys
SELECT @sql += 'ALTER TABLE [' + s.name + '].[' + t.name + '] DROP CONSTRAINT [' + fk.name + '];' + CHAR(13)
FROM sys.foreign_keys fk
JOIN sys.tables t ON fk.parent_object_id = t.object_id
JOIN sys.schemas s ON t.schema_id = s.schema_id;

EXEC sp_executesql @sql;

-- Drop all extended properties
-- ... (similar pattern for sp_dropextendedproperty)
```

### 3. `scripts/eval/compare-keys.ts`
Compares discovered keys (from `additionalSchemaInfo.json`) against ground truth JSON:
- Computes PK precision/recall/F1
- Computes FK precision/recall/F1
- Handles fuzzy matching (discovered FK might reference a different column name but same logical relationship)
- Outputs a comparison table

### 4. `scripts/eval/compare-descriptions.ts`
Compares generated descriptions against ground truth descriptions:
- Uses embedding similarity (OpenAI or local model)
- Produces per-table similarity scores
- Aggregates by schema and overall
- Identifies best/worst matches for case study analysis

### 5. `scripts/eval/convergence-report.ts`
Reads state.json and produces CSV/JSON with per-iteration stats:
- Iteration number, tables changed, tables unchanged
- Average confidence, min/max confidence
- Backprop triggers, tokens used
- Ready for plotting in paper figures

### 6. `scripts/eval/ablation-runner.ts`
Orchestrates multiple DBAutoDoc runs:
- Takes a base config and a list of ablation variants
- Runs each variant sequentially
- Collects results into a comparison report
- Outputs a summary table suitable for the paper

---

## Expected Results (Hypotheses)

### Key Discovery
- **PK precision**: >90% (naming convention patterns are strong)
- **PK recall**: >85% (may miss unconventional PKs like composite keys)
- **FK precision**: >70% (LLM validation should filter false positives)
- **FK recall**: >60% (cross-schema FKs are harder, some implicit relationships)

### Description Quality
- **Simple databases** (Chinook, Northwind): >0.8 cosine similarity to ground truth
- **Complex databases** (AdventureWorks, WideWorldImporters): >0.7 similarity
- **Backprop improvement**: 5-15% quality increase in parent table descriptions

### Convergence
- **Simple databases**: Converge in 2-3 iterations
- **Complex databases**: Converge in 4-8 iterations
- **Backprop accelerates convergence** vs. relying solely on outer iteration loop

### Cost
- **Small databases** (11-13 tables): <$0.10 with Gemini Flash
- **Medium databases** (30-70 tables): $0.50-$2.00
- **Large databases** (125+ tables): $1.00-$5.00

---

## Timeline

- **Step 1** (1 day): Build `extract-ground-truth.ts` and `strip-keys.sql` scripts
- **Step 2** (1 day): Download/restore AdventureWorks, Northwind, Chinook; extract ground truth; create stripped copies
- **Step 3** (1 day): Create config files for each database; run DBAutoDoc on all 3-4 databases
- **Step 4** (1 day): Build comparison scripts (`compare-keys.ts`, `compare-descriptions.ts`)
- **Step 5** (1 day): Run ablation variants; build convergence report generator
- **Step 6** (1 day): Compile results, generate figures and tables for paper
- **Step 7** (1 day): Write evaluation section of paper with actual numbers

**Total: ~7 working days**

---

## Paper Figures This Produces

1. **Table: Key Discovery P/R/F1** — Per-database breakdown of PK and FK accuracy
2. **Figure: Convergence Curves** — % tables changing per iteration, overlaid for all databases
3. **Table: Ablation Results** — With vs. without backprop, with vs. without ground truth
4. **Figure: Cost vs. Quality** — Scatter plot of cost per table vs. description quality across LLMs
5. **Table: Cross-LLM Comparison** — Same database, different models, quality + cost
6. **Figure: Backprop Diff Examples** — Before/after descriptions for selected tables (qualitative)
7. **Table: Ground Truth Propagation** — % of non-GT tables improved when 10% have GT anchors

---

## PK Detection: Position-Based Scoring and Composite Key Detection

### Problem Statement (Run 013 Analysis)
PK detection has 48 false positives at confidence 100, indistinguishable from the 68 correct PKs.
Root cause: any column with 100% uniqueness, 0 nulls, and an ID-like name gets confidence 100,
regardless of its position in the table schema.

**Key finding**: 100% of correct PKs (68/68) start at column position 0. 
All 4 false positive PKs at position 1+ are columns that should be part of composites
(e.g., `SalesOrderDetailID` at position 1 — real PK is `(SalesOrderID, SalesOrderDetailID)` at positions 0,1).

### Heuristic H9: Position-Based PK Confidence Multiplier

**Rule**: Apply a confidence multiplier based on the column's ordinal position in the table:
- Position 0: 1.0x (full confidence)
- Position 1: 0.85x
- Position 2: 0.70x
- Position 3: 0.55x
- Position 4+: 0.40x

**Rationale**: PKs are almost universally placed first in table DDL. A column at position 5
with 100% uniqueness is far more likely an FK to another table than a PK.

**Impact (projected)**: Reduces 4 false positives (pos 1) from confidence 100 to 85,
putting them below the 90 lock threshold for pruning to evaluate.

### Heuristic H10: Consecutive Column Composite Key Detection

**Rule**: When 2+ consecutive columns starting at position 0 are each:
- 100% non-null
- Not date/bit/float types
- Have key-naming patterns (end in ID, Key, Code, etc.)
- Individually may or may not be 100% unique

Test whether their COMBINATION is 100% unique. If so, favor this combination as the
PK candidate over any individual column PK for the same table.

**Rationale**: Junction/bridge tables have composite PKs formed by consecutive FK columns.
`PersonCreditCard(BusinessEntityID, CreditCardID)` — each column is individually unique
(or near-unique), but the combination IS the PK. The individual columns are FKs, not PKs.

**Implementation**:
1. In `detectCompositeCandidates()`, find consecutive PK-eligible columns starting at pos 0
2. Query the database for combination uniqueness: `SELECT COUNT(DISTINCT col1||col2) = COUNT(*)`
3. If the combination is unique, create a composite PK candidate with high confidence
4. Reduce confidence of individual column PKs that are part of a detected composite

### Heuristic H11: Progressive Discount for Later PK-Eligible Columns

**Rule**: When multiple PK-eligible columns exist in a table, apply increasing discounts:
- 1st PK-eligible column (by position): 1.0x
- 2nd: 0.85x
- 3rd: 0.70x
- 4th+: 0.55x

**Rationale**: Tables commonly have 3-4 columns with 100% uniqueness (FK columns to parent
tables with many rows). Only 1-2 form the actual PK — typically the earliest positionally.

### Heuristic H12: Composite Supersedes Individual

**Rule**: When a composite PK candidate is detected for a table, reduce individual column
PK confidence by 0.5x for columns that are part of the composite. The composite inherits
the higher score.

**Rationale**: If `(PurchaseOrderID, PurchaseOrderDetailID)` is a composite PK, then
`PurchaseOrderDetailID` alone should not also be a PK candidate at high confidence.

### Expected Combined Impact
- H9 alone: 4 false positives drop below 90 threshold
- H10+H12: Correctly identifies composite PKs, demotes their individual columns
- H11: Additional discount for 3rd/4th unique columns in multi-FK tables
- Net: PK precision should improve significantly with minimal recall impact

### Performance Optimization Opportunities

The following parallelization opportunities exist but should be configurable
due to API TPM/RPM limits:

1. **Per-table LLM calls**: Tables at the same dependency level are independent
   and can be analyzed in parallel (configurable concurrency limit)
2. **Cross-schema discovery**: FK detection across schemas can run in parallel
3. **Pruning pass**: Per-table pruning proposals are independent
4. **Configuration**: `analysis.parallelism.maxConcurrentTables` (default: 1)
   and `analysis.parallelism.maxConcurrentPrompts` (default: 1)

