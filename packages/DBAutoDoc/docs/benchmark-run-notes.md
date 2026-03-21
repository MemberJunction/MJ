# DBAutoDoc Benchmark Run Notes

## Database Queue
| Database | Type | Tables | Columns | Ground Truth | Status |
|----------|------|--------|---------|-------------|--------|
| AdventureWorks2022 | Public benchmark | 71 | 486 | 71 PKs, 91 FKs (from DDL) | ✅ Complete — Gemini A+, Claude A+, OpenAI A |
| MSTA (OrgA) | Real-world client | 36 | 1807 | None (qualitative only) | ✅ Complete — 35 PKs, 193 FKs |
| AutoCare (OrgB) | Real-world client | 125 | 2347 | None (qualitative only) | 🟡 Running |
| LousyDB | Purpose-built dark DB | 20 | 162 | From SQL comments | ⏳ Queued |
| Northwind | Public benchmark | 13 | ~50 | 12 PKs, 11 FKs (from DDL) | ✅ Stripped, queued |
| Chinook | Public benchmark | 11 | ~60 | 10 PKs, 10 FKs (from DDL) | ✅ Stripped, queued |

## Ground Truth Notes
- **Public benchmarks** (AW, Northwind, Chinook): Ground truth from original DDL constraint declarations. Stripped version has all PKs/FKs/descriptions removed.
- **LousyDB**: Ground truth from SQL comments in create script (purpose-built with no constraints).
- **Client databases** (OrgA/MSTA, OrgB/AutoCare): NO ground truth. Any constraints found in the database were from prior AutoDoc runs, not human-verified. Evaluation is qualitative only — PK/FK coverage, description quality, domain understanding.

## Model Comparison (AdventureWorks2022)
| Model Config | PK F1 | FK F1 | Overall (weighted) | Tokens |
|-------------|-------|-------|-------------------|--------|
| Gemini Flash / Pro | 95.0% | 94.2% | 96.1% (A+) | 3.2M |
| Sonnet 4.6 / Opus 4.6 | 95.0% | 93.0% | 96.1% (A+) | 471K |
| GPT-5.4-mini / 5.4 | 89.4% | 77.9% | 87.9% (B+) | 952K |

Weighted scoring: FK F1 (35%) + PK F1 (30%) + Table Desc (20%) + Column Desc (15%)
