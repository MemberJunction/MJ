import { describe, it, expect } from "vitest";
import { assertReadOnlyNativeQuery } from "../sqlReadOnlyScreen";

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
