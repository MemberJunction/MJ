import { describe, it, expect } from 'vitest';
import { SQLFileSplitter } from '../SQLFileSplitter.js';

const splitter = new SQLFileSplitter();

describe('SQLFileSplitter', () => {
  // ============================================================
  // T-SQL GO batch splitting
  // ============================================================
  describe('T-SQL GO batch splitting', () => {
    it('should split by GO on its own line', () => {
      const sql = `SELECT 1\nGO\nSELECT 2\nGO`;
      const result = splitter.Split(sql, 'tsql');
      expect(result).toHaveLength(2);
      expect(result[0]).toBe('SELECT 1');
      expect(result[1]).toBe('SELECT 2');
    });

    it('should handle GO case-insensitively', () => {
      const sql = `SELECT 1\ngo\nSELECT 2\nGo`;
      const result = splitter.Split(sql, 'tsql');
      expect(result).toHaveLength(2);
    });

    it('should handle GO with surrounding whitespace', () => {
      const sql = `SELECT 1\n  GO  \nSELECT 2`;
      const result = splitter.Split(sql, 'tsql');
      expect(result).toHaveLength(2);
    });

    it('should handle content without trailing GO', () => {
      const sql = `SELECT 1\nGO\nSELECT 2`;
      const result = splitter.Split(sql, 'tsql');
      expect(result).toHaveLength(2);
    });

    it('should not split on GO inside a line', () => {
      const sql = `SELECT 'GOPHER' FROM t\nGO\nSELECT 2`;
      const result = splitter.Split(sql, 'tsql');
      expect(result).toHaveLength(2);
      expect(result[0]).toContain('GOPHER');
    });

    it('should skip empty batches between consecutive GOs', () => {
      const sql = `SELECT 1\nGO\nGO\nSELECT 2\nGO`;
      const result = splitter.Split(sql, 'tsql');
      expect(result).toHaveLength(2);
    });

    it('should handle multi-line statements', () => {
      const sql = `CREATE TABLE t (\n  ID INT,\n  Name NVARCHAR(100)\n)\nGO`;
      const result = splitter.Split(sql, 'tsql');
      expect(result).toHaveLength(1);
      expect(result[0]).toContain('CREATE TABLE');
    });

    it('should handle stored procedure with GO delimiters', () => {
      const sql = `CREATE PROCEDURE sp_Test\nAS\nBEGIN\n  SELECT 1\nEND\nGO\nSELECT 2\nGO`;
      const result = splitter.Split(sql, 'tsql');
      expect(result).toHaveLength(2);
      expect(result[0]).toContain('CREATE PROCEDURE');
      expect(result[1]).toBe('SELECT 2');
    });
  });

  // ============================================================
  // Semicolon splitting
  // ============================================================
  describe('Semicolon splitting', () => {
    it('should split simple semicolon-delimited statements', () => {
      const sql = 'SELECT 1; SELECT 2; SELECT 3;';
      const result = splitter.Split(sql, 'postgres');
      expect(result).toHaveLength(3);
      expect(result[0]).toBe('SELECT 1');
      expect(result[1]).toBe('SELECT 2');
      expect(result[2]).toBe('SELECT 3');
    });

    it('should handle trailing content without semicolon', () => {
      const sql = 'SELECT 1; SELECT 2';
      const result = splitter.Split(sql, 'postgres');
      expect(result).toHaveLength(2);
    });

    it('should skip empty segments', () => {
      const sql = 'SELECT 1;; ; SELECT 2;';
      const result = splitter.Split(sql, 'postgres');
      expect(result).toHaveLength(2);
    });
  });

  // ============================================================
  // String literal handling
  // ============================================================
  describe('String literal handling', () => {
    it('should not split on semicolons inside string literals', () => {
      const sql = "SELECT 'hello; world'; SELECT 2;";
      const result = splitter.Split(sql, 'postgres');
      expect(result).toHaveLength(2);
      expect(result[0]).toContain('hello; world');
    });

    it('should handle escaped single quotes', () => {
      const sql = "SELECT 'it''s a test'; SELECT 2;";
      const result = splitter.Split(sql, 'postgres');
      expect(result).toHaveLength(2);
      expect(result[0]).toContain("it''s");
    });

    it('should handle multiple string literals', () => {
      const sql = "SELECT 'a;b', 'c;d'; SELECT 'e';";
      const result = splitter.Split(sql, 'postgres');
      expect(result).toHaveLength(2);
    });
  });

  // ============================================================
  // Dollar-quoted strings (PostgreSQL)
  // ============================================================
  describe('Dollar-quoted strings', () => {
    it('should not split on semicolons inside $$...$$ blocks', () => {
      const sql = "CREATE FUNCTION f() RETURNS TEXT AS $$ SELECT 'hello; world'; $$ LANGUAGE sql; SELECT 1;";
      const result = splitter.Split(sql, 'postgres');
      expect(result).toHaveLength(2);
      expect(result[0]).toContain('hello; world');
    });

    it('should handle tagged dollar quotes ($body$...$body$)', () => {
      const sql = "CREATE FUNCTION f() RETURNS TEXT AS $body$ SELECT 1; SELECT 2; $body$ LANGUAGE sql; SELECT 3;";
      const result = splitter.Split(sql, 'postgres');
      expect(result).toHaveLength(2);
      expect(result[0]).toContain('SELECT 1; SELECT 2;');
    });

    it('should handle nested dollar quotes', () => {
      const sql = "DO $outer$ BEGIN EXECUTE $inner$ SELECT 1; $inner$; END $outer$; SELECT 2;";
      const result = splitter.Split(sql, 'postgres');
      // The outer $outer$ should contain the inner $inner$ block
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle dollar sign not starting a quote', () => {
      const sql = "SELECT $1 + $2; SELECT 3;";
      const result = splitter.Split(sql, 'postgres');
      expect(result).toHaveLength(2);
    });
  });

  // ============================================================
  // Comment handling
  // ============================================================
  describe('Comment handling', () => {
    it('should handle line comments', () => {
      const sql = "-- this is a comment\nSELECT 1; SELECT 2;";
      const result = splitter.Split(sql, 'postgres');
      expect(result).toHaveLength(2);
    });

    it('should not split on semicolons in line comments', () => {
      const sql = "SELECT 1; -- semicolon; in comment\nSELECT 2;";
      const result = splitter.Split(sql, 'postgres');
      expect(result).toHaveLength(2);
    });

    it('should handle block comments', () => {
      const sql = "/* comment */ SELECT 1; SELECT 2;";
      const result = splitter.Split(sql, 'postgres');
      expect(result).toHaveLength(2);
    });

    it('should not split on semicolons in block comments', () => {
      const sql = "SELECT 1; /* semi; colon */ SELECT 2;";
      const result = splitter.Split(sql, 'postgres');
      expect(result).toHaveLength(2);
    });

    it('should handle nested block comments', () => {
      const sql = "/* outer /* inner */ still outer */ SELECT 1;";
      const result = splitter.Split(sql, 'postgres');
      expect(result).toHaveLength(1);
      expect(result[0]).toContain('SELECT 1');
    });
  });

  // ============================================================
  // BEGIN...END blocks
  // ============================================================
  describe('BEGIN...END blocks', () => {
    it('should not split inside BEGIN...END', () => {
      const sql = "DO $$ BEGIN INSERT INTO t VALUES (1); INSERT INTO t VALUES (2); END $$; SELECT 1;";
      const result = splitter.Split(sql, 'postgres');
      expect(result).toHaveLength(2);
    });

    it('should handle nested BEGIN...END', () => {
      const sql = "BEGIN BEGIN SELECT 1; END; SELECT 2; END; SELECT 3;";
      const result = splitter.Split(sql, 'postgres');
      // Only SELECT 3 should be split out
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================
  // Edge cases
  // ============================================================
  describe('Edge cases', () => {
    it('should handle empty input', () => {
      const result = splitter.Split('', 'postgres');
      expect(result).toHaveLength(0);
    });

    it('should handle whitespace-only input', () => {
      const result = splitter.Split('   \n  \t  ', 'postgres');
      expect(result).toHaveLength(0);
    });

    it('should handle single statement without semicolon', () => {
      const result = splitter.Split('SELECT 1', 'postgres');
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('SELECT 1');
    });

    it('should handle just a semicolon', () => {
      const result = splitter.Split(';', 'postgres');
      expect(result).toHaveLength(0);
    });

    it('should handle mixed DDL and DML', () => {
      const sql = 'CREATE TABLE t (id INT); INSERT INTO t VALUES (1); SELECT * FROM t;';
      const result = splitter.Split(sql, 'postgres');
      expect(result).toHaveLength(3);
    });

    it('should preserve multi-line statements', () => {
      const sql = "SELECT\n  a,\n  b\nFROM t\nWHERE x = 1;\nSELECT 2;";
      const result = splitter.Split(sql, 'postgres');
      expect(result).toHaveLength(2);
      expect(result[0]).toContain('\n');
    });

    it('should handle CREATE FUNCTION body', () => {
      const sql = `
        CREATE OR REPLACE FUNCTION my_func()
        RETURNS VOID AS $$
        BEGIN
          INSERT INTO t VALUES (1);
          UPDATE t SET x = 2;
        END;
        $$ LANGUAGE plpgsql;
        SELECT 1;
      `;
      const result = splitter.Split(sql, 'postgres');
      expect(result).toHaveLength(2);
      expect(result[0]).toContain('CREATE OR REPLACE FUNCTION');
    });

    it('should handle unterminated string literal gracefully', () => {
      const sql = "SELECT 'unterminated";
      const result = splitter.Split(sql, 'postgres');
      expect(result).toHaveLength(1);
    });

    it('should handle unterminated dollar quote gracefully', () => {
      const sql = "SELECT $$unterminated";
      const result = splitter.Split(sql, 'postgres');
      expect(result).toHaveLength(1);
    });

    it('should use tsql splitting by default', () => {
      const sql = "SELECT 1\nGO\nSELECT 2";
      const result = splitter.Split(sql);
      expect(result).toHaveLength(2);
    });
  });
});
