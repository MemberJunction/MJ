# Task: Documentation & Missing Tests for SQL Converter Packages

## YOUR MISSION
Write comprehensive documentation and missing unit tests for the `@memberjunction/sql-converter` and `@memberjunction/sqlglot-ts` packages. These packages implement a production-grade SQL Server → PostgreSQL conversion pipeline. The code is DONE and working (0 errors across baseline + 6 incremental migrations, 465/465 tests passing). Your job is purely documentation and tests — DO NOT modify any existing source code.

## CRITICAL RULES
1. **Work on branch `postgres-5-0-implementation`** — do NOT create a new branch
2. **DO NOT modify any existing `.ts` source files** — only create/edit README.md files and test files
3. **Commit after EACH major deliverable** with descriptive messages, then `git push origin postgres-5-0-implementation`
4. **Run `npm run test` after adding tests** — all tests must pass (existing 465 + new ones)
5. **Use Mermaid diagrams** for all flow charts and architecture diagrams

## DELIVERABLE 1: SQLConverter README.md (packages/SQLConverter/README.md)

Write a comprehensive README covering:

### 1.1 Package Overview
- What the package does (SQL dialect conversion pipeline)
- Architecture overview with Mermaid diagram showing the full pipeline:
  - Input → SQLFileSplitter → SubSplitter → StatementClassifier → Rules (PreProcess/PostProcess) → PostProcessor → Output
- Supported dialect pairs (currently: TSQL→PostgreSQL, extensible)

### 1.2 Quick Start
- Installation
- Basic usage example (convert a single SQL file)
- CLI usage via `mj sql-convert`
- Programmatic usage via `convertFile()` API

### 1.3 Architecture Deep Dive
- **Pipeline Flow** — Mermaid sequence diagram showing the exact steps
- **Rule System** — How IConversionRule works, PreProcess vs PostProcess, BypassSqlglot
- **ConversionContext** — What state is tracked (TableColumns, CreatedViews, HandWrittenFunctions)
- **Statement Classification** — How batches are classified into types
- **Output Grouping** — How converted statements are reordered (Tables → FKs → Views → Functions → Triggers → Data → Grants → Comments)

### 1.4 Rule-by-Rule Documentation
For EACH of the 12+ rules, document:
- **Purpose**: What SQL patterns it converts
- **Input/Output examples**: Before → After
- **Key edge cases**: What tricky patterns it handles
- **Priority**: When it runs relative to other rules

Rules to document:
1. CreateTableRule (Priority 10)
2. ViewRule (Priority 20)
3. ProcedureToFunctionRule (Priority 30)
4. FunctionRule (Priority 35)
5. TriggerRule (Priority 40)
6. InsertRule (Priority 50)
7. ConditionalDDLRule (Priority 55)
8. AlterTableRule (Priority 60)
9. CreateIndexRule (Priority 70)
10. GrantRule (Priority 80)
11. ExtendedPropertyRule (Priority 90)

### 1.5 Utility Components
- **StatementClassifier** — Statement types and classification logic
- **SubSplitter** — How compound batches are split
- **PostProcessor** — Global post-processing transformations
- **ExpressionHelpers** — Shared expression converters (DATEADD, CHARINDEX, STUFF, etc.)
- **BatchConverter** — The orchestrator

### 1.6 Type Mapping Reference
A complete table of SQL Server → PostgreSQL type mappings:
| SQL Server | PostgreSQL | Notes |
|-----------|-----------|-------|
| UNIQUEIDENTIFIER | UUID | |
| BIT | BOOLEAN | |
| NVARCHAR(n) | VARCHAR(n) | |
| NVARCHAR(MAX) | TEXT | |
| DATETIME | TIMESTAMP | |
| ... | ... | ... |

### 1.7 Extending the Pipeline
- How to add a new rule
- How to add a new dialect pair (e.g., MySQL → PostgreSQL)
- How to add new type mappings
- How to handle new SQL patterns

### 1.8 Testing
- How to run tests
- Test file organization
- How to add new test cases

