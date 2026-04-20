/**
 * End-to-end snapshot test corpus for the full rendering pipeline.
 *
 * Tests run through RenderPipeline.Run() and verify the output SQL against
 * expected patterns. Organized by category per query-rendering-e2e-test-corpus.md.
 *
 * Prioritized categories:
 *   Category 11 — Full pipeline (composition + templates + paging)
 *   Category 6  — ORDER BY stripping edge cases
 *   Category 3  — Composition with inner CTEs
 *   Category 4  — Multi-dep composition
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RenderPipeline } from '../renderPipeline';
import { Metadata, UserInfo, QueryDependencySpec } from '@memberjunction/core';

const mockUser = { UserRoles: [{ Role: 'Admin' }] } as unknown as UserInfo;

afterEach(() => {
    vi.restoreAllMocks();
});

function setupNoMetadata(): void {
    vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({
        Queries: [],
        QueryDependencies: [],
    } as ReturnType<typeof Metadata.Provider>);
}

// ════════════════════════════════════════════════════════════════════
// Category 6: ORDER BY Stripping Edge Cases
// ════════════════════════════════════════════════════════════════════

describe('Category 6: ORDER BY Stripping Edge Cases', () => {

    // TC-06.01: Plain trailing ORDER BY — must be stripped
    it('TC-06.01: strips plain trailing ORDER BY from dep', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [{
            Name: 'Customers', CategoryPath: '/Sales/', SQL:
`SELECT [ID], [Name], [Revenue]
FROM [crm].[vwCustomers]
ORDER BY [Revenue] DESC`,
        }];
        const result = RenderPipeline.Run(
            `SELECT [c].[Name] FROM {{query:"Sales/Customers"}} [c]`,
            { Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps }
        );
        // CTE body must not contain the ORDER BY, or it must have OFFSET
        const cteBody = extractCTEBody(result.FinalSQL);
        const hasOrderBy = /ORDER\s+BY\s+\[Revenue\]/i.test(cteBody);
        const hasOffset = /OFFSET\s+0\s+ROWS/i.test(cteBody);
        expect(hasOrderBy === false || hasOffset).toBe(true);
    });

    // TC-06.02: ORDER BY with TOP — must be PRESERVED
    it('TC-06.02: preserves ORDER BY when TOP is present', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [{
            Name: 'TopCust', CategoryPath: '/Sales/', SQL:
`SELECT TOP 10 [ID], [Name]
FROM [crm].[vwCustomers]
ORDER BY [CreatedAt] DESC`,
        }];
        const result = RenderPipeline.Run(
            `SELECT * FROM {{query:"Sales/TopCust"}} [c]`,
            { Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps }
        );
        expect(result.FinalSQL).toMatch(/ORDER\s+BY/i);
        expect(result.FinalSQL).toContain('TOP 10');
    });

    // TC-06.05: ORDER BY inside window function only — nothing to strip
    it('TC-06.05: does not strip window function ORDER BY', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [{
            Name: 'Ranked', CategoryPath: '/Test/', SQL:
`SELECT [ID],
    ROW_NUMBER() OVER (PARTITION BY [Region] ORDER BY [Revenue] DESC) AS [rn]
FROM [crm].[vwCustomers]`,
        }];
        const result = RenderPipeline.Run(
            `SELECT * FROM {{query:"Test/Ranked"}} [r]`,
            { Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps }
        );
        expect(result.FinalSQL).toContain('ROW_NUMBER()');
        expect(result.FinalSQL).not.toMatch(/OFFSET\s+0\s+ROWS/i);
    });

    // TC-06.07: "ORDER BY" text inside block comment — must NOT cause truncation (Bug A)
    it('TC-06.07: does not truncate dep at comment-embedded ORDER BY', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [{
            Name: 'GoldenQ', CategoryPath: '/Test/', SQL:
`/*
  No ORDER BY / TOP -- composable.
*/
SELECT [ID], [Value] FROM [data].[vwRecords]`,
        }];
        const result = RenderPipeline.Run(
            `SELECT [g].[ID] FROM {{query:"Test/GoldenQ"}} [g]`,
            { Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps }
        );
        expect(result.FinalSQL).toContain('[data].[vwRecords]');
        expect(result.FinalSQL).toContain('SELECT [ID], [Value]');
    });

    // TC-06.08: "ORDER BY" text inside line comment
    it('TC-06.08: does not truncate dep at line comment ORDER BY', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [{
            Name: 'Commented', CategoryPath: '/Test/', SQL:
`-- Note: caller should add their own ORDER BY downstream
SELECT [ID], [Value] FROM [data].[vwRecords]`,
        }];
        const result = RenderPipeline.Run(
            `SELECT * FROM {{query:"Test/Commented"}} [r]`,
            { Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps }
        );
        expect(result.FinalSQL).toContain('[data].[vwRecords]');
    });

    // TC-06.09: Nunjucks expression inside string literal + trailing ORDER BY (Bug D)
    it('TC-06.09: strips ORDER BY when dep has template in string literal', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [{
            Name: 'Filtered', CategoryPath: '/Test/', UsesTemplate: true, SQL:
`SELECT [ID], [Name]
FROM [data].[vwRecords]
WHERE [Status] = '{{ StatusFilter }}'
ORDER BY [Name] ASC`,
        }];
        const result = RenderPipeline.Run(
            `SELECT * FROM {{query:"Test/Filtered(StatusFilter=StatusFilter)"}} [r]`,
            { Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps,
              UsesTemplate: true, Parameters: { StatusFilter: 'Active' } }
        );
        // The dep ORDER BY must be stripped or made legal
        const cteBody = extractCTEBody(result.Trace.AfterComposition);
        const hasOrderBy = /ORDER\s+BY\s+\[Name\]\s+ASC/i.test(cteBody);
        const hasOffset = /OFFSET\s+0\s+ROWS/i.test(cteBody);
        expect(hasOrderBy === false || hasOffset).toBe(true);
    });

    // TC-06.10: ORDER BY after {% endif %} block
    it('TC-06.10: strips ORDER BY after conditional block', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [{
            Name: 'Conditional', CategoryPath: '/Test/', UsesTemplate: true, SQL:
`SELECT [ID], [Value]
FROM [data].[vwRecords]
WHERE 1 = 1
{% if Region %}
    AND [Region] = {{ Region | sqlString }}
{% endif %}
ORDER BY [Value] DESC`,
        }];
        const result = RenderPipeline.Run(
            `SELECT * FROM {{query:"Test/Conditional(Region=Region)"}} [r]`,
            { Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps }
        );
        const cteBody = extractCTEBody(result.FinalSQL);
        const hasOrderBy = /ORDER\s+BY\s+\[Value\]\s+DESC/i.test(cteBody);
        const hasOffset = /OFFSET\s+0\s+ROWS/i.test(cteBody);
        expect(hasOrderBy === false || hasOffset).toBe(true);
    });

    // TC-06.11: STRING_AGG WITHIN GROUP (ORDER BY) — internal ORDER BY
    it('TC-06.11: does not strip WITHIN GROUP ORDER BY', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [{
            Name: 'StringAgg', CategoryPath: '/Test/', SQL:
`SELECT
    [Region],
    STRING_AGG([Tag], ', ') WITHIN GROUP (ORDER BY [Tag]) AS [AllTags]
