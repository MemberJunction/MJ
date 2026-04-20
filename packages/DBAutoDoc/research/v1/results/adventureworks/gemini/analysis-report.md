# Database Documentation Analysis Report

**Database**: AW_Stripped
**Server**: sql-claude
**Generated**: 2026-03-21T18:13:19.673Z

## Overall Statistics

- **Schemas**: 6
- **Tables**: 71
- **Columns**: 486
- **Total Iterations**: 2
- **Analysis Runs**: 1

## Latest Analysis Run

- **Run ID**: run_1774109782105_h6j92vwsn
- **Status**: converged
- **Started**: 2026-03-21T16:16:22.105Z
- **Completed**: 2026-03-21T17:42:46.668Z
- **Model**: gemini-3-flash-preview
- **Iterations**: 2
- **Levels Processed**: 3
- **Backpropagations**: 6
- **Total Tokens**: 3,157,458 (input: 2,993,829, output: 163,629)
- **Estimated Cost**: $0.00

**Convergence**: Reached maximum iteration limit (2)

### Errors

- Failed to analyze Production.ProductPhoto: {"error":{"code":400,"message":"The input token count exceeds the maximum number of tokens allowed 1048576.","status":"INVALID_ARGUMENT"}}
- Failed to analyze Production.ProductPhoto: {"error":{"code":400,"message":"The input token count exceeds the maximum number of tokens allowed 1048576.","status":"INVALID_ARGUMENT"}}

## Confidence Distribution

- **Average Confidence**: 99.5%
- **High (>= 0.9)**: 70 tables
- **Medium (0.7 - 0.9)**: 0 tables
- **Low (< 0.7)**: 0 tables

### Low Confidence Tables

| Schema | Table | Confidence | Description |
|--------|-------|------------|-------------|
| Production | ProductPhoto | 0% | ... |

### Unprocessed Tables

| Schema | Table |
|--------|-------|
| Production | ProductPhoto |