### 1.9 Verification & Cross-Database Audit
- How to verify converted SQL against a real PostgreSQL database
- IDatabaseVerifier and IDatabaseAuditor interfaces
- The `mj sql-audit` command

### 1.10 Flow Diagrams (Mermaid)
Include at MINIMUM these Mermaid diagrams:
1. **High-level pipeline** — file input → output
2. **Per-statement conversion** — classify → match rules → preprocess → (sqlglot?) → postprocess
3. **Rule priority chain** — which rules run in what order
4. **Output grouping** — how statements are reordered
5. **State flow** — how ConversionContext accumulates info across statements

## DELIVERABLE 2: Rules Subfolder README (packages/SQLConverter/src/rules/README.md)

A focused developer guide for the rules system:
- Quick reference table of all rules
- How to create a new rule (step by step)
- The IConversionRule interface explained
- ConversionContext fields explained
- Testing conventions for rules

## DELIVERABLE 3: Missing Unit Tests

Write tests for the 5 untested rule files:

### 3.1 ConditionalDDLRule.test.ts (target: 20+ tests)
- IF NOT EXISTS INSERT → DO $$ block
- IF NOT EXISTS CREATE TABLE → CREATE TABLE IF NOT EXISTS
- IF OBJECT_ID ... DROP → DROP IF EXISTS
- Nested IF blocks
- Column quoting in DO blocks
- Entity relationship inserts
- Edge cases: multi-line IF blocks, comments before IF

### 3.2 CreateIndexRule.test.ts (target: 15+ tests)
- Basic index creation
- UNIQUE index
- CLUSTERED index (PG doesn't support — should comment or skip)
- INCLUDE columns (PG covering index syntax)
- Filtered/partial indexes (WHERE clause)
- Long index name truncation (>63 chars)
- IF NOT EXISTS for indexes
- Multiple column indexes

### 3.3 FunctionRule.test.ts (target: 20+ tests)
- Scalar function → PG function
- Inline table-valued function → PG function RETURNS TABLE
- Multi-statement table-valued function
- Function with default parameters
- Function with complex body (variables, IF/ELSE, WHILE)
- DROP FUNCTION IF EXISTS
- Schema-qualified function names

### 3.4 GrantRule.test.ts (target: 15+ tests)
- GRANT SELECT on table
- GRANT EXECUTE on procedure → GRANT EXECUTE ON FUNCTION
- GRANT to role with schema translation
- Multiple permissions in one GRANT
- REVOKE statements
- Grants on views
- Grants on functions with overloaded names

### 3.5 TSQLToPostgresRules.test.ts (target: 10+ tests)
- getTSQLToPostgresRules() returns all expected rules
- Rules are sorted by priority
- Each rule has a unique name
- All expected rule types are present
- Rules implement required interface methods

**Target: 80+ new test cases, all passing along with existing 465.**

## DELIVERABLE 4: Commit and Push

After each deliverable:
1. `git add` the new/modified files
2. `git commit` with descriptive message
3. `git push origin postgres-5-0-implementation`

Suggested commits:
1. "docs(sql-converter): add comprehensive README with architecture diagrams and rule documentation"
2. "docs(sql-converter): add rules developer guide README"
3. "test(sql-converter): add 80+ unit tests for ConditionalDDLRule, CreateIndexRule, FunctionRule, GrantRule, TSQLToPostgresRules"

## IMPORTANT NOTES
- Read ALL existing source files thoroughly before writing documentation — accuracy is critical
- Read ALL existing test files to understand testing patterns and conventions
- Use the same testing utilities and patterns as existing tests (vitest, describe/it/expect)
- Include REAL examples from the actual SQL Server baseline migration where possible
- The PostProcessor has ~30 regex transformations — document each one
- The ExpressionHelpers has converters for DATEADD, DATEDIFF, CHARINDEX, STUFF, etc. — document each one
- Cross-reference with the Python script at `scripts/pg_convert_v5_baseline.py` for any patterns that were ported

## DO NOT STOP UNTIL ALL 4 DELIVERABLES ARE COMPLETE.
