# Database Documentation Analysis Report

**Database**: AW_Stripped
**Server**: sql-claude
**Generated**: 2026-03-22T13:08:36.929Z

## Overall Statistics

- **Schemas**: 6
- **Tables**: 71
- **Columns**: 486
- **Total Iterations**: 2
- **Analysis Runs**: 1

## Latest Analysis Run

- **Run ID**: run_1774131587862_yu9eyr8mx
- **Status**: converged
- **Started**: 2026-03-21T22:19:47.862Z
- **Completed**: 2026-03-21T22:34:31.923Z
- **Model**: gpt-5.4-mini-2026-03-17
- **Iterations**: 2
- **Levels Processed**: 3
- **Backpropagations**: 6
- **Total Tokens**: 951,512 (input: 778,180, output: 173,332)
- **Estimated Cost**: $0.00

**Convergence**: Reached maximum iteration limit (2)

### Errors

- Failed to analyze Production.Document: 400 Input tokens exceed the configured limit of 272000 tokens. Your messages resulted in 754361 tokens. Please reduce the length of the messages.
- Failed to analyze Production.ProductPhoto: 400 Input tokens exceed the configured limit of 272000 tokens. Your messages resulted in 839118 tokens. Please reduce the length of the messages.
- Failed to analyze Production.Document: 400 Input tokens exceed the configured limit of 272000 tokens. Your messages resulted in 754374 tokens. Please reduce the length of the messages.
- Failed to analyze Production.ProductPhoto: 400 Input tokens exceed the configured limit of 272000 tokens. Your messages resulted in 839132 tokens. Please reduce the length of the messages.

## Confidence Distribution

- **Average Confidence**: 98.7%
- **High (>= 0.9)**: 69 tables
- **Medium (0.7 - 0.9)**: 0 tables
- **Low (< 0.7)**: 0 tables

### Low Confidence Tables

| Schema | Table | Confidence | Description |
|--------|-------|------------|-------------|
| Production | Document | 0% | ... |
| Production | ProductPhoto | 0% | ... |

### Unprocessed Tables

| Schema | Table |
|--------|-------|
| Production | Document |
| Production | ProductPhoto |