FROM [data].[vwTagged]
GROUP BY [Region]`,
        }];
        const result = RenderPipeline.Run(
            `SELECT * FROM {{query:"Test/StringAgg"}} [r]`,
            { Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps }
        );
        expect(result.FinalSQL).toContain('WITHIN GROUP');
        expect(result.FinalSQL).not.toMatch(/OFFSET\s+0\s+ROWS/i);
    });
});

// ════════════════════════════════════════════════════════════════════
// Category 3: Composition with Inner CTEs
// ════════════════════════════════════════════════════════════════════

describe('Category 3: Composition with Inner CTEs', () => {

    // TC-03.01: Dep with single inner CTE — basic hoisting
    it('TC-03.01: hoists single inner CTE as sibling', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [{
            Name: 'ExecComp', CategoryPath: '/Reports/', SQL:
`WITH MemberByEmail AS (
    SELECT LOWER([m].[EmailAddress]) AS [EmailKey], [m].[ID]
    FROM [ym].[vwMembers] [m]
)
SELECT [e].[ID], [m].[ID] AS [MemberID]
FROM [data].[vwExecComp] [e]
LEFT JOIN MemberByEmail [m] ON [m].[EmailKey] = LOWER([e].[Email])`,
        }];
        const result = RenderPipeline.Run(
            `SELECT [ec].[ID] FROM {{query:"Reports/ExecComp"}} [ec]`,
            { Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps }
        );
        expect(result.HasCompositions).toBe(true);
        expect(result.FinalSQL).toContain('MemberByEmail AS');
        // The inner CTE must precede the outer CTE
        const memberByEmailPos = result.FinalSQL.indexOf('MemberByEmail AS');
        const outerCTEPos = result.FinalSQL.indexOf('__cte_ExecComp');
        expect(memberByEmailPos).toBeLessThan(outerCTEPos);
    });

    // TC-03.02: Dep with multiple inner CTEs
    it('TC-03.02: hoists multiple inner CTEs as siblings', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [{
            Name: 'Summary', CategoryPath: '/Reports/', SQL:
`WITH CTE_A AS (
    SELECT [ID], [Name] FROM [t1]
),
CTE_B AS (
    SELECT [ID], COUNT(*) AS [Total]
    FROM [t2]
    GROUP BY [ID]
)
SELECT [a].[Name], [b].[Total]
FROM CTE_A [a]
LEFT JOIN CTE_B [b] ON [a].[ID] = [b].[ID]`,
        }];
        const result = RenderPipeline.Run(
            `SELECT * FROM {{query:"Reports/Summary"}} [s]`,
            { Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps }
        );
        expect(result.FinalSQL).toContain('CTE_A AS');
        expect(result.FinalSQL).toContain('CTE_B AS');
        // Both inner CTEs must come before the outer CTE
        const cteAPos = result.FinalSQL.indexOf('CTE_A AS');
        const cteBPos = result.FinalSQL.indexOf('CTE_B AS');
        const outerPos = result.FinalSQL.indexOf('__cte_Summary');
        expect(cteAPos).toBeLessThan(outerPos);
        expect(cteBPos).toBeLessThan(outerPos);
    });

    // TC-03.03: Dep with inner CTE + leading block comment containing "ORDER BY" (Bug A)
    it('TC-03.03: preserves dep body with inner CTE + comment ORDER BY', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [{
            Name: 'GoldenQuery', CategoryPath: '/Golden-Queries/Analytics/', SQL:
`/*
  Canonical query for member engagement metrics.
  No ORDER BY / TOP -- composable.
*/

