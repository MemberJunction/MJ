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
 *   R6 — the other raw-SQL backstops: 51104 descriptors, 51105 bands, 51106 scale
 *        direction, 51107 level value, 51108 deleting a submitted evaluation, 51109
 *        changing one. Together with R1–R5 this is 51101–51110.
 *   R7 — publishing a draft classifies it. The first publish is 1.0.0 Initial.
 *        A later draft that changes a weight is 2.0.0 Major.
 *   R8 — submitting an evaluation runs RubricScoring and stores that result.
 *   R9 — a second submit supersedes the first. Withdrawing the new one is allowed.
 *   R10 — vwRubricEvaluations.CohortMeanScore matches the engine Mean, and a Self
 *        score is counted separately rather than inside that mean.
 */
import type { ConnectionPool, Transaction } from 'mssql';
import { RubricScoring, type RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { getConsensus } from '@memberjunction/rubrics';
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

interface RubricRow {
    NewRecord(): void;
    Save(): Promise<boolean>;
    Load(id: string): Promise<boolean>;
    LatestResult?: { Message?: string };
    ID: string;
    Name?: string;
    Status?: string;
    RubricID?: string;
    BasedOnVersionID?: string | null;
    ScaleID?: string;
    Weight?: number;
    Key?: string;
    NodeType?: string;
    Label?: string;
    Value?: number;
    NormalizedValue?: number;
    Sequence?: number;
    ScaleType?: string;
    RubricVersionID?: string;
    SubjectEntityID?: string;
    SubjectRecordID?: string;
    EvaluatorType?: string;
    EvaluationID?: string;
    CriterionID?: string;
    ScaleLevelID?: string | null;
    SupersedesEvaluationID?: string | null;
    MajorVersion?: number | null;
    MinorVersion?: number | null;
    PatchVersion?: number | null;
    AppliedBump?: string | null;
    NormalizedScore?: number | null;
    Outcome?: string | null;
}

async function rubricRow(ctx: IntegrationCheckContext, entityName: string): Promise<RubricRow> {
    const created = await ctx.Provider.GetEntityObject(entityName, ctx.User) as unknown as RubricRow;
    created.NewRecord();
    return created;
}

async function saveRow(record: RubricRow): Promise<void> {
    const ok = await record.Save();
    Assert(ok === true, record.LatestResult?.Message || 'Save returned false');
}

async function withProviderRollback(ctx: IntegrationCheckContext, body: () => Promise<void>): Promise<void> {
    const provider = ctx.Provider as IntegrationCheckContext['Provider'] & {
        BeginTransaction?: () => Promise<void>;
        RollbackTransaction?: () => Promise<void>;
    };
    if (!provider.BeginTransaction || !provider.RollbackTransaction) {
        throw new Error('The publish and submit checks need a provider transaction so the fixture rolls back.');
    }
    await provider.BeginTransaction();
    try {
        await body();
    } finally {
        try { await provider.RollbackTransaction(); } catch { /* a failed statement can doom the transaction */ }
    }
}

function scoringVersion(ids: { versionId: string; rubricId: string; criterionId: string; scaleId: string; levelId: string }, weight: number): RubricVersionSnapshot {
    return {
        id: ids.versionId,
        rubricId: ids.rubricId,
        notApplicablePolicy: 'ExcludeAndRedistribute',
        scoreDisplayMin: 0,
        scoreDisplayMax: 100,
        nodes: [{
            id: ids.criterionId,
            key: 'clarity',
            name: 'Clarity',
            nodeType: 'Criterion',
            scaleId: ids.scaleId,
            weight,
            isAdvisory: false,
            isGate: false,
            evidenceRequired: false,
            rationaleRequired: false,
            sequence: 0,
        }],
        scales: [{
            id: ids.scaleId,
            scaleType: 'Levels',
            higherIsBetter: true,
            levels: [{ id: ids.levelId, label: 'High', value: 1, normalizedValue: 1, sequence: 0 }],
        }],
        bands: [],
    };
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
    {
        Id: 'rubrics.R6',
        Name: 'R6: raw SQL throws 51104, 51105, 51106, 51107, 51108 and 51109',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            const pool = poolOf(ctx);
            const s = schemaOf(ctx);
            const tag = `it-rubrics-r6-${Date.now().toString(36)}`;
            const setupSql = `
                DECLARE @rubric uniqueidentifier = NEWID(),
                        @version uniqueidentifier = NEWID(),
                        @scale uniqueidentifier = NEWID(),
                        @level uniqueidentifier = NEWID(),
                        @criterion uniqueidentifier = NEWID(),
                        @evaluation uniqueidentifier = NEWID(),
                        @entity uniqueidentifier = (SELECT TOP 1 [ID] FROM [${s}].[Entity] ORDER BY [Name]);
                INSERT INTO [${s}].[RubricScale] ([ID], [Name], [ScaleType]) VALUES (@scale, N'${tag}-scale', N'Levels');
                INSERT INTO [${s}].[RubricScaleLevel] ([ID], [ScaleID], [Label], [Value], [NormalizedValue], [Sequence])
                    VALUES (@level, @scale, N'High', 1, 1.000000, 0);
                INSERT INTO [${s}].[Rubric] ([ID], [Name]) VALUES (@rubric, N'${tag}');
                INSERT INTO [${s}].[RubricVersion] ([ID], [RubricID], [Status]) VALUES (@version, @rubric, N'Draft');
                INSERT INTO [${s}].[RubricCriterion] ([ID], [RubricVersionID], [Key], [Name], [NodeType], [ScaleID])
                    VALUES (@criterion, @version, N'clarity', N'Clarity', N'Criterion', @scale);
                INSERT INTO [${s}].[RubricBand] ([RubricVersionID], [Label], [MinScore], [MaxScore])
                    VALUES (@version, N'High', 0.500000, 1.000000);
                UPDATE [${s}].[RubricVersion]
                   SET [Status] = N'Published', [MajorVersion] = 1, [MinorVersion] = 0, [PatchVersion] = 0,
                       [ContentHash] = N'${tag}-content', [ScoringHash] = N'${tag}-scoring',
                       [PublishedAt] = SYSDATETIMEOFFSET(), [AppliedBump] = N'Initial'
                 WHERE [ID] = @version;
                INSERT INTO [${s}].[RubricEvaluation] (
                    [ID], [RubricVersionID], [SubjectEntityID], [SubjectRecordID], [EvaluatorType], [Status],
                    [SubmittedAt], [Outcome], [NormalizedScore]
                ) VALUES (
                    @evaluation, @version, @entity, N'${tag}', N'Deterministic', N'Submitted',
                    SYSDATETIMEOFFSET(), N'Scored', 1.000000
                );
                SELECT CONVERT(nvarchar(36), @version) AS VersionID,
                       CONVERT(nvarchar(36), @scale) AS ScaleID,
                       CONVERT(nvarchar(36), @level) AS LevelID,
                       CONVERT(nvarchar(36), @criterion) AS CriterionID,
                       CONVERT(nvarchar(36), @evaluation) AS EvaluationID;
            `;
            const cases: { error: number; sql: (ids: Record<string, string>) => string }[] = [
                { error: 51104, sql: (ids) => `INSERT INTO [${s}].[RubricCriterionLevel] ([CriterionID], [AnchorValue], [Descriptor]) VALUES ('${ids.CriterionID}', 0.500000, N'A new anchor')` },
                { error: 51105, sql: (ids) => `INSERT INTO [${s}].[RubricBand] ([RubricVersionID], [Label], [MinScore], [MaxScore]) VALUES ('${ids.VersionID}', N'Low', 0, 0.500000)` },
                { error: 51106, sql: (ids) => `UPDATE [${s}].[RubricScale] SET [HigherIsBetter] = 0 WHERE [ID] = '${ids.ScaleID}'` },
                { error: 51107, sql: (ids) => `UPDATE [${s}].[RubricScaleLevel] SET [Value] = 4 WHERE [ID] = '${ids.LevelID}'` },
                { error: 51108, sql: (ids) => `DELETE FROM [${s}].[RubricEvaluation] WHERE [ID] = '${ids.EvaluationID}'` },
                { error: 51109, sql: (ids) => `UPDATE [${s}].[RubricEvaluation] SET [Narrative] = N'changed' WHERE [ID] = '${ids.EvaluationID}'` },
            ];
            for (const item of cases) {
                await withRollback(pool, async (tx) => {
                    const setup = await tx.request().query(setupSql);
                    const ids = setup.recordset[0] as Record<string, string>;
                    await expectThrow(tx, item.sql(ids), item.error);
                });
            }
        },
    },
    {
        Id: 'rubrics.R7',
        Name: 'R7: the first publish is 1.0.0 Initial and a weight change is 2.0.0 Major',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            const tag = `it-rubrics-r7-${Date.now().toString(36)}`;
            await withProviderRollback(ctx, async () => {
                const rubric = await rubricRow(ctx, 'MJ: Rubrics');
                rubric.Name = tag;
                rubric.Status = 'Active';
                await saveRow(rubric);
                const scale = await rubricRow(ctx, 'MJ: Rubric Scales');
                scale.Name = `${tag}-scale`;
                scale.ScaleType = 'Levels';
                await saveRow(scale);
                const level = await rubricRow(ctx, 'MJ: Rubric Scale Levels');
                level.ScaleID = scale.ID;
                level.Label = 'High';
                level.Value = 1;
                level.NormalizedValue = 1;
                level.Sequence = 0;
                await saveRow(level);
                const version = await rubricRow(ctx, 'MJ: Rubric Versions');
                version.RubricID = rubric.ID;
                version.Status = 'Draft';
                await saveRow(version);
                const criterion = await rubricRow(ctx, 'MJ: Rubric Criteria');
                criterion.RubricVersionID = version.ID;
                criterion.Key = 'clarity';
                criterion.Name = 'Clarity';
                criterion.NodeType = 'Criterion';
                criterion.ScaleID = scale.ID;
                criterion.Weight = 1;
                await saveRow(criterion);
                version.Status = 'Published';
                await saveRow(version);
                Assert(version.MajorVersion === 1 && version.MinorVersion === 0 && version.PatchVersion === 0, `first publish was ${version.MajorVersion}.${version.MinorVersion}.${version.PatchVersion}`);
                Assert(version.AppliedBump === 'Initial', `first publish bump was ${version.AppliedBump}`);
                const next = await rubricRow(ctx, 'MJ: Rubric Versions');
                next.RubricID = rubric.ID;
                next.BasedOnVersionID = version.ID;
                next.Status = 'Draft';
                await saveRow(next);
                const changed = await rubricRow(ctx, 'MJ: Rubric Criteria');
                changed.RubricVersionID = next.ID;
                changed.Key = 'clarity';
                changed.Name = 'Clarity';
                changed.NodeType = 'Criterion';
                changed.ScaleID = scale.ID;
                changed.Weight = 2;
                await saveRow(changed);
                next.Status = 'Published';
                await saveRow(next);
                Assert(next.MajorVersion === 2 && next.MinorVersion === 0 && next.PatchVersion === 0, `weight change published ${next.MajorVersion}.${next.MinorVersion}.${next.PatchVersion}`);
                Assert(next.AppliedBump === 'Major', `weight change bump was ${next.AppliedBump}`);
            });
        },
    },
    {
        Id: 'rubrics.R8',
        Name: 'R8: submit stores the RubricScoring result',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            const pool = poolOf(ctx);
            const s = schemaOf(ctx);
            const tag = `it-rubrics-r8-${Date.now().toString(36)}`;
            const entity = await pool.request().query(`SELECT TOP 1 CONVERT(nvarchar(36), [ID]) AS ID FROM [${s}].[Entity] ORDER BY [Name]`);
            const subjectEntityId = entity.recordset[0].ID as string;
            await withProviderRollback(ctx, async () => {
                const rubric = await rubricRow(ctx, 'MJ: Rubrics');
                rubric.Name = tag;
                rubric.Status = 'Active';
                await saveRow(rubric);
                const scale = await rubricRow(ctx, 'MJ: Rubric Scales');
                scale.Name = `${tag}-scale`;
                scale.ScaleType = 'Levels';
                await saveRow(scale);
                const level = await rubricRow(ctx, 'MJ: Rubric Scale Levels');
                level.ScaleID = scale.ID;
                level.Label = 'High';
                level.Value = 1;
                level.NormalizedValue = 1;
                level.Sequence = 0;
                await saveRow(level);
                const version = await rubricRow(ctx, 'MJ: Rubric Versions');
                version.RubricID = rubric.ID;
                version.Status = 'Draft';
                await saveRow(version);
                const criterion = await rubricRow(ctx, 'MJ: Rubric Criteria');
                criterion.RubricVersionID = version.ID;
                criterion.Key = 'clarity';
                criterion.Name = 'Clarity';
                criterion.NodeType = 'Criterion';
                criterion.ScaleID = scale.ID;
                criterion.Weight = 1;
                await saveRow(criterion);
                version.Status = 'Published';
                await saveRow(version);
                const evaluation = await rubricRow(ctx, 'MJ: Rubric Evaluations');
                evaluation.RubricVersionID = version.ID;
                evaluation.SubjectEntityID = subjectEntityId;
                evaluation.SubjectRecordID = tag;
                evaluation.EvaluatorType = 'Deterministic';
                evaluation.Status = 'Draft';
                await saveRow(evaluation);
                const score = await rubricRow(ctx, 'MJ: Rubric Evaluation Scores');
                score.EvaluationID = evaluation.ID;
                score.CriterionID = criterion.ID;
                score.ScaleLevelID = level.ID;
                await saveRow(score);
                evaluation.Status = 'Submitted';
                await saveRow(evaluation);
                const expected = RubricScoring.compute({
                    version: scoringVersion({
                        versionId: version.ID,
                        rubricId: rubric.ID,
                        criterionId: criterion.ID,
                        scaleId: scale.ID,
                        levelId: level.ID,
                    }, 1),
                    answers: [{ criterionId: criterion.ID, scaleLevelId: level.ID }],
                });
                Assert(Number(evaluation.NormalizedScore) === expected.normalizedScore, `stored score ${evaluation.NormalizedScore}, RubricScoring ${expected.normalizedScore}`);
                Assert(evaluation.Outcome === expected.outcome, `stored outcome ${evaluation.Outcome}, RubricScoring ${expected.outcome}`);
            });
        },
    },
    {
        Id: 'rubrics.R9',
        Name: 'R9: a second submit supersedes the first, and the new one can be withdrawn',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            const pool = poolOf(ctx);
            const s = schemaOf(ctx);
            const tag = `it-rubrics-r9-${Date.now().toString(36)}`;
            const entity = await pool.request().query(`SELECT TOP 1 CONVERT(nvarchar(36), [ID]) AS ID FROM [${s}].[Entity] ORDER BY [Name]`);
            const subjectEntityId = entity.recordset[0].ID as string;
            await withProviderRollback(ctx, async () => {
                const rubric = await rubricRow(ctx, 'MJ: Rubrics');
                rubric.Name = tag;
                rubric.Status = 'Active';
                await saveRow(rubric);
                const scale = await rubricRow(ctx, 'MJ: Rubric Scales');
                scale.Name = `${tag}-scale`;
                scale.ScaleType = 'Levels';
                await saveRow(scale);
                const level = await rubricRow(ctx, 'MJ: Rubric Scale Levels');
                level.ScaleID = scale.ID;
                level.Label = 'High';
                level.Value = 1;
                level.NormalizedValue = 1;
                level.Sequence = 0;
                await saveRow(level);
                const version = await rubricRow(ctx, 'MJ: Rubric Versions');
                version.RubricID = rubric.ID;
                version.Status = 'Draft';
                await saveRow(version);
                const criterion = await rubricRow(ctx, 'MJ: Rubric Criteria');
                criterion.RubricVersionID = version.ID;
                criterion.Key = 'clarity';
                criterion.Name = 'Clarity';
                criterion.NodeType = 'Criterion';
                criterion.ScaleID = scale.ID;
                await saveRow(criterion);
                version.Status = 'Published';
                await saveRow(version);
                const first = await rubricRow(ctx, 'MJ: Rubric Evaluations');
                first.RubricVersionID = version.ID;
                first.SubjectEntityID = subjectEntityId;
                first.SubjectRecordID = tag;
                first.EvaluatorType = 'Deterministic';
                first.Status = 'Draft';
                await saveRow(first);
                const firstScore = await rubricRow(ctx, 'MJ: Rubric Evaluation Scores');
                firstScore.EvaluationID = first.ID;
                firstScore.CriterionID = criterion.ID;
                firstScore.ScaleLevelID = level.ID;
                await saveRow(firstScore);
                first.Status = 'Submitted';
                await saveRow(first);
                const second = await rubricRow(ctx, 'MJ: Rubric Evaluations');
                second.RubricVersionID = version.ID;
                second.SubjectEntityID = subjectEntityId;
                second.SubjectRecordID = tag;
                second.EvaluatorType = 'Deterministic';
                second.SupersedesEvaluationID = first.ID;
                second.Status = 'Draft';
                await saveRow(second);
                const secondScore = await rubricRow(ctx, 'MJ: Rubric Evaluation Scores');
                secondScore.EvaluationID = second.ID;
                secondScore.CriterionID = criterion.ID;
                secondScore.ScaleLevelID = level.ID;
                await saveRow(secondScore);
                second.Status = 'Submitted';
                await saveRow(second);
                const prior = await ctx.Provider.GetEntityObject('MJ: Rubric Evaluations', ctx.User) as unknown as RubricRow;
                await prior.Load(first.ID);
                Assert(prior.Status === 'Superseded', `the first evaluation was ${prior.Status}`);
                Assert(second.Status === 'Submitted', `the replacement was ${second.Status}`);
                second.Status = 'Withdrawn';
                await saveRow(second);
                Assert(second.Status === 'Withdrawn', `withdraw left the status ${second.Status}`);
            });
        },
    },
    {
        Id: 'rubrics.R10',
        Name: 'R10: the cohort mean matches the engine Mean and leaves Self out',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            const pool = poolOf(ctx);
            const s = schemaOf(ctx);
            const tag = `it-rubrics-r10-${Date.now().toString(36)}`;
            await withRollback(pool, async (tx) => {
                const setup = await tx.request().query(`
                    DECLARE @rubric uniqueidentifier = NEWID(),
                            @version uniqueidentifier = NEWID(),
                            @entity uniqueidentifier = (SELECT TOP 1 [ID] FROM [${s}].[Entity] ORDER BY [Name]),
                            @low uniqueidentifier = NEWID(),
                            @high uniqueidentifier = NEWID(),
                            @self uniqueidentifier = NEWID();
                    INSERT INTO [${s}].[Rubric] ([ID], [Name]) VALUES (@rubric, N'${tag}');
                    INSERT INTO [${s}].[RubricVersion] (
                        [ID], [RubricID], [MajorVersion], [MinorVersion], [PatchVersion], [Status],
                        [ContentHash], [ScoringHash], [PublishedAt], [AppliedBump]
                    ) VALUES (
                        @version, @rubric, 1, 0, 0, N'Published',
                        N'${tag}-content', N'${tag}-scoring', SYSDATETIMEOFFSET(), N'Initial'
                    );
                    INSERT INTO [${s}].[RubricEvaluation] (
                        [ID], [RubricVersionID], [SubjectEntityID], [SubjectRecordID], [EvaluatorType], [Status],
                        [SubmittedAt], [Outcome], [NormalizedScore]
                    ) VALUES
                        (@low, @version, @entity, N'${tag}', N'Deterministic', N'Submitted', SYSDATETIMEOFFSET(), N'Scored', 0.200000),
                        (@high, @version, @entity, N'${tag}', N'Deterministic', N'Submitted', SYSDATETIMEOFFSET(), N'Scored', 0.800000),
                        (@self, @version, @entity, N'${tag}', N'Self', N'Submitted', SYSDATETIMEOFFSET(), N'Scored', 1.000000);
                    SELECT CONVERT(nvarchar(36), @low) AS LowID;
                `);
                const lowId = setup.recordset[0].LowID as string;
                const view = await tx.request().query(`
                    SELECT [CohortMeanScore] AS MeanScore, [SelfAssessmentCount] AS SelfCount
                    FROM [${s}].[vwRubricEvaluations]
                    WHERE [ID] = '${lowId}'
                `);
                const engine = getConsensus([0.2, 0.8], 'Mean');
                const viewMean = Number(view.recordset[0].MeanScore);
                Assert(engine.overall !== null && Math.abs(viewMean - engine.overall) < 0.000001, `view mean ${viewMean}, engine mean ${engine.overall}`);
                Assert(Number(view.recordset[0].SelfCount) === 1, `SelfAssessmentCount was ${view.recordset[0].SelfCount}`);
            });
        },
    },
];

for (const check of RubricsChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
