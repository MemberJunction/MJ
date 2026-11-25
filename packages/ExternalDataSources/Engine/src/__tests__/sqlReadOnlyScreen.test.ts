import { describe, it, expect } from "vitest";
import { AssertReadOnlyNativeQuery, AssertReadOnlyClause } from "../sqlReadOnlyScreen";

/**
 * Read-only screen for the native-query path (EDS is read-only by contract). Fail-closed:
 * only single, parseable, write-free statements are allowed through.
 */
describe("assertReadOnlyNativeQuery", () => {
    describe("allows read-only statements", () => {
        it("a plain SELECT (ansi)", () => {
            expect(() => AssertReadOnlyNativeQuery("SELECT id, name FROM orders WHERE id = 1", "ansi")).not.toThrow();
        });
        it("a CTE feeding a SELECT (ansi)", () => {
            expect(() => AssertReadOnlyNativeQuery("WITH t AS (SELECT 1 AS x) SELECT x FROM t", "ansi")).not.toThrow();
        });
        it("a join aggregation (ansi)", () => {
            expect(() =>
                AssertReadOnlyNativeQuery(
                    "SELECT r.name, COUNT(*) AS n FROM regions r JOIN nations n ON n.region_id = r.id GROUP BY r.name",
                    "ansi",
                ),
            ).not.toThrow();
        });
        it("T-SQL SELECT TOP with bracketed identifiers (sqlserver)", () => {
            expect(() => AssertReadOnlyNativeQuery("SELECT TOP 10 [Name] FROM [dbo].[Orders]", "sqlserver")).not.toThrow();
        });
        it("a column whose name begins with 'grant' — the DCL backstop is start-anchored, no false-positive", () => {
            expect(() => AssertReadOnlyNativeQuery("SELECT grant_date FROM permits", "ansi")).not.toThrow();
        });
        it("a comment-prefixed SELECT is allowed (comment-stripping doesn't over-reject reads)", () => {
            expect(() => AssertReadOnlyNativeQuery("/* report header */ SELECT id FROM orders", "ansi")).not.toThrow();
        });
        it("a read-only CTE feeding a SELECT is allowed (deep write-walk must not over-reject)", () => {
            expect(() => AssertReadOnlyNativeQuery("WITH t AS (SELECT id FROM orders WHERE status = 'a') SELECT * FROM t", "ansi")).not.toThrow();
        });
        it("a UNION of reads is allowed", () => {
            expect(() => AssertReadOnlyNativeQuery("SELECT id FROM a UNION SELECT id FROM b", "ansi")).not.toThrow();
        });
    });

    describe("rejects writes / DDL (read-only enforcement)", () => {
        it.each([
            ["DELETE", "DELETE FROM orders WHERE id = 1"],
            ["UPDATE", "UPDATE orders SET status = 'x' WHERE id = 1"],
            ["INSERT", "INSERT INTO orders (id) VALUES (1)"],
            ["DROP", "DROP TABLE orders"],
            ["data-modifying CTE", "WITH t AS (SELECT 1 AS x) DELETE FROM orders"],
        ])("rejects %s", (_label, sql) => {
            expect(() => AssertReadOnlyNativeQuery(sql, "ansi")).toThrow();
        });
        // Writable CTE bodies parse as a top-level `select`, so HasWriteStatement misses them — the deep
        // AST write-walk catches the nested INSERT/UPDATE.
        it("rejects an INSERT nested in a CTE body (ansi)", () => {
            expect(() => AssertReadOnlyNativeQuery("WITH t AS (INSERT INTO logs VALUES (1) RETURNING *) SELECT * FROM t", "ansi")).toThrow(/read-only|write/i);
        });
        it("rejects an UPDATE nested in a CTE body (ansi)", () => {
            expect(() => AssertReadOnlyNativeQuery("WITH t AS (UPDATE accounts SET balance = 0 RETURNING *) SELECT * FROM t", "ansi")).toThrow(/read-only|write/i);
        });
        // T-SQL WITH...INSERT mis-parses to an array of type:null nodes — the single-typed-statement guard catches it.
        it("rejects a T-SQL WITH ... INSERT (sqlserver)", () => {
            expect(() => AssertReadOnlyNativeQuery("WITH t AS (SELECT * FROM x) INSERT INTO y SELECT * FROM t", "sqlserver")).toThrow(/read-only|write|single/i);
        });
        it("rejects TRUNCATE (ansi)", () => {
            expect(() => AssertReadOnlyNativeQuery("TRUNCATE TABLE orders", "ansi")).toThrow();
        });
        it("rejects a CALL of a stored procedure (ansi) — a proc can mutate", () => {
            expect(() => AssertReadOnlyNativeQuery("CALL do_write()", "ansi")).toThrow();
        });
        it("rejects a T-SQL EXEC of a stored procedure (sqlserver) — a proc can mutate", () => {
            expect(() => AssertReadOnlyNativeQuery("EXEC dbo.DoSomething @a = 1", "sqlserver")).toThrow();
        });
        // Regression: SELECT ... INTO parses as a `select` (HasWriteStatement=false) but creates a
        // table — it must still be rejected (caught via StatementKind, not HasWriteStatement).
        it("rejects T-SQL SELECT ... INTO (creates a table) (sqlserver)", () => {
            expect(() => AssertReadOnlyNativeQuery("SELECT * INTO new_orders FROM orders", "sqlserver")).toThrow(/INTO|read-only/i);
        });
        // DCL: the underlying parser doesn't reliably type GRANT/REVOKE as a write, so a start-anchored
        // backstop catches them (they'd otherwise slip past HasWriteStatement).
        it("rejects a GRANT (DCL) statement (sqlserver)", () => {
            expect(() => AssertReadOnlyNativeQuery("GRANT SELECT ON dbo.Orders TO reader", "sqlserver")).toThrow(/GRANT|REVOKE|DENY|read-only/i);
        });
        it("rejects a REVOKE (DCL) statement (ansi)", () => {
            expect(() => AssertReadOnlyNativeQuery("REVOKE SELECT ON orders FROM reader", "ansi")).toThrow(/GRANT|REVOKE|DENY|read-only/i);
        });
        // Regression: a leading SQL comment must not slip a DCL statement past the backstop. On the
        // T-SQL dialect the parser doesn't type GRANT/DENY as a write, so the comment-stripping DCL
        // check is the only thing that catches these.
        it("rejects a block-comment-prefixed GRANT (sqlserver)", () => {
            expect(() => AssertReadOnlyNativeQuery("/* c */ GRANT SELECT ON dbo.Orders TO reader", "sqlserver")).toThrow(/GRANT|REVOKE|DENY|read-only/i);
        });
        it("rejects a line-comment-prefixed DENY (sqlserver)", () => {
            expect(() => AssertReadOnlyNativeQuery("-- grant access\nDENY SELECT ON dbo.Orders TO reader", "sqlserver")).toThrow(/GRANT|REVOKE|DENY|read-only/i);
        });
        it("rejects a stacked-comment-prefixed REVOKE (ansi)", () => {
            expect(() => AssertReadOnlyNativeQuery("/*a*/ /*b*/ REVOKE SELECT ON orders FROM reader", "ansi")).toThrow(/GRANT|REVOKE|DENY|read-only/i);
        });
    });

    describe("rejects injection / unverifiable input (fail-closed)", () => {
        it("stacked statements", () => {
            expect(() => AssertReadOnlyNativeQuery("SELECT 1; DROP TABLE orders", "ansi")).toThrow();
        });
        it("unparseable SQL", () => {
            expect(() => AssertReadOnlyNativeQuery("this is not valid sql @#$%", "ansi")).toThrow();
        });
    });
});

