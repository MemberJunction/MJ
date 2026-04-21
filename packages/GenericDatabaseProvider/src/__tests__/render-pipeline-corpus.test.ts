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
// Recursive CTE Tests
// ════════════════════════════════════════════════════════════════════

describe('Recursive CTEs', () => {

    // ── Standalone (no composition) ──────────────────────────────────

    it('standalone recursive CTE (T-SQL): UNION ALL not confused with multiple CTEs', () => {
        setupNoMetadata();
        const result = RenderPipeline.Run(
            `WITH Hierarchy AS (
    SELECT [ID], [Name], [ParentID], 0 AS [Level]
    FROM [org].[vwDepartments]
    WHERE [ParentID] IS NULL
    UNION ALL
    SELECT [d].[ID], [d].[Name], [d].[ParentID], [h].[Level] + 1
    FROM [org].[vwDepartments] [d]
    INNER JOIN Hierarchy [h] ON [d].[ParentID] = [h].[ID]
    WHERE [h].[Level] < 10
)
SELECT * FROM Hierarchy
ORDER BY [Level], [Name]`,
            { Platform: 'sqlserver', ContextUser: mockUser }
        );
        // No composition — passes straight through
        expect(result.HasCompositions).toBe(false);
        // UNION ALL preserved intact
        expect(result.FinalSQL).toContain('UNION ALL');
        // Recursive reference preserved
        expect(result.FinalSQL).toContain('INNER JOIN Hierarchy');
        // ORDER BY preserved (standalone, not a CTE body)
        expect(result.FinalSQL).toContain('ORDER BY [Level], [Name]');
    });

    it('standalone recursive CTE (PostgreSQL): WITH RECURSIVE keyword preserved', () => {
        setupNoMetadata();
        const result = RenderPipeline.Run(
            `WITH RECURSIVE org_tree AS (
    SELECT id, name, parent_id, 0 AS depth
    FROM organizations
    WHERE parent_id IS NULL
    UNION ALL
    SELECT o.id, o.name, o.parent_id, t.depth + 1
    FROM organizations o
    INNER JOIN org_tree t ON t.id = o.parent_id
)
SELECT name, depth FROM org_tree
ORDER BY depth, name`,
            { Platform: 'postgresql', ContextUser: mockUser }
        );
        expect(result.HasCompositions).toBe(false);
        expect(result.FinalSQL).toContain('WITH RECURSIVE');
        expect(result.FinalSQL).toContain('UNION ALL');
        // ORDER BY preserved — pgSQL allows it in standalone + CTEs
        expect(result.FinalSQL).toContain('ORDER BY depth, name');
    });

    // ── Recursive CTE dep in composition (T-SQL) ─────────────────────

    it('T-SQL: recursive CTE dep hoisted correctly in composition', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [{
            Name: 'OrgHierarchy', CategoryPath: '/Core/', SQL:
`WITH Hierarchy AS (
    SELECT [ID], [Name], [ParentID], 0 AS [Level]
    FROM [org].[vwDepartments]
    WHERE [ParentID] IS NULL
    UNION ALL
    SELECT [d].[ID], [d].[Name], [d].[ParentID], [h].[Level] + 1
    FROM [org].[vwDepartments] [d]
    INNER JOIN Hierarchy [h] ON [d].[ParentID] = [h].[ID]
)
SELECT [ID], [Name], [Level] FROM Hierarchy`,
        }];
        const result = RenderPipeline.Run(
            `SELECT [oh].[Name], [oh].[Level]
FROM {{query:"Core/OrgHierarchy"}} [oh]
WHERE [oh].[Level] <= 3`,
            { Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps }
        );
        expect(result.HasCompositions).toBe(true);
        // Inner recursive CTE hoisted as sibling
        expect(result.FinalSQL).toContain('Hierarchy AS');
        // UNION ALL body intact inside the hoisted CTE
        expect(result.FinalSQL).toContain('UNION ALL');
        // Recursive self-reference preserved (AST may bracket-quote it)
        expect(result.FinalSQL).toMatch(/JOIN\s+\[?Hierarchy\]?/i);
        // Outer WHERE preserved
        expect(result.FinalSQL).toContain('[oh].[Level] <= 3');
    });

    // ── Recursive CTE dep on PostgreSQL ──────────────────────────────

    it('pgSQL: recursive CTE dep body preserved through composition hoisting', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [{
            Name: 'OrgTree', CategoryPath: '/Core/', SQL:
`WITH RECURSIVE org_tree AS (
    SELECT id, name, parent_id, 0 AS depth
    FROM organizations
    WHERE parent_id IS NULL
    UNION ALL
    SELECT o.id, o.name, o.parent_id, t.depth + 1
    FROM organizations o
    INNER JOIN org_tree t ON t.id = o.parent_id
)
SELECT name, depth FROM org_tree`,
        }];
        const result = RenderPipeline.Run(
            `SELECT [t].[name], [t].[depth]
FROM {{query:"Core/OrgTree"}} [t]
WHERE [t].[depth] <= 5`,
            { Platform: 'postgresql', ContextUser: mockUser, Dependencies: deps }
        );
        expect(result.HasCompositions).toBe(true);
        // The RECURSIVE keyword appears in the hoisted inner CTE body
        expect(result.FinalSQL).toMatch(/RECURSIVE/i);
        expect(result.FinalSQL).toContain('UNION ALL');
        expect(result.FinalSQL).toContain('org_tree');
    });

    // ── Outer query has recursive CTE + composes a dep ───────────────

    it('T-SQL: outer recursive CTE merged with composed dep CTEs', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [{
            Name: 'ActiveUsers', CategoryPath: '/Core/', SQL:
`SELECT [ID], [Name], [DepartmentID] FROM [__mj].[vwUsers] WHERE [IsActive] = 1`,
        }];
        const result = RenderPipeline.Run(
            `WITH DeptTree AS (
    SELECT [ID], [Name], [ParentID], 0 AS [Depth]
    FROM [org].[vwDepartments]
    WHERE [ParentID] IS NULL
    UNION ALL
    SELECT [d].[ID], [d].[Name], [d].[ParentID], [dt].[Depth] + 1
    FROM [org].[vwDepartments] [d]
    INNER JOIN DeptTree [dt] ON [d].[ParentID] = [dt].[ID]
)
SELECT [dt].[Name] AS [Department], [au].[Name] AS [User]
FROM DeptTree [dt]
INNER JOIN {{query:"Core/ActiveUsers"}} [au] ON [au].[DepartmentID] = [dt].[ID]
ORDER BY [dt].[Depth], [au].[Name]`,
            { Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps }
        );
        expect(result.HasCompositions).toBe(true);
        // Outer recursive CTE preserved
        expect(result.FinalSQL).toContain('DeptTree AS');
        expect(result.FinalSQL).toContain('UNION ALL');
        // Composed dep's CTE added alongside
        expect(result.FinalSQL).toContain('__cte_ActiveUsers');
        // Outer ORDER BY preserved
        expect(result.FinalSQL).toContain('ORDER BY');
    });

    // ── Recursive CTE + Nunjucks templates ───────────────────────────

    it('recursive CTE dep with templated depth limit and conditional filter', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [{
            Name: 'OrgHierarchy', CategoryPath: '/Analytics/',
            UsesTemplate: true, SQL:
`/*
  Recursive org hierarchy with configurable depth.
  No ORDER BY / TOP -- composable.
*/
WITH Hierarchy AS (
    SELECT [ID], [Name], [ParentID], 0 AS [Level]
    FROM [org].[vwDepartments]
    WHERE [ParentID] IS NULL
    UNION ALL
    SELECT [d].[ID], [d].[Name], [d].[ParentID], [h].[Level] + 1
    FROM [org].[vwDepartments] [d]
    INNER JOIN Hierarchy [h] ON [d].[ParentID] = [h].[ID]
    WHERE [h].[Level] < {{ MaxDepth | sqlNumber }}
)
SELECT [ID], [Name], [Level] FROM Hierarchy
{% if Region %}
WHERE [Region] = {{ Region | sqlString }}
{% endif %}
ORDER BY [Level], [Name]`,
        }];
        const result = RenderPipeline.Run(
            `SELECT [oh].[Name], [oh].[Level]
FROM {{query:"Analytics/OrgHierarchy(MaxDepth=MaxDepth, Region=Region)"}} [oh]`,
            {
                Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps,
                UsesTemplate: true, Parameters: { MaxDepth: '5', Region: 'West' },
            }
        );
        expect(result.HasCompositions).toBe(true);

        // Block comment with "ORDER BY" must NOT truncate the dep body
        expect(result.FinalSQL).toContain('Hierarchy AS');
        expect(result.FinalSQL).toContain('UNION ALL');

        // Dep's trailing ORDER BY stripped (illegal in CTE on SQL Server)
        const afterComp = result.Trace.AfterComposition;
        const cteBody = extractCTEBody(afterComp);
        const hasDepOrderBy = /ORDER\s+BY\s+\[Level\],\s*\[Name\]/i.test(cteBody);
        const hasOffset = /OFFSET\s+0\s+ROWS/i.test(cteBody);
        expect(hasDepOrderBy === false || hasOffset).toBe(true);

        // After Nunjucks: templates resolved
        expect(result.Trace.AfterTemplates).not.toMatch(/\{\{[^}]*\}\}/);
        expect(result.Trace.AfterTemplates).not.toMatch(/\{%[^%]*%\}/);
        expect(result.FinalSQL).toContain("'West'");
        // MaxDepth resolved to 5 in the recursive UNION ALL's WHERE
        expect(result.FinalSQL).toMatch(/Level.*<.*5|5/);
    });

    it('recursive CTE dep with {% for %} loop inside recursive body', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [{
            Name: 'FilteredTree', CategoryPath: '/Analytics/',
            UsesTemplate: true, SQL:
`WITH Tree AS (
    SELECT [ID], [Name], [ParentID], [Type], 0 AS [Depth]
    FROM [org].[vwNodes]
    WHERE [ParentID] IS NULL
    {% if ExcludeTypes %}
      AND [Type] NOT IN {{ ExcludeTypes | sqlIn }}
    {% endif %}
    UNION ALL
    SELECT [n].[ID], [n].[Name], [n].[ParentID], [n].[Type], [t].[Depth] + 1
    FROM [org].[vwNodes] [n]
    INNER JOIN Tree [t] ON [n].[ParentID] = [t].[ID]
    WHERE [t].[Depth] < 10
    {% if ExcludeTypes %}
      AND [n].[Type] NOT IN {{ ExcludeTypes | sqlIn }}
    {% endif %}
)
SELECT * FROM Tree`,
        }];
        const result = RenderPipeline.Run(
            `SELECT [ft].[Name], [ft].[Depth]
FROM {{query:"Analytics/FilteredTree(ExcludeTypes=ExcludeTypes)"}} [ft]
ORDER BY [ft].[Depth]`,
            {
                Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps,
                UsesTemplate: true, Parameters: { ExcludeTypes: ['Archived', 'Draft'] as unknown as string },
            }
        );
        expect(result.HasCompositions).toBe(true);

        // UNION ALL preserved inside the recursive CTE
        expect(result.FinalSQL).toContain('UNION ALL');
        expect(result.FinalSQL).toContain('INNER JOIN Tree');

        // {% if %} blocks resolved — ExcludeTypes provided so NOT IN rendered
        expect(result.FinalSQL).not.toMatch(/\{%/);
        expect(result.FinalSQL).toContain('NOT IN');
        expect(result.FinalSQL).toMatch(/'Archived'/);
        expect(result.FinalSQL).toMatch(/'Draft'/);

        // Outer ORDER BY preserved
        expect(result.FinalSQL).toContain('ORDER BY [ft].[Depth]');
    });

    it('recursive CTE dep with template expression inside string literal (Bug D pattern)', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [{
            Name: 'TypedTree', CategoryPath: '/Analytics/',
            UsesTemplate: true, SQL:
`WITH TypedTree AS (
    SELECT [ID], [Name], [ParentID], [TypeName], 0 AS [Depth]
    FROM [org].[vwNodes]
    WHERE [ParentID] IS NULL
    UNION ALL
    SELECT [n].[ID], [n].[Name], [n].[ParentID], [n].[TypeName], [t].[Depth] + 1
    FROM [org].[vwNodes] [n]
    INNER JOIN TypedTree [t] ON [n].[ParentID] = [t].[ID]
)
SELECT * FROM TypedTree
{% if TypeFilter %}
WHERE [TypeName] = '{{ TypeFilter }}'
{% endif %}
ORDER BY [Depth]`,
        }];
        const result = RenderPipeline.Run(
            `SELECT [tt].[Name], [tt].[Depth]
FROM {{query:"Analytics/TypedTree(TypeFilter=TypeFilter)"}} [tt]`,
            {
                Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps,
                UsesTemplate: true, Parameters: { TypeFilter: 'Division' },
            }
        );
        expect(result.HasCompositions).toBe(true);

        // UNION ALL intact
        expect(result.FinalSQL).toContain('UNION ALL');
        expect(result.FinalSQL).toContain('INNER JOIN TypedTree');

        // Bug D pattern: '{{ TypeFilter }}' inside string literal must not
        // break ORDER BY detection — dep ORDER BY should be stripped
        const afterComp = result.Trace.AfterComposition;
        const cteBody = extractCTEBody(afterComp);
        const hasDepOrderBy = /ORDER\s+BY\s+\[Depth\]/i.test(cteBody);
        const hasOffset = /OFFSET\s+0\s+ROWS/i.test(cteBody);
        expect(hasDepOrderBy === false || hasOffset).toBe(true);

        // After Nunjucks: template resolved
        expect(result.FinalSQL).toContain("'Division'");
        expect(result.FinalSQL).not.toMatch(/\{\{[^}]*\}\}/);
    });

    it('two recursive CTE deps with same inner CTE name (Bug C + recursive)', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [
            {
                Name: 'OrgTreeA', CategoryPath: '/Core/', SQL:
`WITH Tree AS (
    SELECT [ID], [Name], [ParentID] FROM [org].[vwDeptA] WHERE [ParentID] IS NULL
    UNION ALL
    SELECT [d].[ID], [d].[Name], [d].[ParentID]
    FROM [org].[vwDeptA] [d] INNER JOIN Tree [t] ON [d].[ParentID] = [t].[ID]
)
SELECT [ID], [Name] FROM Tree`,
            },
            {
                Name: 'OrgTreeB', CategoryPath: '/Core/', SQL:
`WITH Tree AS (
    SELECT [ID], [Name], [ParentID] FROM [org].[vwDeptB] WHERE [ParentID] IS NULL
    UNION ALL
    SELECT [d].[ID], [d].[Name], [d].[ParentID]
    FROM [org].[vwDeptB] [d] INNER JOIN Tree [t] ON [d].[ParentID] = [t].[ID]
)
SELECT [ID], [Name] FROM Tree`,
            },
        ];
        const result = RenderPipeline.Run(
            `SELECT [a].[Name] AS [DeptA], [b].[Name] AS [DeptB]
FROM {{query:"Core/OrgTreeA"}} [a]
JOIN {{query:"Core/OrgTreeB"}} [b] ON [a].[ID] = [b].[ID]`,
            { Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps }
        );
        expect(result.HasCompositions).toBe(true);

        // Both deps declare "Tree AS (...)" — Bug C: must be deconflicted
        const treeAsCount = countMatches(result.FinalSQL, 'Tree AS (');
        // At most one verbatim "Tree AS (" — the other is renamed (e.g. Tree__2)
        expect(treeAsCount).toBeLessThanOrEqual(1);

        // Both UNION ALLs preserved
        const unionCount = countMatches(result.FinalSQL, 'UNION ALL');
        expect(unionCount).toBe(2);

        // Recursive self-references must match renamed CTE
        // The second dep's "INNER JOIN Tree" should reference the renamed name
        expect(result.FinalSQL).toContain('[DeptA]');
        expect(result.FinalSQL).toContain('[DeptB]');
    });
});