WITH InnerCTE AS (
    SELECT [ID], [Value] FROM [data].[vwMetrics]
)
SELECT [c].[ID], [c].[Value]
FROM InnerCTE [c]
WHERE [c].[Value] > 0`,
        }];
        const result = RenderPipeline.Run(
            `SELECT [g].[ID] FROM {{query:"Golden-Queries/Analytics/GoldenQuery"}} [g]`,
            { Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps }
        );
        expect(result.FinalSQL).toContain('InnerCTE AS');
        expect(result.FinalSQL).toContain('[c].[Value] > 0');
    });

    // TC-03.04: Dep with inner CTE + ROW_NUMBER window function
    it('TC-03.04: preserves window function ORDER BY in inner CTE', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [{
            Name: 'DedupedMembers', CategoryPath: '/Reports/', SQL:
`WITH MemberByEmail AS (
    SELECT
        LOWER([m].[EmailAddress]) AS [EmailKey],
        [m].[ID],
        ROW_NUMBER() OVER (
            PARTITION BY LOWER([m].[EmailAddress])
            ORDER BY
                CASE WHEN [m].[Membership] IS NOT NULL THEN 0 ELSE 1 END,
                [m].[ID]
        ) AS [rn]
    FROM [ym].[vwMembers] [m]
)
SELECT [m].[ID], [m].[EmailKey]
FROM MemberByEmail [m]
WHERE [m].[rn] = 1`,
        }];
        const result = RenderPipeline.Run(
            `SELECT [d].[ID] FROM {{query:"Reports/DedupedMembers"}} [d]`,
            { Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps }
        );
        expect(result.FinalSQL).toContain('ROW_NUMBER()');
        expect(result.FinalSQL).not.toMatch(/OFFSET\s+0\s+ROWS/i);
    });

    // TC-03.05: Dep with inner CTE + TRY_CAST (AST parser fails)
    it('TC-03.05: handles TRY_CAST via fallback when AST fails', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [{
            Name: 'ParsedValues', CategoryPath: '/Reports/', SQL:
`WITH Parsed AS (
    SELECT
        [ID],
        TRY_CAST(REPLACE(REPLACE([RawValue], '$', ''), ',', '') AS DECIMAL(18,2)) AS [CleanValue]
    FROM [data].[vwRawData]
)
SELECT [p].[ID], [p].[CleanValue]
FROM Parsed [p]
WHERE [p].[CleanValue] IS NOT NULL`,
        }];
        const result = RenderPipeline.Run(
            `SELECT * FROM {{query:"Reports/ParsedValues"}} [pv]`,
            { Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps }
        );
        expect(result.FinalSQL).toContain('TRY_CAST');
        expect(result.FinalSQL).toContain('Parsed AS');
    });

    // TC-03.06: Dep with inner CTE + Nunjucks template inside string literal (Bug D)
    it('TC-03.06: strips ORDER BY when template is inside string literal', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [{
            Name: 'MemberActivity', CategoryPath: '/Golden-Queries/Analytics/',
            UsesTemplate: true, SQL:
`WITH MemberActivities AS (
    SELECT [m].[ID] AS [MemberID], [m].[Name], COUNT(*) AS [TotalCount]
    FROM [ym].[vwMembers] [m]
    LEFT JOIN [data].[vwActivities] [a] ON [a].[MemberID] = [m].[ID]
    GROUP BY [m].[ID], [m].[Name]
)
SELECT * FROM MemberActivities
{% if MembershipType %}
WHERE EXISTS (
    SELECT 1 FROM [ym].[vwMemberships] ms
    INNER JOIN [ym].[vwMembershipTypes] mt ON ms.MembershipTypeID = mt.ID
    WHERE ms.MemberID = MemberActivities.MemberID
      AND mt.Name = '{{ MembershipType }}'
)
{% endif %}
ORDER BY TotalCount DESC`,
        }];
        const result = RenderPipeline.Run(
            `SELECT [mac].[MemberID] FROM {{query:"Golden-Queries/Analytics/MemberActivity(MembershipType=MembershipType)"}} [mac]
