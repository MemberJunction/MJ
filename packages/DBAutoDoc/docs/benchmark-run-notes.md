# DBAutoDoc Benchmark Run Notes

## Database Queue
| Database | Type | Tables | Columns | Ground Truth | Status |
|----------|------|--------|---------|-------------|--------|
| AdventureWorks2022 | Public benchmark | 71 | 486 | 71 PKs, 91 FKs | ✅ Complete — Run 015: A+ (96.7%) |
| MSTA (OrgA) | Real-world client | 36 | 1807 | No GT (undocumented) | 🟡 Running — MSTA-001 |
| AutoCare (OrgB) | Real-world client | 125 | 2347 | 290 PKs, 561 FKs | ✅ Stripped in Docker, queued |
| Northwind | Public benchmark | 13 | ~50 | 12 PKs, 11 FKs | ✅ Stripped in Docker, queued |
| Chinook | Public benchmark | 11 | ~60 | 10 PKs, 10 FKs | ✅ Stripped in Docker, queued |
| Pagila | Public (PostgreSQL) | 15 | — | — | ⏳ Not yet set up |

## Run Log

### MSTA-001 (OrgA) — March 21, 2026
- Config: 2 iterations, Gemini Flash, sanity checks off
- Database: 36 tables, 1807 columns, 4 schemas (betty, dese, nams, propfuel)
- Seed context: Education / Professional Association / Missouri State Teachers Assoc
- No ground truth available — qualitative evaluation only
- Discovery: 1 PK, 9 FKs (very sparse — expected for undocumented real-world DB)
- Status: Iteration 1 in progress

### AutoCare (OrgB) — queued
- 125 tables, 2347 columns, 10 schemas
- Ground truth: 290 PKs, 561 FKs (extracted before stripping)
- Will be the largest benchmark test

### Northwind — queued
- Classic Microsoft sample DB, 13 tables
- Ground truth: 12 PKs, 11 FKs
- Small DB, should run fast

### Chinook — queued  
- Music store DB, 11 tables
- Ground truth: 10 PKs, 10 FKs
- Small DB, should run fast
