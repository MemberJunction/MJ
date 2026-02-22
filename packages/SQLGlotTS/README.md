# @memberjunction/sqlglot-ts

A TypeScript wrapper for Python's [sqlglot](https://github.com/tobymao/sqlglot) SQL transpiler. Provides deterministic, verifiable SQL dialect conversion via a managed local Python FastAPI microservice.

## Features

- **31 SQL dialects** supported (T-SQL, PostgreSQL, MySQL, Snowflake, BigQuery, etc.)
- **Deterministic conversion** — no LLM randomness, reproducible results
- **Zero MemberJunction dependencies** — standalone community package
- **Ephemeral port binding** — microservice runs on `127.0.0.1` with auto-assigned port
- **Managed lifecycle** — automatic startup/shutdown of the Python process
- **Statement-by-statement mode** — individual statement tracking, one failure doesn't block others

## Prerequisites

- **Python 3.9+** with `sqlglot`, `fastapi`, and `uvicorn` installed:

```bash
pip install sqlglot fastapi uvicorn
```

## Usage

```typescript
import { SqlGlotClient } from '@memberjunction/sqlglot-ts';

const client = new SqlGlotClient();
await client.start();

// Transpile T-SQL to PostgreSQL
const result = await client.transpile(
  "SELECT ISNULL(col, 0) FROM [dbo].[MyTable]",
  { fromDialect: 'tsql', toDialect: 'postgres' }
);
console.log(result.sql);
// Output: SELECT COALESCE(col, 0) FROM "dbo"."MyTable";

// Statement-by-statement mode
const stmtResult = await client.transpileStatements(
  "SELECT TOP 10 * FROM Users; SELECT GETDATE();",
  { fromDialect: 'tsql', toDialect: 'postgres' }
);
console.log(stmtResult.statements);

// Parse SQL to AST
const ast = await client.parse(
  "SELECT 1",
  { dialect: 'postgres' }
);

// List supported dialects
const dialects = await client.getDialects();

// Health check
const health = await client.health();

await client.stop();
```

## API

### `SqlGlotClient`

#### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pythonPath` | `string` | `'python3'` | Path to Python executable |
| `serverPath` | `string` | auto-detected | Path to `server.py` |
| `startupTimeoutMs` | `number` | `30000` | Max ms to wait for server startup |
| `requestTimeoutMs` | `number` | `60000` | Max ms per HTTP request |

#### Methods

- `start()` — Start the Python microservice
- `stop()` — Stop the Python microservice
- `transpile(sql, options)` — Transpile SQL between dialects (batch)
- `transpileStatements(sql, options)` — Transpile statement-by-statement
- `parse(sql, options)` — Parse SQL to AST (JSON)
- `getDialects()` — List all supported dialects
- `health()` — Server health check

## Attribution

This package wraps the excellent [sqlglot](https://github.com/tobymao/sqlglot) Python library by Toby Mao and contributors. sqlglot provides a comprehensive SQL parser, transpiler, and optimizer supporting 31 SQL dialects with 8,900+ stars and 7,000+ commits.

## License

ISC