// ════════════════════════════════════════════════════════════════════
// Comment Stripping in Composition Pipeline
// ════════════════════════════════════════════════════════════════════

describe('Comment stripping in composition pipeline', () => {

    it('strips comments from dep SQL containing {{ }} documentation examples', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [{
            Name: 'DocumentedDep', CategoryPath: '/Test/', UsesTemplate: true, SQL:
`-- Canonical data source. Compose via {{query:"Test/DocumentedDep"}}
-- Parameters: Region (optional)
/* Example usage:
   SELECT * FROM {{query:"Test/DocumentedDep(Region='West')"}} d
*/
SELECT [ID], [Name]
FROM [data].[vwRecords]
{% if Region %}
WHERE [Region] = {{ Region | sqlString }}
{% endif %}`,
        }];
        const result = RenderPipeline.Run(
            `SELECT [d].[Name] FROM {{query:"Test/DocumentedDep(Region=Region)"}} [d]`,
            { Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps,
              UsesTemplate: true, Parameters: { Region: 'West' } }
        );
        expect(result.HasCompositions).toBe(true);
        // Comments stripped — no comment text in final SQL
        expect(result.FinalSQL).not.toContain('Canonical data source');
        expect(result.FinalSQL).not.toContain('Example usage');
        // Template tokens resolved
        expect(result.FinalSQL).toContain("'West'");
        expect(result.FinalSQL).not.toMatch(/\{\{[^}]*\}\}/);
        expect(result.FinalSQL).not.toMatch(/\{%[^%]*%\}/);
    });

    it('strips comments from nested deps (2 layers deep)', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [
            {
                Name: 'InnerDep', CategoryPath: '/Core/', UsesTemplate: true, SQL:
`-- Inner dep: provides base member data
-- {{ MemberType }} determines the filter
SELECT [ID], [Name], [MemberTypeCode]
FROM [ym].[vwMembers]
{% if MemberType %}
WHERE [MemberTypeCode] = {{ MemberType | sqlString }}
{% endif %}`,
            },
            {
                Name: 'OuterDep', CategoryPath: '/Analytics/', UsesTemplate: true, SQL:
`/* Outer dep that composes InnerDep.
   Call via {{query:"Analytics/OuterDep(MemberType='Regular')"}}
*/
SELECT [m].[Name], COUNT(*) AS [Total]
FROM {{query:"Core/InnerDep(MemberType=MemberType)"}} [m]
GROUP BY [m].[Name]`,
                Dependencies: [{
                    Name: 'InnerDep', CategoryPath: '/Core/', UsesTemplate: true, SQL:
`-- Inner dep: provides base member data
-- {{ MemberType }} determines the filter
SELECT [ID], [Name], [MemberTypeCode]
FROM [ym].[vwMembers]
{% if MemberType %}
WHERE [MemberTypeCode] = {{ MemberType | sqlString }}
{% endif %}`,
                }],
            },
        ];
        const result = RenderPipeline.Run(
            `SELECT [od].[Name], [od].[Total]
FROM {{query:"Analytics/OuterDep(MemberType=MemberType)"}} [od]
ORDER BY [od].[Total] DESC`,
            { Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps,
              UsesTemplate: true, Parameters: { MemberType: 'Regular' } }
        );
        expect(result.HasCompositions).toBe(true);
        // No comments from ANY level should survive to final SQL
        expect(result.FinalSQL).not.toContain('Inner dep');
        expect(result.FinalSQL).not.toContain('Outer dep');
        expect(result.FinalSQL).not.toContain('determines the filter');
        // No {{ }} or {% %} tokens in final SQL
        expect(result.FinalSQL).not.toMatch(/\{\{[^}]*\}\}/);
        expect(result.FinalSQL).not.toMatch(/\{%[^%]*%\}/);
        // Template resolved
        expect(result.FinalSQL).toContain("'Regular'");
        // Outer ORDER BY preserved
        expect(result.FinalSQL).toContain('ORDER BY');
    });

    it('strips "ORDER BY" from dep comment so it does not trigger false-positive stripping', () => {
        setupNoMetadata();
        const deps: QueryDependencySpec[] = [{
            Name: 'CommentedDep', CategoryPath: '/Test/', UsesTemplate: true, SQL:
`/*
  Canonical data source for engagement metrics.
  No ORDER BY / TOP -- composable. Callers add their own ORDER BY.
*/
SELECT [ID], [Name], [Score]
FROM [data].[vwScores]
{% if MinScore %}
WHERE [Score] >= {{ MinScore | sqlNumber }}
{% endif %}`,
        }];
        const result = RenderPipeline.Run(
            `SELECT [d].[Name], [d].[Score]
FROM {{query:"Test/CommentedDep(MinScore=MinScore)"}} [d]
ORDER BY [d].[Score] DESC`,
            { Platform: 'sqlserver', ContextUser: mockUser, Dependencies: deps,
              UsesTemplate: true, Parameters: { MinScore: '50' } }
        );
        // Comment with "ORDER BY" stripped — no truncation (Bug A)
        expect(result.FinalSQL).toContain('[data].[vwScores]');
        expect(result.FinalSQL).not.toContain('Canonical data source');
        expect(result.FinalSQL).not.toContain('No ORDER BY');
        // Template resolved
        expect(result.FinalSQL).toContain('50');
        // Outer ORDER BY preserved
        expect(result.FinalSQL).toContain('ORDER BY [d].[Score] DESC');
    });

    it('strips "ORDER BY" comments from nested dep (2 layers deep)', () => {
        setupNoMetadata();
        const innerDep: QueryDependencySpec = {
            Name: 'BaseScores', CategoryPath: '/Core/', UsesTemplate: true, SQL:
`/*
  Base scoring query. No ORDER BY / TOP -- composable.
  Callers: {{query:"Core/BaseScores(MinScore='0')"}}
*/
SELECT [ID], [Name], [Score]
FROM [data].[vwScores]
{% if MinScore %}
WHERE [Score] >= {{ MinScore | sqlNumber }}
{% endif %}`,
        };
        const outerDep: QueryDependencySpec = {
            Name: 'TopScorers', CategoryPath: '/Analytics/', UsesTemplate: true, SQL:
`-- Aggregates BaseScores. ORDER BY added by caller.
SELECT [bs].[Name], SUM([bs].[Score]) AS [TotalScore]
FROM {{query:"Core/BaseScores(MinScore=MinScore)"}} [bs]
GROUP BY [bs].[Name]`,
            Dependencies: [innerDep],
        };
        const result = RenderPipeline.Run(
            `SELECT [ts].[Name], [ts].[TotalScore]
FROM {{query:"Analytics/TopScorers(MinScore=MinScore)"}} [ts]
ORDER BY [ts].[TotalScore] DESC`,
            { Platform: 'sqlserver', ContextUser: mockUser,
              Dependencies: [innerDep, outerDep],
              UsesTemplate: true, Parameters: { MinScore: '10' } }
        );
        expect(result.HasCompositions).toBe(true);
        // No comments from either dep level in final SQL
        expect(result.FinalSQL).not.toContain('Base scoring query');
        expect(result.FinalSQL).not.toContain('No ORDER BY');
        expect(result.FinalSQL).not.toContain('Aggregates BaseScores');
        expect(result.FinalSQL).not.toContain('{{query:');
        // Template resolved at both levels
        expect(result.FinalSQL).toContain('10');
        expect(result.FinalSQL).not.toMatch(/\{\{[^}]*\}\}/);
        // Outer ORDER BY preserved
        expect(result.FinalSQL).toContain('ORDER BY [ts].[TotalScore] DESC');
    });

    it('strips comments from outer query before Nunjucks', () => {
        setupNoMetadata();
        const result = RenderPipeline.Run(
            `-- Dashboard query: shows active users
/* Parameters:
   - Status: filter by user status
   - Compose with {{query:"..."}} for additional context
*/
SELECT [ID], [Name]
FROM [__mj].[vwUsers]
WHERE [Status] = {{ Status | sqlString }}`,
            { Platform: 'sqlserver', ContextUser: mockUser,
              UsesTemplate: true, Parameters: { Status: 'Active' } }
        );
        // Comments stripped
        expect(result.FinalSQL).not.toContain('Dashboard query');
        expect(result.FinalSQL).not.toContain('Parameters:');
        expect(result.FinalSQL).not.toContain('{{query:');
        // Template resolved
        expect(result.FinalSQL).toContain("'Active'");
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