describe("assertReadOnlyClause", () => {
    describe("allows legitimate filter / order-by fragments", () => {
        it("a simple WHERE predicate", () => {
            expect(() => AssertReadOnlyClause("Status = 'Active'", "ansi", "where")).not.toThrow();
        });
        it("a compound WHERE predicate", () => {
            expect(() => AssertReadOnlyClause("Score >= 10 AND Region = 'East'", "ansi", "where")).not.toThrow();
        });
        it("a read subquery in the WHERE (still read-only)", () => {
            expect(() => AssertReadOnlyClause("id IN (SELECT id FROM other_t)", "ansi", "where")).not.toThrow();
        });
        it("an ORDER BY with direction", () => {
            expect(() => AssertReadOnlyClause("Name DESC", "ansi", "orderby")).not.toThrow();
        });
        it("a multi-column ORDER BY (PK-style)", () => {
            expect(() => AssertReadOnlyClause("id, name", "ansi", "orderby")).not.toThrow();
        });
    });

    describe("rejects injection vectors (fail-closed)", () => {
        it("comment marker in WHERE (would truncate the rest of the query)", () => {
            expect(() => AssertReadOnlyClause("1=1 --", "ansi", "where")).toThrow(/comment/i);
        });
        it("statement separator in WHERE", () => {
            expect(() => AssertReadOnlyClause("1=1; DROP TABLE orders", "ansi", "where")).toThrow(/separator/i);
        });
        it("statement separator in ORDER BY", () => {
            expect(() => AssertReadOnlyClause("name; DROP TABLE orders", "ansi", "orderby")).toThrow(/separator/i);
        });
        it("parenthesis break-out attempt in WHERE", () => {
            expect(() => AssertReadOnlyClause("1=1) UNION SELECT password FROM users WHERE ('x'='x'", "ansi", "where")).toThrow();
        });
    });
});