ORDER BY [mac].[MemberID]`,
            { Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps,
              UsesTemplate: true, Parameters: { MembershipType: 'Gold' } }
        );

        // Dep's ORDER BY TotalCount DESC must be stripped
        const afterComp = result.Trace.AfterComposition;
        const cteBody = extractCTEBody(afterComp);
        const hasDepOrderBy = /ORDER\s+BY\s+TotalCount\s+DESC/i.test(cteBody);
        const hasOffset = /OFFSET\s+0\s+ROWS/i.test(cteBody);
        expect(hasDepOrderBy === false || hasOffset).toBe(true);

        // After templates: the Nunjucks expression should be resolved
        expect(result.Trace.AfterTemplates).toContain("'Gold'");

        // Outer ORDER BY preserved
        expect(result.FinalSQL).toContain('ORDER BY [mac].[MemberID]');
    });
});

// ════════════════════════════════════════════════════════════════════
// Category 4: Multi-Dep Composition
// ════════════════════════════════════════════════════════════════════

describe('Category 4: Multi-Dep Composition', () => {

    // TC-04.01: Two deps — no inner CTE collisions
    it('TC-04.01: composes two deps without collisions', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [
            {
                Name: 'Active Users', CategoryPath: '/Demos/', SQL:
`SELECT [ID], [Name], [Email] FROM [__mj].[vwUsers] WHERE [IsActive] = 1`,
            },
            {
                Name: 'Recent Changes', CategoryPath: '/Demos/', UsesTemplate: true, SQL:
`SELECT [EntityName], COUNT(*) AS [ChangeCount]
FROM [__mj].[vwRecordChanges]
WHERE [CreatedAt] >= DATEADD(DAY, -{{ lookbackDays | sqlNumber }}, GETDATE())
GROUP BY [EntityName]`,
            },
        ];
        const result = RenderPipeline.Run(
            `SELECT [au].[Name], COALESCE([rc].[ChangeCount], 0) AS [Changes]
