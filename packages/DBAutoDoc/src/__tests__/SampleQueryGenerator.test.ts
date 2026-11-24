import { describe, it, expect } from 'vitest';
import { SampleQueryGenerator } from '../generators/SampleQueryGenerator.js';

describe('SampleQueryGenerator', () => {
  describe('FormatDatabaseType', () => {
    it('maps each supported provider to its human-readable dialect name', () => {
      expect(SampleQueryGenerator.FormatDatabaseType('sqlserver')).toBe('SQL Server');
      expect(SampleQueryGenerator.FormatDatabaseType('postgresql')).toBe('PostgreSQL');
      expect(SampleQueryGenerator.FormatDatabaseType('mysql')).toBe('MySQL');
      expect(SampleQueryGenerator.FormatDatabaseType('oracle')).toBe('Oracle');
    });
  });

  describe('PrepareValidationQuery', () => {
    it('injects LIMIT 10 on PostgreSQL and MySQL instead of TOP 10', () => {
      const pgSql = SampleQueryGenerator.PrepareValidationQuery(
        'SELECT id, name FROM public.users WHERE status = @status;',
        'postgresql'
      );
      expect(pgSql).not.toMatch(/\bTOP 10\b/i);
      expect(pgSql).toBe("SELECT id, name FROM public.users WHERE status = 'Active' LIMIT 10;");

      const mysqlSql = SampleQueryGenerator.PrepareValidationQuery(
        'SELECT id FROM users',
        'mysql'
      );
      expect(mysqlSql).not.toMatch(/\bTOP 10\b/i);
      expect(mysqlSql).toBe('SELECT id FROM users LIMIT 10');
    });

    it('puts LIMIT 10 on a new line when a query ends with a SQL line comment, without breaking strings containing --', () => {
      const commented = SampleQueryGenerator.PrepareValidationQuery(
        'SELECT id FROM users -- fetch active rows',
        'postgresql'
      );
      expect(commented).toBe('SELECT id FROM users -- fetch active rows\nLIMIT 10');

      const stringWithDashes = SampleQueryGenerator.PrepareValidationQuery(
        "SELECT id FROM users WHERE code = '--not-a-comment'",
        'postgresql'
      );
      expect(stringWithDashes).toBe("SELECT id FROM users WHERE code = '--not-a-comment' LIMIT 10");
    });

    it('injects TOP 10 on SQL Server after SELECT DISTINCT and into the outer SELECT of CTEs', () => {
      const distinctSql = SampleQueryGenerator.PrepareValidationQuery(
        'SELECT DISTINCT CustomerID FROM dbo.Orders',
        'sqlserver'
      );
      expect(distinctSql).toBe('SELECT DISTINCT TOP 10 CustomerID FROM dbo.Orders');

      const cteSql = SampleQueryGenerator.PrepareValidationQuery(
        'WITH recent AS (SELECT OrderID FROM dbo.Orders WHERE CustomerID = @customerId) SELECT OrderID FROM recent',
        'sqlserver'
      );
      expect(cteSql).toBe(
        'WITH recent AS (SELECT OrderID FROM dbo.Orders WHERE CustomerID = 1) SELECT TOP 10 OrderID FROM recent'
      );
    });

    it('preserves existing top-level TOP, TOP (n), LIMIT, FETCH FIRST/NEXT, and ROWNUM clauses', () => {
      expect(
        SampleQueryGenerator.PrepareValidationQuery('SELECT TOP (5) CustomerID FROM dbo.Orders', 'sqlserver')
      ).toBe('SELECT TOP (5) CustomerID FROM dbo.Orders');

      expect(
        SampleQueryGenerator.PrepareValidationQuery('SELECT id FROM users LIMIT 5', 'postgresql')
      ).toBe('SELECT id FROM users LIMIT 5');

      expect(
        SampleQueryGenerator.PrepareValidationQuery(
          'SELECT id FROM dbo.Orders ORDER BY id OFFSET 0 ROWS FETCH NEXT 5 ROWS ONLY',
          'sqlserver'
        )
      ).toBe('SELECT id FROM dbo.Orders ORDER BY id OFFSET 0 ROWS FETCH NEXT 5 ROWS ONLY');

      expect(
        SampleQueryGenerator.PrepareValidationQuery('SELECT id FROM users WHERE ROWNUM <= 5', 'oracle')
      ).toBe('SELECT id FROM users WHERE ROWNUM <= 5');
    });

    it('still applies an outer row limit when only a subquery contains TOP or LIMIT', () => {
      const sqlServerSubquery = SampleQueryGenerator.PrepareValidationQuery(
        'SELECT o.OrderID FROM dbo.Orders o WHERE o.CustomerID IN (SELECT TOP 1 c.ID FROM dbo.Customers c)',
        'sqlserver'
      );
      expect(sqlServerSubquery).toBe(
        'SELECT TOP 10 o.OrderID FROM dbo.Orders o WHERE o.CustomerID IN (SELECT TOP 1 c.ID FROM dbo.Customers c)'
      );

      const pgSubquery = SampleQueryGenerator.PrepareValidationQuery(
        'SELECT o.id FROM orders o WHERE o.customer_id IN (SELECT c.id FROM customers c LIMIT 1)',
        'postgresql'
      );
      expect(pgSubquery).toBe(
        'SELECT o.id FROM orders o WHERE o.customer_id IN (SELECT c.id FROM customers c LIMIT 1) LIMIT 10'
      );
    });

    it('emits FETCH FIRST 10 ROWS ONLY for Oracle instead of SQL Server TOP 10', () => {
      const oracleSql = SampleQueryGenerator.PrepareValidationQuery(
        'SELECT id FROM hr.employees WHERE start_date >= @startDate',
        'oracle'
      );
      expect(oracleSql).not.toMatch(/\bTOP 10\b/i);
      expect(oracleSql).toBe("SELECT id FROM hr.employees WHERE start_date >= '2024-01-01' FETCH FIRST 10 ROWS ONLY");
    });
  });
});