/**
 * MySQL comment syntax. In MySQL `--` starts a comment only when followed by whitespace or a control
 * character, so `--1` is NOT a comment there: `SELECT 1 --1 INTO OUTFILE '/tmp/x'` is `SELECT 1 - (-1)
 * INTO OUTFILE ...`, a file write. Screened under the MySQL dialect, the text is read with MySQL's rules.
 */
describe("assertReadOnlyNativeQuery: MySQL '--' comment rule", () => {
    const MYSQL_OUTFILE_BEHIND_DASHES = "SELECT 1 --1 INTO OUTFILE '/tmp/x'";

    it("refuses the same write with no '--' in front of it (the INTO check works)", () => {
        expect(() => AssertReadOnlyNativeQuery("SELECT 1 INTO OUTFILE '/tmp/x'", "ansi")).toThrow(/SELECT \.\.\. INTO/);
    });

    it("refuses 'SELECT 1 --1 INTO OUTFILE' for a MySQL source", () => {
        expect(() => AssertReadOnlyNativeQuery(MYSQL_OUTFILE_BEHIND_DASHES, "mysql")).toThrow(/INTO/);
    });

    it("still reads '-- ' followed by a space as a MySQL comment", () => {
        expect(() => AssertReadOnlyNativeQuery("SELECT id FROM orders -- note\n", "mysql")).not.toThrow();
    });

    it("'ansi' keeps screening with the PostgreSQL dialect (deprecated alias)", () => {
        expect(() => AssertReadOnlyNativeQuery(MYSQL_OUTFILE_BEHIND_DASHES, "ansi")).not.toThrow();
        expect(() => AssertReadOnlyNativeQuery("SELECT 1; DROP TABLE t", "ansi")).toThrow(/multiple statements/);
    });
});

describe("assertReadOnlyNativeQuery: MySQL lexical rules", () => {
    it("allows backtick identifiers", () => {
        expect(() => AssertReadOnlyNativeQuery("SELECT `name`, `total` FROM `orders` WHERE `status` = 'a'", "mysql")).not.toThrow();
    });
    it("reads a semicolon inside a backtick identifier as part of the name", () => {
        expect(() => AssertReadOnlyNativeQuery("SELECT `a;b` FROM `orders`", "mysql")).not.toThrow();
    });
    it("allows a '#' comment", () => {
        expect(() => AssertReadOnlyNativeQuery("SELECT id FROM orders # trailing note", "mysql")).not.toThrow();
    });
    it("refuses a write after a '#' comment line", () => {
        expect(() => AssertReadOnlyNativeQuery("# header\nDELETE FROM orders", "mysql")).toThrow(/read-only|write/i);
    });
    it("refuses GRANT behind a '#' comment", () => {
        expect(() => AssertReadOnlyNativeQuery("# c\nGRANT SELECT ON db.t TO reader", "mysql")).toThrow(/GRANT|REVOKE|DENY/);
    });
    it("reads '#' inside a string literal as text, not a comment", () => {
        expect(() => AssertReadOnlyNativeQuery("SELECT id FROM orders WHERE tag = '#1'; DELETE FROM orders", "mysql")).toThrow(/multiple statements/);
    });
    it("refuses a backslash-escaped quote: its end depends on NO_BACKSLASH_ESCAPES", () => {
        expect(() => AssertReadOnlyNativeQuery("SELECT 'a\\'; DROP TABLE t; -- '", "mysql")).toThrow(/backslash/);
    });
    it("refuses an executable /*! */ comment", () => {
        expect(() => AssertReadOnlyNativeQuery("SELECT 1 /*!50000 INTO OUTFILE '/tmp/x' */", "mysql")).toThrow(/comment/);
    });
    it("allows a double-quoted string (MySQL default SQL mode)", () => {
        expect(() => AssertReadOnlyNativeQuery('SELECT id FROM orders WHERE status = "open"', "mysql")).not.toThrow();
    });
    it("refuses a '#' comment in a clause", () => {
        expect(() => AssertReadOnlyClause("status = 'a' # x", "mysql", "where")).toThrow(/comment/);
    });
});