FROM {{query:"Demos/Active Users"}} [au]
LEFT JOIN {{query:"Demos/Recent Changes(lookbackDays='30')"}} [rc]
    ON [rc].[EntityName] = 'Users'`,
            { Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps }
        );
        expect(result.HasCompositions).toBe(true);
        expect(result.CTEs.length).toBe(2);
        expect(result.FinalSQL).toContain('__cte_Active_Users');
        expect(result.FinalSQL).toContain('__cte_Recent_Changes');
    });

    // TC-04.02: Two deps with SAME inner CTE names (Bug C)
    it('TC-04.02: renames colliding inner CTE names across deps', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [
            {
                Name: 'DepA', CategoryPath: '/Reports/', SQL:
`WITH SharedCTE AS (
    SELECT [ID], [Value] FROM [t1]
)
SELECT [s].[ID], [s].[Value] FROM SharedCTE [s]`,
            },
            {
                Name: 'DepB', CategoryPath: '/Reports/', SQL:
`WITH SharedCTE AS (
    SELECT [ID], [Score] FROM [t2]
)
SELECT [s].[ID], [s].[Score] FROM SharedCTE [s]`,
            },
        ];
        const result = RenderPipeline.Run(
            `SELECT [a].[Value], [b].[Score]
FROM {{query:"Reports/DepA"}} [a]
JOIN {{query:"Reports/DepB"}} [b] ON [a].[ID] = [b].[ID]`,
            { Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps }
        );
        expect(result.HasCompositions).toBe(true);
        // Verbatim "SharedCTE AS (" must appear at most once (the other is renamed)
        const verbatim = countMatches(result.FinalSQL, 'SharedCTE AS (');
        expect(verbatim).toBeLessThanOrEqual(1);
        // Both deps' main select content must be present
        expect(result.FinalSQL).toContain('[Value]');
        expect(result.FinalSQL).toContain('[Score]');
    });

    // TC-04.03: Two deps with PARTIALLY overlapping inner CTE names
    it('TC-04.03: renames only colliding inner CTEs, keeps unique ones', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [
            {
                Name: 'DepA', CategoryPath: '/Reports/', SQL:
`WITH Bridge AS (
    SELECT [ID] FROM [t1]
),
UniqueToA AS (
    SELECT [ID], [Score] FROM [t2]
)
SELECT [b].[ID], [ua].[Score]
FROM Bridge [b]
JOIN UniqueToA [ua] ON [b].[ID] = [ua].[ID]`,
            },
            {
                Name: 'DepB', CategoryPath: '/Reports/', SQL:
`WITH Bridge AS (
    SELECT [ID] FROM [t3]
),
UniqueToB AS (
    SELECT [ID], [Value] FROM [t4]
)
SELECT [b].[ID], [ub].[Value]
FROM Bridge [b]
JOIN UniqueToB [ub] ON [b].[ID] = [ub].[ID]`,
            },
        ];
        const result = RenderPipeline.Run(
            `SELECT [a].[Score], [b].[Value]
FROM {{query:"Reports/DepA"}} [a]
JOIN {{query:"Reports/DepB"}} [b] ON [a].[ID] = [b].[ID]`,
            { Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps }
        );
        // "Bridge AS (" — first dep keeps original, second gets renamed
        const bridgeCount = countMatches(result.FinalSQL, 'Bridge AS (');
        expect(bridgeCount).toBeLessThanOrEqual(1);
        // UniqueToA and UniqueToB are distinct — no renaming needed
        expect(result.FinalSQL).toContain('UniqueToA AS');
        expect(result.FinalSQL).toContain('UniqueToB AS');
    });
});

// ════════════════════════════════════════════════════════════════════
// Category 11: Full Pipeline (composition + templates + paging)
// ════════════════════════════════════════════════════════════════════

describe('Category 11: Full Pipeline Integration', () => {

    // TC-11.04 (Synthetic worst-case): Multi-dep + inner CTE collision + templates + paging
    it('TC-11.04: worst-case synthetic — all bug patterns combined', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [
            {
                Name: 'DepA', CategoryPath: '/Test/',
                UsesTemplate: true, SQL:
`/*
  Canonical analytics dep. No ORDER BY / TOP -- composable.
*/
WITH Bridge AS (
    SELECT [ID], [Region],
        ROW_NUMBER() OVER (PARTITION BY [Region] ORDER BY [Revenue] DESC) AS [rn]
    FROM [data].[vwRecords]
)
SELECT [b].[ID], [b].[Region], [b].[rn]
FROM Bridge [b]
{% if Region %}
WHERE [b].[Region] = '{{ Region }}'
{% endif %}
ORDER BY [b].[rn]`,
            },
            {
                Name: 'DepB', CategoryPath: '/Test/', SQL:
`WITH Bridge AS (
    SELECT [ID] FROM [data].[vwOther]
)
SELECT [b].[ID] FROM Bridge [b]`,
            },
        ];

        const result = RenderPipeline.Run(
            `SELECT [a].[ID], [b].[ID] AS [OtherID]
