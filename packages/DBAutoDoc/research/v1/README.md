# DBAutoDoc Research Paper — v1

## Paper
- **[paper.md](paper.md)** — Full research paper: "DBAutoDoc: Automated Discovery and Documentation of Undocumented Database Schemas via Statistical Analysis and Iterative LLM Refinement"

## Results

### AdventureWorks2022 (Primary Benchmark)
71 tables, 486 columns, 91 FK relationships. All PKs/FKs/descriptions stripped for blind evaluation.

| Model Configuration | PK F1 | FK F1 | Weighted Score |
|---------------------|-------|-------|---------------|
| [Gemini 3 Flash / 3.1 Pro](results/adventureworks/gemini/) | 95.0% | 94.2% | 96.1% (A+) |
| [Claude Sonnet 4.6 / Opus 4.6](results/adventureworks/claude/) | 95.0% | 93.0% | 96.1% (A+) |
| [GPT-5.4-mini / GPT-5.4](results/adventureworks/openai/) | 89.4% | 77.9% | 87.9% (B+) |

### Additional Public Benchmarks

| Database | Tables | PK F1 | FK F1 | Weighted | Results |
|----------|--------|-------|-------|----------|---------|
| [Chinook](results/chinook/) | 11 | 95.2% | 95.2% | 96.9% (A+) | Music store |
| [LousyDB](results/lousydb/) | 20 | 97.6% | 77.2% | 91.3% (A) | Dark database (cryptic names) |
| [Northwind](results/northwind/) | 13 | 72.7% | 75.0% | 83.1% (B) | Classic order management |

### Enterprise Case Studies (anonymized, results not included)
- **OrgA**: 36-table education association platform. 100% PK coverage, 201 FKs.
- **OrgB**: 125-table automotive trade association. 97% PK coverage, 490 FKs across 10 schemas.

## Scoring Methodology
Weighted average: FK F1 (35%) + PK F1 (30%) + Table Descriptions (20%) + Column Descriptions (15%)

## Each Results Folder Contains
- `summary.md` — Full Markdown documentation
- `documentation.html` — Interactive HTML documentation
- `erd.mmd` + `erd.html` — Mermaid ERD diagrams
- `extended-props.sql` — SQL Server extended properties script
- `tables.csv` + `columns.csv` — Tabular exports
- `additionalSchemaInfo.json` — CodeGen integration
- `analysis-report.md` — Run summary

## Reproducing Results
```bash
# 1. Install DBAutoDoc
npm install @memberjunction/db-auto-doc

# 2. Create a config file (see package README)
# 3. Run analysis
db-auto-doc analyze --config ./config.json

# 4. Compare against ground truth
python3 scripts/compare.py ./output/run-1/state.json
```

## License
MIT License — same as MemberJunction
