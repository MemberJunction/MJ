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
import { MJRubricBandEntity, MJRubricCriterionLevelEntity, MJRubricEvaluationEntity, MJRubricEvaluationScoreEntity } from '@memberjunction/core-entities';
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
    IsGate?: boolean;
    GateMinimumScore?: number | null;
    NotApplicablePolicy?: string;
    PassThreshold?: number | null;
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
    EvaluatorUserID?: string | null;
    CategoryID?: string | null;
    Description?: string | null;
    TypeID?: string;
    Configuration?: string | null;
    ExpectedOutcomes?: string | null;
    InputDefinition?: string | null;
    Purpose?: string;
    IsDefault?: boolean;
    AgentID?: string;
    Rationale?: string | null;
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

const IT_WORLD = {
    category: 'IT World — Agent quality',
    agent: 'IT World — Reviewed agent',
    test: 'IT World — Judged test',
    rubric: 'IT World — Agent evaluation',
};

function sqlText(value: string): string {
    return value.replace(/'/g, "''");
}

async function idByName(ctx: IntegrationCheckContext, table: string, name: string): Promise<string | null> {
    const found = await poolOf(ctx).request().query(`SELECT TOP 1 CONVERT(nvarchar(36), [ID]) AS ID FROM [${schemaOf(ctx)}].[${table}] WHERE [Name] = N'${sqlText(name)}'`);
    return (found.recordset[0]?.ID as string | undefined) ?? null;
}

/**
 * The durable world a person can open. Creates are provider saves. Reads only
 * look up the stable names. Product-agent links on this rubric are disabled.
 */
async function ensureItWorld(ctx: IntegrationCheckContext): Promise<void> {
    const pool = poolOf(ctx);
    const s = schemaOf(ctx);
    const foundRubricId = await idByName(ctx, 'Rubric', IT_WORLD.rubric);
    Assert(foundRubricId !== null, 'the IT world rubric exists before its attachments');
    const rubricId = foundRubricId ?? '';

    let categoryId = await idByName(ctx, 'RubricCategory', IT_WORLD.category);
    if (!categoryId) {
        const category = await rubricRow(ctx, 'MJ: Rubric Categories');
        category.Name = IT_WORLD.category;
        category.Description = 'Criteria for judging an agent run.';
        await saveRow(category);
        categoryId = category.ID;
    }
    const categoryKey = categoryId ?? '';
    const rubric = await rubricRow(ctx, 'MJ: Rubrics');
    await rubric.Load(rubricId);
    if ((rubric.CategoryID ?? '').toLowerCase() !== categoryKey.toLowerCase()) {
        rubric.CategoryID = categoryKey;
        await saveRow(rubric);
    }

    let agentId = await idByName(ctx, 'AIAgent', IT_WORLD.agent);
    if (!agentId) {
        const agent = await rubricRow(ctx, 'MJ: AI Agents');
        agent.Name = IT_WORLD.agent;
        agent.Description = 'The agent the IT world rubric reviews.';
        agent.Status = 'Active';
        await saveRow(agent);
        agentId = agent.ID;
    }
    const reviewedAgentId = agentId ?? '';

    const links = await pool.request().query(`
        SELECT CONVERT(nvarchar(36), ar.[ID]) AS ID, a.[Name] AS AgentName, ar.[Status] AS Status, ar.[IsDefault] AS IsDefault
        FROM [${s}].[AIAgentRubric] ar
        INNER JOIN [${s}].[AIAgent] a ON a.[ID] = ar.[AgentID]
        WHERE ar.[RubricID] = '${rubricId}' AND ar.[Purpose] = N'Evaluation'
    `);
    for (const link of links.recordset as { ID: string; AgentName: string; Status: string; IsDefault: boolean | number }[]) {
        if (link.AgentName === IT_WORLD.agent) continue;
        if (link.Status === 'Disabled' && !link.IsDefault) continue;
        const row = await rubricRow(ctx, 'MJ: AI Agent Rubrics');
        await row.Load(link.ID);
        row.Status = 'Disabled';
        row.IsDefault = false;
        await saveRow(row);
    }
    const own = (links.recordset as { ID: string; AgentName: string; Status: string; IsDefault: boolean | number }[]).find(link => link.AgentName === IT_WORLD.agent);
    if (!own) {
        const link = await rubricRow(ctx, 'MJ: AI Agent Rubrics');
        link.AgentID = reviewedAgentId;
        link.RubricID = rubricId;
        link.Purpose = 'Evaluation';
        link.Status = 'Active';
        link.IsDefault = true;
        await saveRow(link);
    } else if (own.Status !== 'Active' || !own.IsDefault) {
        const row = await rubricRow(ctx, 'MJ: AI Agent Rubrics');
        await row.Load(own.ID);
        row.Status = 'Active';
        row.IsDefault = true;
        await saveRow(row);
    }

    const type = await pool.request().query(`SELECT TOP 1 CONVERT(nvarchar(36), [ID]) AS ID FROM [${s}].[TestType] WHERE [Name] = N'Agent Eval'`);
    const typeId = type.recordset[0]?.ID as string | undefined;
    Assert(!!typeId, 'the Agent Eval test type exists');
    const expected = JSON.stringify({ semanticGoals: ['The answer names the source.'] });
    const configuration = JSON.stringify({ agentId: reviewedAgentId, oracles: [{ type: 'trace-no-errors', weight: 1 }] });
    let testId = await idByName(ctx, 'Test', IT_WORLD.test);
    if (!testId) {
        const test = await rubricRow(ctx, 'MJ: Tests');
        test.Name = IT_WORLD.test;
        test.TypeID = typeId;
        test.Status = 'Active';
        test.Description = "Judges the IT world agent with that agent's Evaluation rubric.";
        test.InputDefinition = JSON.stringify({ userMessage: 'Summarize the source and name it.' });
        test.ExpectedOutcomes = expected;
        test.Configuration = configuration;
        await saveRow(test);
        testId = test.ID;
    } else {
        const test = await rubricRow(ctx, 'MJ: Tests');
        await test.Load(testId);
        const outcomes = test.ExpectedOutcomes ?? '';
        const config = test.Configuration ?? '';
        if (test.RubricID || outcomes.includes('llm-judge') || outcomes.includes('trace-no-errors') || !config.includes(reviewedAgentId) || !config.includes('trace-no-errors')) {
            test.TypeID = typeId;
            test.ExpectedOutcomes = expected;
            test.Configuration = configuration;
            await saveRow(test);
        }
    }

    const published = await pool.request().query(`
        SELECT TOP 1 CONVERT(nvarchar(36), [ID]) AS ID
        FROM [${s}].[RubricVersion]
        WHERE [RubricID] = '${rubricId}' AND [Status] = N'Published'
    `);
    const versionId = published.recordset[0].ID as string;
    const leaves = await pool.request().query(`
        SELECT CONVERT(nvarchar(36), [ID]) AS ID, CONVERT(nvarchar(36), [ScaleID]) AS ScaleID, [Key] AS [Key]
        FROM [${s}].[RubricCriterion]
        WHERE [RubricVersionID] = '${versionId}' AND [NodeType] = N'Criterion'
    `);
    const subjectEntity = await pool.request().query(`SELECT TOP 1 CONVERT(nvarchar(36), [ID]) AS ID FROM [${s}].[Entity] WHERE [Name] = N'MJ: AI Agents'`);
    const subjectEntityId = subjectEntity.recordset[0].ID as string;
    const existing = await pool.request().query(`
        SELECT TOP 1 CONVERT(nvarchar(36), [ID]) AS ID
        FROM [${s}].[RubricEvaluation]
        WHERE [RubricVersionID] = '${versionId}' AND [EvaluatorType] = N'Human' AND [Status] = N'Submitted'
          AND [SubjectRecordID] = N'${reviewedAgentId}'
    `);
    if (!existing.recordset[0]) {
        const evaluation = await rubricRow(ctx, 'MJ: Rubric Evaluations');
        evaluation.RubricVersionID = versionId;
        evaluation.SubjectEntityID = subjectEntityId;
        evaluation.SubjectRecordID = reviewedAgentId;
        evaluation.EvaluatorType = 'Human';
        evaluation.EvaluatorUserID = ctx.User.ID;
        evaluation.Status = 'Draft';
        await saveRow(evaluation);
        for (const leaf of leaves.recordset as { ID: string; ScaleID: string }[]) {
            const met = await pool.request().query(`
                SELECT TOP 1 CONVERT(nvarchar(36), [ID]) AS ID
                FROM [${s}].[RubricScaleLevel]
                WHERE [ScaleID] = '${leaf.ScaleID}' AND [Label] = N'Met'
            `);
            Assert(!!met.recordset[0], 'each IT world leaf has a Met level');
            const score = await rubricRow(ctx, 'MJ: Rubric Evaluation Scores');
            score.EvaluationID = evaluation.ID;
            score.CriterionID = leaf.ID;
            score.ScaleLevelID = met.recordset[0].ID as string;
            score.Rationale = 'Met.';
            await saveRow(score);
        }
        evaluation.Status = 'Submitted';
        await saveRow(evaluation);
        Assert(evaluation.Outcome === 'Passed', `the human evaluation outcome was ${evaluation.Outcome}`);
    }

    await ensureItWorldDetails(ctx, rubricId, versionId, leaves.recordset as { ID: string; ScaleID: string; Key: string }[], subjectEntityId, reviewedAgentId);

    const defaults = await pool.request().query(`
        SELECT a.[Name] AS AgentName
        FROM [${s}].[AIAgentRubric] ar
        INNER JOIN [${s}].[AIAgent] a ON a.[ID] = ar.[AgentID]
        WHERE ar.[RubricID] = '${rubricId}' AND ar.[Purpose] = N'Evaluation' AND ar.[Status] = N'Active' AND ar.[IsDefault] = 1
    `);
    Assert(defaults.recordset.length === 1 && defaults.recordset[0].AgentName === IT_WORLD.agent, 'one Active default Evaluation link, on the IT agent');
    const judged = await pool.request().query(`SELECT [RubricID] AS RubricID, [ExpectedOutcomes] AS ExpectedOutcomes, [Configuration] AS Configuration FROM [${s}].[Test] WHERE [ID] = '${testId}'`);
    Assert(judged.recordset[0].RubricID == null, 'the judged test does not pin Test.RubricID');
    Assert(!String(judged.recordset[0].ExpectedOutcomes ?? '').includes('llm-judge'), 'the judged test has no llm-judge oracle');
    Assert(!String(judged.recordset[0].ExpectedOutcomes ?? '').includes('trace-no-errors'), 'the trace oracle is not stored on ExpectedOutcomes');
    Assert(String(judged.recordset[0].Configuration ?? '').includes(reviewedAgentId), 'the judged test aims at the IT agent');
    Assert(String(judged.recordset[0].Configuration ?? '').includes('trace-no-errors'), 'the trace oracle is in Configuration.oracles');
    const category = await pool.request().query(`SELECT [CategoryID] AS CategoryID FROM [${s}].[Rubric] WHERE [ID] = '${rubricId}'`);
    Assert(String(category.recordset[0].CategoryID).toLowerCase() === categoryKey.toLowerCase(), 'the IT world rubric is in IT World — Agent quality');
}

/** Anchors, bands, and a submitted evaluation of each kind, with a score on every leaf. */
async function ensureItWorldDetails(ctx: IntegrationCheckContext, rubricId: string, versionId: string, leaves: { ID: string; ScaleID: string; Key: string }[], subjectEntityId: string, agentId: string): Promise<void> {
    const pool = poolOf(ctx);
    const s = schemaOf(ctx);
    const scaleId = leaves[0]?.ScaleID;
    if (!scaleId) return;
    const levels = await pool.request().query(`
        SELECT CONVERT(nvarchar(36), [ID]) AS ID, [Label] AS Label
        FROM [${s}].[RubricScaleLevel]
        WHERE [ScaleID] = '${scaleId}'
    `);
    const levelId = new Map((levels.recordset as { ID: string; Label: string }[]).map(level => [level.Label, level.ID]));
    const met = levelId.get('Met');
    const missed = levelId.get('Not met');
    Assert(!!met && !!missed, 'the IT world scale has Met and Not met');
    const criteria = await pool.request().query(`
        SELECT CONVERT(nvarchar(36), c.[ID]) AS ID
        FROM [${s}].[RubricCriterion] c
        INNER JOIN [${s}].[RubricVersion] v ON v.[ID] = c.[RubricVersionID]
        WHERE v.[RubricID] = '${rubricId}' AND v.[Status] = N'Draft' AND c.[NodeType] = N'Criterion'
    `);
    for (const criterion of criteria.recordset as { ID: string }[]) {
        await ensureAnchor(ctx, criterion.ID, met!, 'The answer matches the source.');
        await ensureAnchor(ctx, criterion.ID, missed!, 'Does not meet: the answer misses the source.');
    }
    const drafts = await pool.request().query(`
        SELECT CONVERT(nvarchar(36), [ID]) AS ID
        FROM [${s}].[RubricVersion]
        WHERE [RubricID] = '${rubricId}' AND [Status] = N'Draft'
    `);
    for (const version of drafts.recordset as { ID: string }[]) {
        await ensureBand(ctx, version.ID, 'Needs work', 0, 0.5, 'Warning', 0);
    }
    await ensureScoredEvaluation(ctx, versionId, subjectEntityId, agentId, 'Deterministic', 'IT World — Deterministic', leaves, met!, missed!, new Set(['sourcing']));
    await ensureScoredEvaluation(ctx, versionId, subjectEntityId, agentId, 'Self', 'IT World — Self check', leaves, met!, missed!, new Set());
}

async function ensureAnchor(ctx: IntegrationCheckContext, criterionId: string, scaleLevelId: string, descriptor: string): Promise<void> {
    const found = await poolOf(ctx).request().query(`
        SELECT TOP 1 [ID] AS ID FROM [${schemaOf(ctx)}].[RubricCriterionLevel]
        WHERE [CriterionID] = '${criterionId}' AND [ScaleLevelID] = '${scaleLevelId}'
    `);
    if (found.recordset[0]) return;
    const row = await ctx.Provider.GetEntityObject<MJRubricCriterionLevelEntity>('MJ: Rubric Criterion Levels', ctx.User);
    row.NewRecord();
    row.CriterionID = criterionId;
    row.ScaleLevelID = scaleLevelId;
    row.Descriptor = descriptor;
    await saveEntity(row);
}

async function ensureBand(ctx: IntegrationCheckContext, versionId: string, label: string, min: number, max: number, tone: 'Error' | 'Info' | 'Neutral' | 'Success' | 'Warning', sequence: number): Promise<void> {
    const found = await poolOf(ctx).request().query(`
        SELECT TOP 1 [ID] AS ID FROM [${schemaOf(ctx)}].[RubricBand]
        WHERE [RubricVersionID] = '${versionId}' AND [Label] = N'${sqlText(label)}'
    `);
    if (found.recordset[0]) return;
    const row = await ctx.Provider.GetEntityObject<MJRubricBandEntity>('MJ: Rubric Bands', ctx.User);
    row.NewRecord();
    row.RubricVersionID = versionId;
    row.Label = label;
    row.MinScore = min;
    row.MaxScore = max;
    row.DisplayTone = tone;
    row.Sequence = sequence;
    await saveEntity(row);
}

async function ensureScoredEvaluation(ctx: IntegrationCheckContext, versionId: string, subjectEntityId: string, agentId: string, evaluatorType: 'Agent' | 'Human' | 'External' | 'Deterministic' | 'Self' | 'AIPrompt', evaluatorName: string, leaves: { ID: string; Key: string }[], met: string, missed: string, missKeys: Set<string>): Promise<void> {
    const found = await poolOf(ctx).request().query(`
        SELECT TOP 1 CONVERT(nvarchar(36), [ID]) AS ID
        FROM [${schemaOf(ctx)}].[RubricEvaluation]
        WHERE [RubricVersionID] = '${versionId}' AND [EvaluatorType] = N'${evaluatorType}' AND [SubjectRecordID] = N'${agentId}'
    `);
    if (found.recordset[0]) return;
    const evaluation = await ctx.Provider.GetEntityObject<MJRubricEvaluationEntity>('MJ: Rubric Evaluations', ctx.User);
    evaluation.NewRecord();
    evaluation.RubricVersionID = versionId;
    evaluation.SubjectEntityID = subjectEntityId;
    evaluation.SubjectRecordID = agentId;
    evaluation.EvaluatorType = evaluatorType;
    evaluation.EvaluatorName = evaluatorName;
    evaluation.Status = 'Draft';
    await saveEntity(evaluation);
    for (const leaf of leaves) {
        const score = await ctx.Provider.GetEntityObject<MJRubricEvaluationScoreEntity>('MJ: Rubric Evaluation Scores', ctx.User);
        score.NewRecord();
        score.EvaluationID = evaluation.ID;
        score.CriterionID = leaf.ID;
        score.ScaleLevelID = missKeys.has(leaf.Key) ? missed : met;
        score.Rationale = missKeys.has(leaf.Key) ? 'Not met.' : 'Met.';
        score.Evidence = JSON.stringify([{ Type: 'Quote', Text: 'The IT world wrote this score.' }]);
        await saveEntity(score);
    }
    evaluation.Status = 'Submitted';
    await saveEntity(evaluation);
}

async function saveEntity(record: { Save(): Promise<boolean>; LatestResult?: { Message?: string } }): Promise<void> {
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
                Assert(engine.Overall !== null && Math.abs(viewMean - engine.Overall) < 0.000001, `view mean ${viewMean}, engine mean ${engine.Overall}`);
                Assert(Number(view.recordset[0].SelfCount) === 1, `SelfAssessmentCount was ${view.recordset[0].SelfCount}`);
            });
        },
    },
    {
        Id: 'rubrics.W1',
        Name: 'W1: the IT world rubric stays published for the product to open',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            const pool = poolOf(ctx);
            const s = schemaOf(ctx);
            const name = 'IT World — Agent evaluation';
            const existing = await pool.request().query(`SELECT TOP 1 CONVERT(nvarchar(36), [ID]) AS ID FROM [${s}].[Rubric] WHERE [Name] = N'${name}'`);
            if (!existing.recordset[0]) {
                const rubric = await rubricRow(ctx, 'MJ: Rubrics');
                rubric.Name = name;
                rubric.Status = 'Active';
                await saveRow(rubric);
                const scale = await rubricRow(ctx, 'MJ: Rubric Scales');
                scale.Name = 'IT World — Met / Not met';
                scale.ScaleType = 'Levels';
                await saveRow(scale);
                const met = await rubricRow(ctx, 'MJ: Rubric Scale Levels');
                met.ScaleID = scale.ID;
                met.Label = 'Met';
                met.Value = 1;
                met.NormalizedValue = 1;
                met.Sequence = 1;
                await saveRow(met);
                const missed = await rubricRow(ctx, 'MJ: Rubric Scale Levels');
                missed.ScaleID = scale.ID;
                missed.Label = 'Not met';
                missed.Value = 0;
                missed.NormalizedValue = 0;
                missed.Sequence = 0;
                await saveRow(missed);
                const version = await rubricRow(ctx, 'MJ: Rubric Versions');
                version.RubricID = rubric.ID;
                version.Status = 'Draft';
                version.NotApplicablePolicy = 'NotAllowed';
                version.PassThreshold = 0.6;
                await saveRow(version);
                for (const criterion of [
                    { key: 'accuracy', name: 'Accuracy', weight: 1, gate: true },
                    { key: 'sourcing', name: 'Sourcing', weight: 1, gate: false },
                    { key: 'completeness', name: 'Completeness', weight: 1, gate: false },
                ]) {
                    const row = await rubricRow(ctx, 'MJ: Rubric Criteria');
                    row.RubricVersionID = version.ID;
                    row.Key = criterion.key;
                    row.Name = criterion.name;
                    row.NodeType = 'Criterion';
                    row.ScaleID = scale.ID;
                    row.Weight = criterion.weight;
                    row.IsGate = criterion.gate;
                    if (criterion.gate) row.GateMinimumScore = 1;
                    await saveRow(row);
                    await ensureAnchor(ctx, row.ID, met.ID, 'The answer matches the source.');
                    await ensureAnchor(ctx, row.ID, missed.ID, 'Does not meet: the answer misses the source.');
                }
                await ensureBand(ctx, version.ID, 'Needs work', 0, 0.5, 'Warning', 0);
                await ensureBand(ctx, version.ID, 'Good', 0.5, 1, 'Success', 1);
                version.Status = 'Published';
                await saveRow(version);
                const draft = await rubricRow(ctx, 'MJ: Rubric Versions');
                draft.RubricID = rubric.ID;
                draft.BasedOnVersionID = version.ID;
                draft.Status = 'Draft';
                draft.NotApplicablePolicy = 'NotAllowed';
                draft.PassThreshold = 0.6;
                await saveRow(draft);
                for (const criterion of [
                    { key: 'accuracy', name: 'Accuracy', weight: 2, gate: true },
                    { key: 'sourcing', name: 'Sourcing', weight: 1, gate: false },
                    { key: 'completeness', name: 'Completeness', weight: 1, gate: false },
                ]) {
                    const row = await rubricRow(ctx, 'MJ: Rubric Criteria');
                    row.RubricVersionID = draft.ID;
                    row.Key = criterion.key;
                    row.Name = criterion.name;
                    row.NodeType = 'Criterion';
                    row.ScaleID = scale.ID;
                    row.Weight = criterion.weight;
                    row.IsGate = criterion.gate;
                    if (criterion.gate) row.GateMinimumScore = 1;
                    await saveRow(row);
                    await ensureAnchor(ctx, row.ID, met.ID, 'The answer matches the source.');
                    await ensureAnchor(ctx, row.ID, missed.ID, 'Does not meet: the answer misses the source.');
                }
                await ensureBand(ctx, draft.ID, 'Needs work', 0, 0.5, 'Warning', 0);
            }
            const published = await pool.request().query(`
                SELECT v.[MajorVersion] AS Major, v.[MinorVersion] AS Minor, v.[PatchVersion] AS Patch, v.[AppliedBump] AS Bump
                FROM [${s}].[Rubric] r
                INNER JOIN [${s}].[RubricVersion] v ON v.[RubricID] = r.[ID]
                WHERE r.[Name] = N'${name}' AND v.[Status] = N'Published'
            `);
            Assert(published.recordset.length === 1, 'the IT world rubric has one published version');
            Assert(published.recordset[0].Major === 1 && published.recordset[0].Bump === 'Initial', `published world version was ${published.recordset[0].Major} ${published.recordset[0].Bump}`);
            const draft = await pool.request().query(`
                SELECT COUNT(*) AS Drafts FROM [${s}].[Rubric] r
                INNER JOIN [${s}].[RubricVersion] v ON v.[RubricID] = r.[ID]
                WHERE r.[Name] = N'${name}' AND v.[Status] = N'Draft'
            `);
            Assert(Number(draft.recordset[0].Drafts) === 1, 'the IT world rubric keeps one draft');
            await ensureItWorld(ctx);
        },
    },
];

for (const check of RubricsChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