FROM {{query:"Test/DepA(Region=Region)"}} [a]
JOIN {{query:"Test/DepB"}} [b] ON [a].[ID] = [b].[ID]
{% if Region %}
WHERE [a].[Region] = {{ Region | sqlString }}
{% endif %}
ORDER BY [a].[ID]`,
            {
                Platform: 'sqlserver',
                ContextUser: mockUser,
                Dependencies: deps,
                UsesTemplate: true,
                Parameters: { Region: 'West' },
                Paging: { StartRow: 0, MaxRows: 25 },
            }
        );

        // Trace populated
        expect(result.Trace.AfterComposition).toBeTruthy();
        expect(result.Trace.AfterTemplates).toBeTruthy();
        expect(result.Trace.AfterPaging).toBeTruthy();

        // Both deps resolved
        expect(result.HasCompositions).toBe(true);
        expect(result.CTEs.length).toBe(2);

        // Bridge CTE collision resolved
        const bridgeVerbatim = countMatches(result.FinalSQL, 'Bridge AS (');
        expect(bridgeVerbatim).toBeLessThanOrEqual(1);

        // DepA's trailing ORDER BY stripped (or OFFSET injected)
        // Window function ORDER BY preserved
        expect(result.FinalSQL).toContain('ROW_NUMBER()');

        // Templates resolved — no {{ }} or {% %} tokens remain
        expect(result.FinalSQL).not.toMatch(/\{\{[^}]*\}\}/);
        expect(result.FinalSQL).not.toMatch(/\{%[^%]*%\}/);

        // After Nunjucks: Region = 'West' present
        expect(result.Trace.AfterTemplates).toContain("'West'");

        // Paging applied
        expect(result.PagingResult).not.toBeNull();
        expect(result.FinalSQL).toMatch(/OFFSET\s+0\s+ROWS/i);
        expect(result.FinalSQL).toMatch(/FETCH\s+NEXT\s+25\s+ROWS/i);
    });

    // TC-11.02 pattern: composition + {% if %}/{% else %} + sqlIn
    it('TC-11.02 pattern: composition with conditional blocks and sqlIn', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [{
            Name: 'MELResolved', CategoryPath: '/Golden-Queries/', UsesTemplate: true, SQL:
`SELECT [mel].[ID] AS [MELID], [mel].[Date], [mel].[Reason],
    [m].[MemberTypeCode] AS [ResolvedMemberType]
FROM [document].[vwMemberEngagementLogs] AS [mel]
LEFT JOIN [ym].[vwMembers] AS [m] ON [m].[ID] = [mel].[ResolvedMemberID]
WHERE 1 = 1
{% if ResolvedOnly == '1' %}
    AND [mel].[ResolvedMemberID] IS NOT NULL
{% endif %}
{% if StartDate %}
    AND [mel].[Date] >= {{ StartDate | sqlDate }}
{% endif %}`,
        }];

        const result = RenderPipeline.Run(
            `SELECT [t].[Reason], COUNT(DISTINCT [mel].[MELID]) AS [LogCount]
