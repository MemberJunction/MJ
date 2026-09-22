/**
 * The SQL safety allowlist must not be a T-SQL grammar.
 *
 * `ALLOWED_SQL_FUNCTIONS` carried only SQL Server's read-only vocabulary, so an
 * ordinary PostgreSQL expression — `DATE_TRUNC('month', CreatedAt)`,
 * `ARRAY_AGG(Name)`, `NOW()` — was rejected with "Function 'X' is not allowed"
 * on every PostgreSQL tenant, before the query ever reached a database that
 * would have run it happily.
 *
 * The list is now the UNION of the supported dialects' read-only vocabulary.
 * That is deliberate and is the security-relevant claim these tests defend: a
 * deny-by-default safety screen widened by a set of read-only names is still
 * deny-by-default. The two properties pinned below are therefore inseparable —
 *
 *   1. the PostgreSQL names pass, and
 *   2. injection shapes (semicolons, comments, DDL/DML keywords, and any
 *      function NOT on the union) are rejected exactly as before.
 *
 * A PostgreSQL name that reaches a SQL Server tenant is rejected by the SQL
 * Server parser on its own, which is why the union does not need a dialect
 * switch to be safe.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SQLExpressionValidator, ALLOWED_SQL_FUNCTIONS, SQLValidationContext } from '../SQLExpressionValidator';

describe('SQLExpressionValidator PostgreSQL vocabulary', () => {
  let validator: SQLExpressionValidator;

  beforeEach(() => {
    validator = SQLExpressionValidator.Instance;
  });

  const where = { context: 'where_clause' as SQLValidationContext };
  const orderBy = { context: 'order_by' as SQLValidationContext };

  // ───────────────────────────────────────────────────────────────────
  // 1. The PostgreSQL names pass
  // ───────────────────────────────────────────────────────────────────

  it('accepts a PostgreSQL filter using ILIKE and DATE_TRUNC', () => {
    const r = validator.validate("Name ILIKE '%acme%' AND DATE_TRUNC('month', CreatedAt) = DATE_TRUNC('month', NOW())", where);
    expect(r.error).toBeUndefined();
    expect(r.valid).toBe(true);
  });

  it('accepts DATE_TRUNC on its own', () => {
    const r = validator.validate("DATE_TRUNC('month', CreatedAt)", where);
    expect(r.valid).toBe(true);
  });

  it('accepts the PostgreSQL date/time functions that replace GETDATE and DATEPART', () => {
    for (const expr of [
      'NOW()',
      'DATE_PART(\'year\', CreatedAt)',
      'EXTRACT(YEAR FROM CreatedAt)',
      'AGE(UpdatedAt, CreatedAt)',
      'TO_TIMESTAMP(Epoch)',
    ]) {
      const r = validator.validate(expr, where);
      expect(r.error, `${expr} should be accepted`).toBeUndefined();
      expect(r.valid, `${expr} should be accepted`).toBe(true);
    }
  });

  it('accepts the PostgreSQL string functions that replace CHARINDEX and friends', () => {
    for (const expr of [
      "STRPOS(Name, 'x')",
      "SPLIT_PART(Email, '@', 2)",
      'INITCAP(Name)',
      "LPAD(Code, 5, '0')",
      "REGEXP_REPLACE(Name, '[0-9]', '')",
    ]) {
      const r = validator.validate(expr, where);
      expect(r.error, `${expr} should be accepted`).toBeUndefined();
      expect(r.valid, `${expr} should be accepted`).toBe(true);
    }
  });

  it('accepts the PostgreSQL math functions that replace CEILING and RAND', () => {
    for (const expr of ['CEIL(Amount)', 'RANDOM()', 'TRUNC(Amount, 2)', 'MOD(Qty, 3)', 'GREATEST(A, B)', 'LEAST(A, B)']) {
      const r = validator.validate(expr, where);
      expect(r.error, `${expr} should be accepted`).toBeUndefined();
      expect(r.valid, `${expr} should be accepted`).toBe(true);
    }
  });

  it('accepts TO_CHAR / TO_DATE / TO_NUMBER in place of CAST and FORMAT', () => {
    for (const expr of ["TO_CHAR(CreatedAt, 'YYYY-MM')", "TO_DATE(Stamp, 'YYYY-MM-DD')", 'TO_NUMBER(Amount)']) {
      const r = validator.validate(expr, where);
      expect(r.error, `${expr} should be accepted`).toBeUndefined();
      expect(r.valid, `${expr} should be accepted`).toBe(true);
    }
  });

  it('counts ARRAY_AGG as an aggregate, so an aggregate-context expression is satisfied by it', () => {
    // Two distinct gates had to agree: the function allowlist, and
    // `checkContextRules`, which requires that an aggregate context actually
    // contain an aggregate — a check driven by ALLOWED_SQL_FUNCTIONS.aggregates.
    const r = validator.validate('ARRAY_AGG(Name)', { context: 'aggregate' as SQLValidationContext });
    expect(r.error).toBeUndefined();
    expect(r.valid).toBe(true);
  });

  it('accepts the other PostgreSQL aggregates', () => {
    for (const expr of ['JSONB_AGG(Name)', 'JSON_AGG(Name)', 'BOOL_AND(IsActive)', 'BOOL_OR(IsActive)']) {
      const r = validator.validate(expr, { context: 'aggregate' as SQLValidationContext });
      expect(r.error, `${expr} should be accepted`).toBeUndefined();
      expect(r.valid, `${expr} should be accepted`).toBe(true);
    }
  });

  it('accepts an aggregate FILTER clause in ORDER BY / aggregate context', () => {
    const r = validator.validate('COUNT(ID) FILTER (WHERE IsActive)', { context: 'aggregate' as SQLValidationContext });
    expect(r.error).toBeUndefined();
    expect(r.valid).toBe(true);
  });

  it('accepts NULLS FIRST / NULLS LAST ordering', () => {
    const r = validator.validate('CreatedAt DESC NULLS LAST', orderBy);
    expect(r.error).toBeUndefined();
    expect(r.valid).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────
  // 2. The safety property has NOT regressed
  //    Each of these uses the SAME PostgreSQL expression that now passes,
  //    so a pass here would mean the widening, not the input, did it.
  // ───────────────────────────────────────────────────────────────────

  const PG_EXPR = "Name ILIKE '%acme%' AND DATE_TRUNC('month', CreatedAt) = DATE_TRUNC('month', NOW())";

  it('still rejects the same PostgreSQL expression when it carries a semicolon', () => {
    const r = validator.validate(`${PG_EXPR};`, where);
    expect(r.valid).toBe(false);
    expect(r.trigger).toBe(';');
  });

  it('still rejects the same PostgreSQL expression when it carries a line comment', () => {
    const r = validator.validate(`${PG_EXPR} -- and now the payload`, where);
    expect(r.valid).toBe(false);
    expect(r.trigger).toBe('comment');
  });

  it('still rejects the same PostgreSQL expression when it carries a block comment', () => {
    const r = validator.validate(`${PG_EXPR} /* payload */`, where);
    expect(r.valid).toBe(false);
    expect(r.trigger).toBe('comment');
  });

  it('still rejects stacked DDL/DML dressed up in PostgreSQL syntax', () => {
    for (const expr of [
      `${PG_EXPR} ; DROP TABLE Users`,
      "DATE_TRUNC('month', CreatedAt) AND 1=1 ; DELETE FROM Users",
      'ILIKE ANY (SELECT Name FROM Users)',
    ]) {
      const r = validator.validate(expr, where);
      expect(r.valid, `${expr} must be rejected`).toBe(false);
    }
  });

  it('still rejects PostgreSQL functions that are NOT read-only — the union is not a blanket pass', () => {
    for (const fn of ['PG_SLEEP(5)', 'PG_READ_FILE(\'/etc/passwd\')', 'DBLINK(\'\', \'\')', 'LO_IMPORT(\'/etc/passwd\')', 'QUERY_TO_XML(\'\')']) {
      const r = validator.validate(fn, where);
      expect(r.valid, `${fn} must be rejected`).toBe(false);
      expect(r.error, `${fn} must be rejected as a function`).toMatch(/is not allowed/);
    }
  });

  it('still blocks the PostgreSQL system catalogs', () => {
    for (const expr of ['ID IN (SELECT oid FROM pg_catalog.pg_class)', 'Name = pg_authid.rolname']) {
      const r = validator.validate(expr, where);
      expect(r.valid, `${expr} must be rejected`).toBe(false);
    }
  });

  // ───────────────────────────────────────────────────────────────────
  // 3. The list itself — so a bucket cannot be quietly trimmed back
  // ───────────────────────────────────────────────────────────────────

  it('carries the PostgreSQL names in the buckets that own them', () => {
    const expected: Record<keyof typeof ALLOWED_SQL_FUNCTIONS, string[]> = {
      aggregates: ['ARRAY_AGG', 'JSONB_AGG', 'JSON_AGG', 'BOOL_AND', 'BOOL_OR', 'EVERY'],
      math: ['CEIL', 'RANDOM', 'TRUNC', 'MOD', 'DIV', 'GREATEST', 'LEAST', 'WIDTH_BUCKET'],
      string: ['POSITION', 'STRPOS', 'SPLIT_PART', 'INITCAP', 'LPAD', 'RPAD'],
      date: ['NOW', 'CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP', 'DATE_TRUNC', 'DATE_PART', 'EXTRACT', 'AGE'],
      conversion: ['TO_CHAR', 'TO_DATE', 'TO_NUMBER', 'TO_TIMESTAMP'],
      nullHandling: ['GREATEST', 'LEAST'],
      logical: ['ILIKE', 'SIMILAR', 'ANY', 'ALL', 'SOME', 'EXISTS'],
      ordering: ['NULLS', 'FIRST', 'LAST', 'FILTER'],
      conditional: [],
    };

    for (const [bucket, names] of Object.entries(expected) as [keyof typeof ALLOWED_SQL_FUNCTIONS, string[]][]) {
      const actual = ALLOWED_SQL_FUNCTIONS[bucket] as readonly string[];
      for (const name of names) {
        expect(actual, `${bucket} must carry ${name}`).toContain(name);
      }
    }
  });

  it('keeps the SQL Server names it already had — the union adds, it does not replace', () => {
    for (const expr of ['ISNULL(Name, \'\')', 'GETDATE()', "DATEADD(day, 1, CreatedAt)", 'CHARINDEX(\'x\', Name)', 'CEILING(Amount)']) {
      const r = validator.validate(expr, where);
      expect(r.error, `${expr} should still be accepted`).toBeUndefined();
      expect(r.valid, `${expr} should still be accepted`).toBe(true);
    }
  });
});
