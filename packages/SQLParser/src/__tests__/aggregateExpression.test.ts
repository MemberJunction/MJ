import { describe, it, expect } from 'vitest';
import { PostgreSQLDialect, SQLServerDialect } from '@memberjunction/sql-dialect';
import { CheckAggregateExpression } from '../index.js';

const ss = new SQLServerDialect();
const pg = new PostgreSQLDialect();

const COLUMNS = ['ID', 'Name', 'Status', 'Type', 'Amount', 'Price', 'Quantity', 'Discount', 'StartDate', 'EndDate', '__mj_UpdatedAt', 'Total Amount'];

describe('CheckAggregateExpression — SQL Server', () => {
    it.each([
        'COUNT(*)',
        'count(*)',
        'COUNT(1)',
        'COUNT(DISTINCT Status)',
        'SUM(Amount)',
        'SUM([Amount])',
        'SUM(amount)',
        'MIN([Total Amount])',
        'MAX(__mj_UpdatedAt)',
        'MAX("Name")',
        'AVG(Price * Quantity)',
        'SUM(Quantity * Price * (1 - Discount/100))',
        "COUNT(CASE WHEN Status = 'Active' THEN 1 END)",
        "SUM(CASE WHEN Type = 'Credit' THEN Amount ELSE -Amount END)",
        "COUNT(CASE WHEN Status IN ('A', 'B') AND Amount BETWEEN 1 AND 5 THEN 1 END)",
        "COUNT(CASE WHEN Status IS NOT NULL AND Name LIKE 'A%' THEN 1 END)",
        'COUNT(CASE WHEN NOT (Amount > 1) THEN 1 END)',
        "COUNT(CASE Status WHEN 'A' THEN 1 END)",
        "COUNT(CASE WHEN Name = 'a;b -- c' THEN 1 END)",
        "COUNT(CASE WHEN Name = 'it''s' THEN 1 END)",
        "MAX(N'abc')",
        'SUM(ISNULL(Amount, 0))',
        'AVG(COALESCE(Amount, 0))',
        'MAX(IIF(Amount > 0, 1, 0))',
        'MAX(LEN(Name))',
        'MIN(YEAR(StartDate))',
        'AVG(DATEDIFF(day, StartDate, EndDate))',
        'MAX(DATEPART(yyyy, StartDate))',
        'AVG(DATEDIFF(day, StartDate, GETDATE()))',
        'SUM(CAST(Amount AS DECIMAL(18,2)))',
        "STRING_AGG(Name, ', ')",
        'STDEV(Amount)',
        '  SUM(Amount)  ',
    ])('allows %s', (expression) => {
        expect(CheckAggregateExpression(expression, ss, COLUMNS)).toEqual({ IsAllowed: true, Reason: null });
    });

    it.each([
        ['', /empty/],
        ['   ', /empty/],
        ["COUNT(*) AS [a'] ; SELECT 1 AS [b'], COUNT(*)", /statement separator/],
        ['COUNT(*); SELECT 1', /statement separator/],
        ['COUNT(*);', /statement separator/],
        ['COUNT(*) -- trailing', /comment/],
        ['SUM(Amount /* x */)', /comment/],
        ['SUM(Amount) + 1', /single aggregate function call/],
        ['COUNT(*), MAX(Name)', /single aggregate function call/],
        ['COUNT(*) AS Total', /single aggregate function call/],
        ['SUM(Amount) OVER ()', /single aggregate function call/],
        ['COUNT(*) FROM __mj.vwUsers', /single aggregate function call/],
        ['COUNT(*) + (SELECT COUNT(*) FROM __mj.[User])', /single aggregate function call/],
        ['(COUNT(*))', /single aggregate function call/],
        ['Amount', /single aggregate function call/],
        ['SUM(Amount))', /single aggregate function call/],
        ['ROUND(AVG(Amount), 2)', /ROUND is not an aggregate function/],
        ['MAX((SELECT TOP 1 Name FROM __mj.vwUsers))', /subquery/],
        ['SUM(Secret)', /"Secret".*not a column/],
        ["MAX([a'])", /not a column/],
        ['MAX(@x)', /not a column/],
        ['MAX(vwWidgets.Amount)', /qualified/],
        ['SUM(*)', /could not be parsed/],
        ['SUM(SUM(Amount))', /cannot be nested/],
        ['MAX(CONVERT(INT, Amount))', /CONVERT/],
        ['MAX(dbo.fnSecret(Amount))', /fnSecret/],
        ['MAX(USER_NAME())', /USER_NAME/],
        ['MAX(DATEPART(Secret, StartDate))', /"Secret".*not a column/],
        ['MAX(Amount COLLATE Latin1_General_CS_AS)', /not allow/],
        ['MAX(@@VERSION)', /could not be parsed/],
    ])('refuses %s', (expression, reason) => {
        const check = CheckAggregateExpression(expression, ss, COLUMNS);
        expect(check.IsAllowed).toBe(false);
        expect(check.Reason).toMatch(reason);
    });

    it('matches columns case-insensitively and refuses every name outside the list', () => {
        expect(CheckAggregateExpression('SUM(AMOUNT)', ss, ['amount']).IsAllowed).toBe(true);
        expect(CheckAggregateExpression('SUM(Amount)', ss, []).IsAllowed).toBe(false);
    });

    it('refuses a non-string expression', () => {
        expect(CheckAggregateExpression(undefined as unknown as string, ss, COLUMNS)).toEqual({ IsAllowed: false, Reason: 'it is empty' });
    });
});

describe('CheckAggregateExpression — PostgreSQL', () => {
    it.each([
        'COUNT(*)',
        'SUM(Amount)',
        'SUM("Amount")',
        'AVG("Price" * "Quantity")',
        `COUNT(CASE WHEN "Status" = 'Active' THEN 1 END)`,
        `COUNT(CASE WHEN "Status" IN ('a', 'b') AND "Name" IS NOT NULL THEN 1 END)`,
        'SUM(-"Amount")',
        'SUM("Amount"::numeric)',
        'SUM(CAST("Amount" AS numeric))',
        `STRING_AGG("Name", ',')`,
        'SUM(COALESCE("Amount", 0))',
        'MAX(LENGTH("Name"))',
        `AVG(DATE_PART('day', "EndDate"))`,
    ])('allows %s', (expression) => {
        expect(CheckAggregateExpression(expression, pg, COLUMNS)).toEqual({ IsAllowed: true, Reason: null });
    });

    it.each([
        ["COUNT(*) + LENGTH(E'\\'') ; SELECT 1 AS x, COUNT(E'\\'')", /statement separator/],
        ['COUNT(*); SELECT 1', /statement separator/],
        ["MAX(E'abc')", /not allow/],
        ['MAX($$abc$$)', /not allow/],
        [`COUNT(*) FILTER (WHERE "Amount" > 0)`, /single aggregate function call/],
        ['SUM("Secret")', /"Secret".*not a column/],
        ['SUM(*)', /"\*".*not a column/],
        [`MAX(pg_read_file('x'))`, /pg_read_file/],
        [`MAX("Name" -> 'a')`, /operator "->"/],
        ['AVG(EXTRACT(EPOCH FROM ("EndDate" - "StartDate")))', /not allow/],
    ])('refuses %s', (expression, reason) => {
        const check = CheckAggregateExpression(expression, pg, COLUMNS);
        expect(check.IsAllowed).toBe(false);
        expect(check.Reason).toMatch(reason);
    });
});