describe("assertReadOnlyNativeQuery: Oracle (no grammar: lexical screen, fail closed)", () => {
    it("allows a plain SELECT", () => {
        expect(() => AssertReadOnlyNativeQuery("SELECT employee_id, last_name FROM hr.employees WHERE ROWNUM <= 10", "oracle")).not.toThrow();
    });
    it("allows a WITH query with a FETCH FIRST cap and a :bind", () => {
        expect(() => AssertReadOnlyNativeQuery("WITH t AS (SELECT 1 AS x FROM dual) SELECT x FROM t WHERE x = :1 FETCH FIRST 5 ROWS ONLY", "oracle")).not.toThrow();
    });
    it("reads a semicolon inside a q'[…]' literal as text", () => {
        expect(() => AssertReadOnlyNativeQuery("SELECT q'[it's; DROP TABLE t]' AS v FROM dual", "oracle")).not.toThrow();
    });
    it("refuses a statement after a q'{…}' literal", () => {
        expect(() => AssertReadOnlyNativeQuery("SELECT q'{a}' FROM dual; DROP TABLE t", "oracle")).toThrow(/multiple statements/);
    });
    it.each([
        ["DELETE", "DELETE FROM employees"],
        ["UPDATE", "UPDATE employees SET salary = 0"],
        ["BEGIN block", "BEGIN NULL; END;"],
        ["SELECT FOR UPDATE", "SELECT * FROM employees FOR UPDATE"],
        ["WITH FUNCTION", "WITH FUNCTION f RETURN NUMBER IS BEGIN RETURN 1; END; SELECT f FROM dual"],
        ["MERGE", "MERGE INTO t USING s ON (t.id = s.id) WHEN MATCHED THEN UPDATE SET t.v = s.v"],
    ])("refuses %s", (_label, sql) => {
        expect(() => AssertReadOnlyNativeQuery(sql, "oracle")).toThrow();
    });
    it("screens an Oracle clause with Oracle lexical rules", () => {
        expect(() => AssertReadOnlyClause("last_name = 'King'", "oracle", "where")).not.toThrow();
        expect(() => AssertReadOnlyClause("1=1) UNION SELECT password FROM users WHERE (1=1", "oracle", "where")).toThrow();
    });
});

describe("assertReadOnlyNativeQuery: Snowflake", () => {
    it("allows a read with a $$ string containing a semicolon", () => {
        expect(() => AssertReadOnlyNativeQuery("SELECT $$a; b$$ AS v FROM nation", "snowflake")).not.toThrow();
    });
    it("reads // as a line comment", () => {
        expect(() => AssertReadOnlyNativeQuery("SELECT n_name FROM nation // trailing note", "snowflake")).not.toThrow();
    });
    it("refuses a write behind a // comment line", () => {
        expect(() => AssertReadOnlyNativeQuery("// header\nDELETE FROM nation", "snowflake")).toThrow(/read-only|write/i);
    });
    it("reads a backslash-escaped quote as part of the literal", () => {
        expect(() => AssertReadOnlyNativeQuery("SELECT 'a\\'; b' AS v FROM nation", "snowflake")).not.toThrow();
    });
    it("refuses a '//' comment in a clause", () => {
        expect(() => AssertReadOnlyClause("n_name = 'x' // y", "snowflake", "where")).toThrow(/comment/);
    });
});

describe("assertReadOnlyNativeQuery: Databricks", () => {
    it("allows backtick identifiers and a three-part name", () => {
        expect(() => AssertReadOnlyNativeQuery("SELECT `trip_distance` FROM `samples`.`nyctaxi`.`trips` LIMIT 10", "databricks")).not.toThrow();
    });
    it("reads a semicolon inside a backtick identifier as part of the name", () => {
        expect(() => AssertReadOnlyNativeQuery("SELECT `a;b` FROM trips", "databricks")).not.toThrow();
    });
    it("reads '--' with no space after it as a comment", () => {
        expect(() => AssertReadOnlyNativeQuery("SELECT 1 FROM trips --1; DROP TABLE trips", "databricks")).not.toThrow();
    });
    it("refuses a backslash in a string literal: escapedStringLiterals decides where it ends", () => {
        expect(() => AssertReadOnlyNativeQuery("SELECT 'a\\'; DROP TABLE t; --' FROM trips", "databricks")).toThrow(/backslash/);
    });
    it("refuses a write", () => {
        expect(() => AssertReadOnlyNativeQuery("DELETE FROM trips WHERE id = 1", "databricks")).toThrow(/read-only|write/i);
    });
});