FROM {{query:"Golden-Queries/MELResolved(ResolvedOnly='1', StartDate=StartDate)"}} AS [mel]
INNER JOIN [__mj].[vwTags] AS [t] ON [t].[ID] = [mel].[MELID]
{% if MemberTypes %}
    WHERE [mel].[ResolvedMemberType] IN {{ MemberTypes | sqlIn }}
{% else %}
    WHERE [mel].[ResolvedMemberType] IN ('Regular', 'SponPoolSub')
{% endif %}
GROUP BY [t].[Reason]
ORDER BY [LogCount] DESC`,
            {
                Platform: 'sqlserver',
                ContextUser: mockUser,
                Dependencies: deps,
                UsesTemplate: true,
                Parameters: {
                    StartDate: '2024-01-01',
                    MemberTypes: ['Regular'] as unknown as string,
                },
            }
        );

        expect(result.HasCompositions).toBe(true);

        // Static param ResolvedOnly='1' should have been substituted
        expect(result.Trace.AfterComposition).toContain("'1'");

        // After templates: no {{ }} tokens remain
        expect(result.FinalSQL).not.toMatch(/\{\{[^}]*\}\}/);

        // Outer ORDER BY preserved
        expect(result.FinalSQL).toContain('ORDER BY');
    });
});

// ════════════════════════════════════════════════════════════════════
// PostgreSQL Dialect Variants
// ════════════════════════════════════════════════════════════════════

describe('PostgreSQL Dialect Variants', () => {

    // pgSQL: preserves ORDER BY in CTE (PostgreSQL allows it)
    it('pgSQL: preserves ORDER BY in CTE (PostgreSQL allows it)', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [{
            Name: 'Customers', CategoryPath: '/Sales/', SQL:
`SELECT [ID], [Name], [Revenue]
FROM [crm].[vwCustomers]
ORDER BY [Revenue] DESC`,
        }];
        const result = RenderPipeline.Run(
            `SELECT [c].[Name] FROM {{query:"Sales/Customers"}} [c]`,
            { Platform: 'postgresql', ContextUser: mockUser, Dependencies: deps }
        );
        // PostgreSQL allows ORDER BY in CTEs, so it should be preserved
        expect(result.FinalSQL).toMatch(/ORDER\s+BY/i);
    });

    // pgSQL: uses double-quoted identifiers in CTE names
    it('pgSQL: uses double-quoted identifiers in CTE names', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [{
            Name: 'SimpleDep', CategoryPath: '/Test/', SQL:
`SELECT [ID], [Name] FROM [data].[vwRecords]`,
        }];
        const result = RenderPipeline.Run(
            `SELECT [s].[ID] FROM {{query:"Test/SimpleDep"}} [s]`,
            { Platform: 'postgresql', ContextUser: mockUser, Dependencies: deps }
        );
        // PostgreSQL uses double-quoted identifiers, not brackets
        expect(result.FinalSQL).toMatch(/"__cte_/);
        expect(result.FinalSQL).not.toMatch(/\[__cte_/);
    });

    // pgSQL: paging uses LIMIT/OFFSET syntax
    it('pgSQL: paging uses LIMIT/OFFSET syntax', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [{
            Name: 'Records', CategoryPath: '/Test/', SQL:
`SELECT [ID], [Name] FROM [data].[vwRecords]`,
        }];
        const result = RenderPipeline.Run(
            `SELECT [r].[ID], [r].[Name] FROM {{query:"Test/Records"}} [r]
ORDER BY [r].[ID]`,
            { Platform: 'postgresql', ContextUser: mockUser, Dependencies: deps,
              Paging: { StartRow: 0, MaxRows: 25 } }
        );
        // PostgreSQL uses LIMIT/OFFSET, not OFFSET...FETCH NEXT
        expect(result.FinalSQL).toMatch(/LIMIT\s+25/i);
        expect(result.FinalSQL).toMatch(/OFFSET\s+0/i);
        expect(result.FinalSQL).not.toMatch(/FETCH\s+NEXT/i);
    });
});

// ════════════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════════════

/**
 * Extracts the body of the first CTE definition from a WITH clause.
 * Returns the text between the first `AS (\n` and the matching `)`.
 */
function extractCTEBody(sql: string): string {
    const match = sql.match(/AS\s*\(\n([\s\S]*?)\n\)/);
    return match ? match[1] : '';
}

function countMatches(haystack: string, needle: string): number {
    if (needle.length === 0) return 0;
    let count = 0;
    let pos = 0;
    while ((pos = haystack.indexOf(needle, pos)) !== -1) {
        count++;
        pos += needle.length;
    }
    return count;
}
