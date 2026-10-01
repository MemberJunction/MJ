/**
 * rubrics.checks.ts — the 'rubrics' bundle. Deterministic, server transport.
 *
 * Proves the hand-written immutability triggers, not the scoring engine. Raw SQL through
 * ctx.Pool is the point: the triggers are the backstop for any path that bypasses BaseEntity.
 * Every fixture runs inside a transaction that is rolled back. A published version cannot be
 * deleted (51101), and a THROW leaves the transaction doomed, so the fixture must not commit.
 *
 *   R1 — changing PassThreshold on a published version throws 51102. The version table has
 *        no Weight column; PassThreshold is the frozen scoring input 51102 guards.
 *   R2 — moving that version from Published to Retired does not throw.
 *   R3 — inserting a criterion on a published version throws 51103.
 *   R4 — updating a score row after the evaluation is submitted throws 51110.
 *   R5 — deleting a draft version deletes its tree: a parent group, a child criterion,
 *        one criterion-level anchor, and one band. A published version of that same
 *        shape throws 51101 and is not deleted.
 */
import type { ConnectionPool, Transaction } from 'mssql';
import { Assert } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

function poolOf(ctx: IntegrationCheckContext): ConnectionPool {
    if (!ctx.Pool) {
        throw new Error('rubrics checks require the server transport (ctx.Pool). They assert THROW from triggers, which a GraphQL provider cannot surface.');
    }
    return ctx.Pool;
}

function schemaOf(ctx: IntegrationCheckContext): string {
    return ctx.Schema && ctx.Schema.length > 0 ? ctx.Schema : '__mj';
}

async function withRollback(pool: ConnectionPool, body: (tx: Transaction) => Promise<void>): Promise<void> {
    const tx = pool.transaction();
    await tx.begin();
    try {
        await body(tx);
    } finally {
        try { await tx.rollback(); } catch { /* a THROW dooms the transaction; rollback is still the cleanup */ }
    }
}

async function expectThrow(tx: Transaction, statement: string, errorNumber: number): Promise<void> {
    try {
        await tx.request().query(statement);
    } catch (err) {
        const number = (err as { number?: number }).number;
        const message = err instanceof Error ? err.message : String(err);
        Assert(
            number === errorNumber || message.includes(String(errorNumber)),
            `expected SQL error ${errorNumber}, got ${number ?? 'no number'}: ${message}`
        );
        return;
    }
    Assert(false, `expected SQL error ${errorNumber}, but the statement succeeded`);
}

function publishedVersionSql(s: string, tag: string): string {
    return `
        DECLARE @rubric uniqueidentifier = NEWID(), @version uniqueidentifier = NEWID();
        INSERT INTO [${s}].[Rubric] ([ID], [Name]) VALUES (@rubric, N'${tag}');
        INSERT INTO [${s}].[RubricVersion] (
            [ID], [RubricID], [MajorVersion], [MinorVersion], [PatchVersion], [Status],
            [ContentHash], [ScoringHash], [PublishedAt], [AppliedBump]
        ) VALUES (
            @version, @rubric, 1, 0, 0, N'Published',
            N'${tag}-content', N'${tag}-scoring', SYSDATETIMEOFFSET(), N'Initial'
        );
        SELECT CONVERT(nvarchar(36), @version) AS VersionID;
    `;
}

