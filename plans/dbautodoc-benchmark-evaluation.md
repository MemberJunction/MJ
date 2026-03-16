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
| **AutoCare** (enterprise) | SQL Server | 125 | 10 | High | Real-world AMS, anonymized, already running |

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
