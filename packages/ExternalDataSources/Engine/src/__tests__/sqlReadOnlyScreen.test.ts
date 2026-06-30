import { describe, it, expect } from "vitest";
import { assertReadOnlyNativeQuery, assertReadOnlyClause } from "../sqlReadOnlyScreen";

/**
 * Read-only screen for the native-query path (EDS is read-only by contract). Fail-closed:
 * only single, parseable, write-free statements are allowed through.
 */
describe("assertReadOnlyNativeQuery", () => {
    describe("allows read-only statements", () => {
        it("a plain SELECT (ansi)", () => {
            expect(() => assertReadOnlyNativeQuery("SELECT id, name FROM orders WHERE id = 1", "ansi")).not.toThrow();
        });
        it("a CTE feeding a SELECT (ansi)", () => {
            expect(() => assertReadOnlyNativeQuery("WITH t AS (SELECT 1 AS x) SELECT x FROM t", "ansi")).not.toThrow();
        });
        it("a join aggregation (ansi)", () => {
            expect(() =>
                assertReadOnlyNativeQuery(
                    "SELECT r.name, COUNT(*) AS n FROM regions r JOIN nations n ON n.region_id = r.id GROUP BY r.name",
                    "ansi",
                ),
            ).not.toThrow();
        });
        it("T-SQL SELECT TOP with bracketed identifiers (sqlserver)", () => {
            expect(() => assertReadOnlyNativeQuery("SELECT TOP 10 [Name] FROM [dbo].[Orders]", "sqlserver")).not.toThrow();
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
            expect(() => assertReadOnlyNativeQuery(sql, "ansi")).toThrow();
        });
        it("rejects TRUNCATE (ansi)", () => {
            expect(() => assertReadOnlyNativeQuery("TRUNCATE TABLE orders", "ansi")).toThrow();
        });
        it("rejects a CALL of a stored procedure (ansi) — a proc can mutate", () => {
            expect(() => assertReadOnlyNativeQuery("CALL do_write()", "ansi")).toThrow();
        });
        it("rejects a T-SQL EXEC of a stored procedure (sqlserver) — a proc can mutate", () => {
            expect(() => assertReadOnlyNativeQuery("EXEC dbo.DoSomething @a = 1", "sqlserver")).toThrow();
        });
        // Regression: SELECT ... INTO parses as a `select` (HasWriteStatement=false) but creates a
        // table — it must still be rejected (caught via StatementKind, not HasWriteStatement).
        it("rejects T-SQL SELECT ... INTO (creates a table) (sqlserver)", () => {
            expect(() => assertReadOnlyNativeQuery("SELECT * INTO new_orders FROM orders", "sqlserver")).toThrow(/INTO|read-only/i);
        });
    });

    describe("rejects injection / unverifiable input (fail-closed)", () => {
        it("stacked statements", () => {
            expect(() => assertReadOnlyNativeQuery("SELECT 1; DROP TABLE orders", "ansi")).toThrow();
        });
        it("unparseable SQL", () => {
            expect(() => assertReadOnlyNativeQuery("this is not valid sql @#$%", "ansi")).toThrow();
        });
    });
});

describe("assertReadOnlyClause", () => {
    describe("allows legitimate filter / order-by fragments", () => {
        it("a simple WHERE predicate", () => {
            expect(() => assertReadOnlyClause("Status = 'Active'", "ansi", "where")).not.toThrow();
        });
        it("a compound WHERE predicate", () => {
            expect(() => assertReadOnlyClause("Score >= 10 AND Region = 'East'", "ansi", "where")).not.toThrow();
        });
        it("a read subquery in the WHERE (still read-only)", () => {
            expect(() => assertReadOnlyClause("id IN (SELECT id FROM other_t)", "ansi", "where")).not.toThrow();
        });
        it("an ORDER BY with direction", () => {
            expect(() => assertReadOnlyClause("Name DESC", "ansi", "orderby")).not.toThrow();
        });
        it("a multi-column ORDER BY (PK-style)", () => {
            expect(() => assertReadOnlyClause("id, name", "ansi", "orderby")).not.toThrow();
        });
    });

    describe("rejects injection vectors (fail-closed)", () => {
        it("comment marker in WHERE (would truncate the rest of the query)", () => {
            expect(() => assertReadOnlyClause("1=1 --", "ansi", "where")).toThrow(/comment/i);
        });
        it("statement separator in WHERE", () => {
            expect(() => assertReadOnlyClause("1=1; DROP TABLE orders", "ansi", "where")).toThrow(/separator/i);
        });
        it("statement separator in ORDER BY", () => {
            expect(() => assertReadOnlyClause("name; DROP TABLE orders", "ansi", "orderby")).toThrow(/separator/i);
        });
        it("parenthesis break-out attempt in WHERE", () => {
            expect(() => assertReadOnlyClause("1=1) UNION SELECT password FROM users WHERE ('x'='x'", "ansi", "where")).toThrow();
        });
    });
});