export const RubricsChecks: NamedCheck[] = [
    {
        Id: 'rubrics.R1',
        Name: 'R1: changing PassThreshold on a published version throws 51102',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            const pool = poolOf(ctx);
            const s = schemaOf(ctx);
            const tag = `it-rubrics-r1-${Date.now().toString(36)}`;
            await withRollback(pool, async (tx) => {
                const setup = await tx.request().query(publishedVersionSql(s, tag));
                const versionId = setup.recordset[0].VersionID as string;
                await expectThrow(
                    tx,
                    `UPDATE [${s}].[RubricVersion] SET [PassThreshold] = 0.500000 WHERE [ID] = '${versionId}'`,
                    51102
                );
            });
        },
    },
    {
        Id: 'rubrics.R2',
        Name: 'R2: a published version may move to Retired',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            const pool = poolOf(ctx);
            const s = schemaOf(ctx);
            const tag = `it-rubrics-r2-${Date.now().toString(36)}`;
            await withRollback(pool, async (tx) => {
                const setup = await tx.request().query(publishedVersionSql(s, tag));
                const versionId = setup.recordset[0].VersionID as string;
                await tx.request().query(
                    `UPDATE [${s}].[RubricVersion] SET [Status] = N'Retired', [RetiredAt] = SYSDATETIMEOFFSET() WHERE [ID] = '${versionId}'`
                );
                const status = await tx.request().query(
                    `SELECT [Status] AS Status FROM [${s}].[RubricVersion] WHERE [ID] = '${versionId}'`
                );
                Assert(status.recordset[0].Status === 'Retired', `expected Retired, got ${status.recordset[0].Status}`);
            });
        },
    },
    {
        Id: 'rubrics.R3',
        Name: 'R3: inserting a criterion on a published version throws 51103',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            const pool = poolOf(ctx);
            const s = schemaOf(ctx);
            const tag = `it-rubrics-r3-${Date.now().toString(36)}`;
            await withRollback(pool, async (tx) => {
                const setup = await tx.request().query(publishedVersionSql(s, tag));
                const versionId = setup.recordset[0].VersionID as string;
                await expectThrow(
                    tx,
                    `INSERT INTO [${s}].[RubricCriterion] ([RubricVersionID], [Key], [Name], [NodeType])
                     VALUES ('${versionId}', N'clarity', N'Clarity', N'Group')`,
                    51103
                );
            });
        },
    },
    {
        Id: 'rubrics.R4',
        Name: 'R4: updating a score row after submit throws 51110',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            const pool = poolOf(ctx);
            const s = schemaOf(ctx);
            const tag = `it-rubrics-r4-${Date.now().toString(36)}`;
            await withRollback(pool, async (tx) => {
                const setup = await tx.request().query(`
                    DECLARE @rubric uniqueidentifier = NEWID(),
                            @version uniqueidentifier = NEWID(),
                            @criterion uniqueidentifier = NEWID(),
                            @evaluation uniqueidentifier = NEWID(),
                            @score uniqueidentifier = NEWID(),
                            @entity uniqueidentifier = (SELECT TOP 1 [ID] FROM [${s}].[Entity] ORDER BY [Name]);
                    INSERT INTO [${s}].[Rubric] ([ID], [Name]) VALUES (@rubric, N'${tag}');
                    INSERT INTO [${s}].[RubricVersion] ([ID], [RubricID], [Status])
                        VALUES (@version, @rubric, N'Draft');
                    INSERT INTO [${s}].[RubricCriterion] ([ID], [RubricVersionID], [Key], [Name], [NodeType])
                        VALUES (@criterion, @version, N'clarity', N'Clarity', N'Group');
                    INSERT INTO [${s}].[RubricEvaluation] (
                        [ID], [RubricVersionID], [SubjectEntityID], [SubjectRecordID], [EvaluatorType], [Status]
                    ) VALUES (
                        @evaluation, @version, @entity, N'${tag}', N'Self', N'Draft'
                    );
                    INSERT INTO [${s}].[RubricEvaluationScore] ([ID], [EvaluationID], [CriterionID], [NormalizedScore])
                        VALUES (@score, @evaluation, @criterion, 0.500000);
                    UPDATE [${s}].[RubricEvaluation]
                       SET [Status] = N'Submitted', [SubmittedAt] = SYSDATETIMEOFFSET(), [Outcome] = N'Scored'
                     WHERE [ID] = @evaluation;
                    SELECT CONVERT(nvarchar(36), @score) AS ScoreID;
                `);
                const scoreId = setup.recordset[0].ScoreID as string;
                await expectThrow(
                    tx,
                    `UPDATE [${s}].[RubricEvaluationScore] SET [NormalizedScore] = 0.250000 WHERE [ID] = '${scoreId}'`,
                    51110
                );
            });
        },
    },
    {
        Id: 'rubrics.R5',
        Name: 'R5: deleting a draft version deletes its tree; a published tree throws 51101',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            const pool = poolOf(ctx);
            const s = schemaOf(ctx);
            const treeSql = (tag: string, publish: boolean) => `
                DECLARE @rubric uniqueidentifier = NEWID(),
                        @version uniqueidentifier = NEWID(),
                        @scale uniqueidentifier = NEWID(),
                        @level uniqueidentifier = NEWID(),
                        @parent uniqueidentifier = NEWID(),
                        @child uniqueidentifier = NEWID();
                INSERT INTO [${s}].[RubricScale] ([ID], [Name], [ScaleType]) VALUES (@scale, N'${tag}-scale', N'Levels');
                INSERT INTO [${s}].[RubricScaleLevel] ([ID], [ScaleID], [Label], [Value], [NormalizedValue], [Sequence])
                    VALUES (@level, @scale, N'Proficient', 3, 0.750000, 1);
                INSERT INTO [${s}].[Rubric] ([ID], [Name]) VALUES (@rubric, N'${tag}');
                INSERT INTO [${s}].[RubricVersion] ([ID], [RubricID], [Status]) VALUES (@version, @rubric, N'Draft');
                INSERT INTO [${s}].[RubricCriterion] ([ID], [RubricVersionID], [Key], [Name], [NodeType])
                    VALUES (@parent, @version, N'group', N'Group', N'Group');
                INSERT INTO [${s}].[RubricCriterion] ([ID], [RubricVersionID], [ParentID], [Key], [Name], [NodeType], [ScaleID])
                    VALUES (@child, @version, @parent, N'clarity', N'Clarity', N'Criterion', @scale);
                INSERT INTO [${s}].[RubricCriterionLevel] ([CriterionID], [ScaleLevelID], [Descriptor])
                    VALUES (@child, @level, N'Clear enough to act on');
                INSERT INTO [${s}].[RubricBand] ([RubricVersionID], [Label], [MinScore], [MaxScore])
                    VALUES (@version, N'Proficient', 0.500000, 1.000000);
                ${publish ? `
                UPDATE [${s}].[RubricVersion]
                   SET [Status] = N'Published', [MajorVersion] = 1, [MinorVersion] = 0, [PatchVersion] = 0,
                       [ContentHash] = N'${tag}-content', [ScoringHash] = N'${tag}-scoring',
                       [PublishedAt] = SYSDATETIMEOFFSET(), [AppliedBump] = N'Initial'
                 WHERE [ID] = @version;` : ''}
                SELECT CONVERT(nvarchar(36), @version) AS VersionID;
            `;
            const tag = `it-rubrics-r5-${Date.now().toString(36)}`;
            await withRollback(pool, async (tx) => {
                const setup = await tx.request().query(treeSql(`${tag}-draft`, false));
                const versionId = setup.recordset[0].VersionID as string;
                await tx.request().query(`DELETE FROM [${s}].[RubricVersion] WHERE [ID] = '${versionId}'`);
                const left = await tx.request().query(`
                    SELECT
                        (SELECT COUNT(*) FROM [${s}].[RubricVersion] WHERE [ID] = '${versionId}')
                      + (SELECT COUNT(*) FROM [${s}].[RubricCriterion] WHERE [RubricVersionID] = '${versionId}')
                      + (SELECT COUNT(*) FROM [${s}].[RubricCriterionLevel] cl
                            INNER JOIN [${s}].[RubricCriterion] c ON c.[ID] = cl.[CriterionID]
                          WHERE c.[RubricVersionID] = '${versionId}')
                      + (SELECT COUNT(*) FROM [${s}].[RubricBand] WHERE [RubricVersionID] = '${versionId}') AS N
                `);
                Assert(Number(left.recordset[0].N) === 0, `draft delete left ${left.recordset[0].N} tree rows`);
            });
            await withRollback(pool, async (tx) => {
                const setup = await tx.request().query(treeSql(`${tag}-published`, true));
                const versionId = setup.recordset[0].VersionID as string;
                await expectThrow(
                    tx,
                    `DELETE FROM [${s}].[RubricVersion] WHERE [ID] = '${versionId}'`,
                    51101
                );
            });
        },
    },
];

for (const check of RubricsChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
