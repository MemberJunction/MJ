# DBAutoDoc Test Run

This directory contains configuration for testing DBAutoDoc against the AssociationDB database.

## Setup

1. **Create `.env` file** (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env`** with your actual credentials:
   - Database connection details
   - AI provider API key

3. **Verify configuration**:
   ```bash
   cat config.json
   ```
   The `config.json` uses `${VAR_NAME}` syntax to reference environment variables from `.env`.

## Running Tests

From the test-run directory:

```bash
# Run analysis
node ../../bin/run.js analyze --config=./config.json

# Check status
node ../../bin/run.js status --config=./config.json

# Export results
node ../../bin/run.js export --config=./config.json
```

## Configuration Notes

- **maxIterations**: Set to 5 for testing (lower to save tokens)
- **guardrails**: Token limit of 100K, 10 min duration limit
- **backpropagation**: Enabled to test parent table insights
- **schemas**: Only analyzing `dbo` schema
- **sanityChecks**: Disabled for faster testing

## Output Files

- `db-doc-state.json` - Analysis state and results
- `output/add-descriptions.sql` - SQL script to apply descriptions
- `output/database-documentation.md` - Human-readable documentation
