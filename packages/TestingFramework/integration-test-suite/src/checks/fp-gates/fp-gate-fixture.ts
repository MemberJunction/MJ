/**
 * Fixture for the Feature Pipeline gate bundles: clones the installed job-title Feature Pipeline (bizapps-common)
 * onto the stub driver and a cloned prompt, and seeds fixture people carrying the golden titles. Everything it
 * creates is prefixed and deleted at teardown (and before setup, to clear an interrupted run).
 *
 * Direct SQL only reads physical state (checksums, counts); every write goes through the entity layer. The fixture's
 * bizapps-common rows skip their Entity Actions (scratch rows are no business event, and those action classes live in
 * bizapps-common's server package). SQL Server only: the filters select through MJ core views with subqueries.
 */
import { BaseEntity, EntityDeleteOptions, EntitySaveOptions, RunView } from '@memberjunction/core';
import type { MJAIPromptModelEntity, MJFeaturePipelineTypeEntity, MJRecordProcessEntity, MJTemplateContentEntity, MJTemplateEntity, MJTestEntity } from '@memberjunction/core-entities';
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { EscapeSQLString, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { FeaturePipelinePin, type DataFeatureSpec } from '@memberjunction/feature-pipelines';
import { RecordProcessExecutor } from '@memberjunction/record-set-processor';
import type { FeaturePipelineRunResult, ProcessRunResult, TriggeredByValue } from '@memberjunction/record-set-processor-base';
import type { FeaturePipelineGoldenSetInput, GoldenCase } from '@memberjunction/testing-engine';
import { Settle, type FeaturePipelineGateFixture, type IntegrationCheckContext } from '@memberjunction/testing-integration';
import { FeaturePipelineGateStubTable, type StubAnswer } from './feature-pipeline-gate-stub-driver';
import { FORCED_INVALID, GOLDEN_TITLES, NON_EXISTENT_FUNCTION_ID } from './golden-titles';
import { FixtureQuerySaveOptions } from '../query-fixture-save-options';

type Pool = NonNullable<IntegrationCheckContext['Pool']>;

/** The installed job-title Feature Pipeline (bizapps-common's `MJ: Record Processes` row). */
export const JOB_TITLE_RP_ID = '7E030001-A101-4B01-8C01-000000000001';
/** ID prefix of every bizapps-common row the fixtures create (teardown and the scope filter find them by it). */
export const PREFIX = '0F1A7E00-0000-4000-8001-';
/** Name of the gate fixture's Feature Pipeline Type row. */
export const STUB_TYPE_NAME = 'Feature Pipeline Gate Stub';
/** Name prefix of every MJ core row the fixtures create (teardown finds them by it). */
export const FIXTURE_NAME_PREFIX = 'FP Gate — ';
/** The fixture's driver class (the stub's `@RegisterClass` key). */
export const STUB_DRIVER_CLASS = 'FeaturePipelineGateStubDriver';
const PREREQ = 'Gate C1 → C2.x needs bizapps-common installed with its Feature Pipeline changes (the job-title pipeline, '
    + 'its golden set and the Education & Training job function): MJ_BizApps_Common: People or the Job Function and '
    + 'Seniority Derivation pipeline were not found.';

/** Run options of a fixture pipeline. */
export interface FixtureRunOptions {
    /** The people to run over (default: every fixture person). */
    Records?: string[];
    /** What triggered the run (default `OnDemand`). */
    Trigger?: TriggeredByValue;
    /** Compute without writing. */
    DryRun?: boolean;
    /** Run another fixture pipeline than the setup's (e.g. a check's own clone). */
    RecordProcessID?: string;
    /** Whether the run skips records its watermark says are unchanged (default: the pipeline's own setting). */
    SkipUnchanged?: boolean;
}

/** Setup options of the gate fixture. */
export interface FixtureSetupOptions {
    /** Also seed the three people whose titles the stub answers outside the taxonomy. */
    ForcedInvalid?: boolean;
}

/** Value checksums of the fixture's people, their job functions and the pipeline's Feature Values. */
export interface FixtureChecksums {
    People: number | null;
    Functions: number | null;
    Values: number | null;
}

/** What {@link FeaturePipelineGateFixtures.CreateStubPipeline} builds: a stub type, a prompt with one model, and a pipeline. */
export interface StubPipelineOptions {
    /** Name of the prompt, its template and the Record Process; {@link FeaturePipelineGateFixtures.DeleteStubPipeline} finds them by it. */
    Name: string;
    /** Name of the stub's `MJ: Feature Pipeline Types` row. */
    TypeName: string;
    /** Description of the prompt and the Record Process. */
    Description: string;
    /** Entity the pipeline runs on. */
    EntityID: string;
    /** The prompt's type, category, response format and template text. */
    Prompt: Pick<MJAIPromptEntityExtended, 'TypeID' | 'CategoryID' | 'ResponseFormat' | 'TemplateText'>;
    /** The prompt's one model binding. */
    Model: Pick<MJAIPromptModelEntity, 'ModelID' | 'VendorID'>;
    /** The pipeline's spec; Name, PromptID, PipelineType and Unattended are filled in. */
    Spec: Omit<DataFeatureSpec, 'Name' | 'PromptID' | 'PipelineType' | 'Unattended'>;
    /** The Record Process's scope, write-back and watermark columns. */
    RecordProcess: Pick<MJRecordProcessEntity, 'CategoryID' | 'ScopeFilter' | 'OutputMapping' | 'WatermarkStrategy'>;
}

/** One entity's rows to delete, by filter. */
interface DeleteStep {
    Entity: string;
    Filter: string;
    /** Delete options (default: a plain delete). */
    Options?: EntityDeleteOptions;
}

/** The gate bundles' fixture: setup, runs, reads and teardown. */
export class FeaturePipelineGateFixtures {
    /** A fixture person's ID (prefixed, so teardown and the scope filter find it). */
    public static PersonID(n: number): string {
        return `${PREFIX}0000001${String(n).padStart(5, '0')}`;
    }

    /** The fixture organization every fixture person is employed by. */
    public static readonly ORGANIZATION_ID = `${PREFIX}000000300001`;

    /** The fixture slot of the context; throws when setup did not run. */
    public static Require(ctx: IntegrationCheckContext): FeaturePipelineGateFixture {
        if (!ctx.FeaturePipelineGateFixture) {
            throw new Error('The Feature Pipeline gate fixture is not set up (the bundle lifecycle Setup did not run).');
        }
        return ctx.FeaturePipelineGateFixture;
    }

    /** The server transport's pool; the gate bundles need it for their physical-state reads. */
    public static RequirePool(ctx: IntegrationCheckContext): Pool {
        if (!ctx.Pool) {
            throw new Error('The Feature Pipeline gate bundles need the server transport (ctx.Pool).');
        }
        return ctx.Pool;
    }

    /**
     * Creates or updates one bizapps-common row through the entity layer. MJ core has no generated classes for these
     * entities, so the field names are checked against `EntityInfo` and written with `Set()`.
     * @throws Error with the save's message when it fails
     */
    public static async SaveBizAppsRow(ctx: IntegrationCheckContext, entityName: string, fields: Record<string, string | number | null>,
        existing?: BaseEntity): Promise<BaseEntity> {
        const row = existing || await ctx.Provider.GetEntityObject<BaseEntity>(entityName, ctx.User);
        if (!existing) {
            row.NewRecord();
        }
        const missing = Object.keys(fields).filter((name) => !row.EntityInfo.Fields.some((f) => f.Name === name));
        if (missing.length > 0) {
            throw new Error(`${entityName} has no field(s) ${missing.join(', ')}`);
        }
        for (const [name, value] of Object.entries(fields)) {
            row.Set(name, value);
        }
        if (!(await row.Save(FeaturePipelineGateFixtures.ScratchRowSaveOptions()))) {
            throw new Error(`${entityName}: ${row.LatestResult?.CompleteMessage || 'save failed'}`);
        }
        return row;
    }

    /** Per bizapps-common entity the fixture writes, the column holding the fixture's ID prefix. */
    protected static readonly FIXTURE_SCOPE_COLUMNS: ReadonlyMap<string, string> = new Map([
        ['MJ_BizApps_Common: People', 'ID'],
        ['MJ_BizApps_Common: Person Job Functions', 'PersonID'],
        ['MJ_BizApps_Common: Relationships', 'ID'],
        ['MJ_BizApps_Common: Organizations', 'ID'],
    ]);

    /**
     * Updates the fixture's own bizapps-common rows of `entityName` matching `filter` (always narrowed to the fixture's
     * ID prefix, since these saves skip Entity Actions); returns how many. @throws Error for an entity the fixture does not write
     */
    public static async UpdateBizAppsRows(ctx: IntegrationCheckContext, entityName: string, filter: string,
        fields: Record<string, string | number | null>): Promise<number> {
        const scopeColumn = FeaturePipelineGateFixtures.FIXTURE_SCOPE_COLUMNS.get(entityName);
        if (!scopeColumn) {
            throw new Error(`UpdateBizAppsRows: ${entityName} is not an entity the gate fixture writes`);
        }
        const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<BaseEntity>({
            EntityName: entityName, ExtraFilter: `(${filter}) AND ${scopeColumn} LIKE '${PREFIX}%'`, ResultType: 'entity_object',
            BypassCache: true, IgnoreMaxRows: true,
        }, ctx.User);
        if (!res.Success) {
            throw new Error(`${entityName}: ${res.ErrorMessage}`);
        }
        const rows = res.Results || [];
        await Promise.all(rows.map((row) => FeaturePipelineGateFixtures.SaveBizAppsRow(ctx, entityName, fields, row)));
        return rows.length;
    }

    /** The ID of the first row of `entityName` matching `filter` (a typed read); throws when there is none. */
    public static async LookupID(ctx: IntegrationCheckContext, entityName: string, filter: string): Promise<string> {
        const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>({
            EntityName: entityName, ExtraFilter: filter, Fields: ['ID'], ResultType: 'simple', MaxRows: 1,
        }, ctx.User);
        const id = res.Success ? res.Results?.[0]?.ID : undefined;
        if (!id) {
            throw new Error(`${entityName}: no row matches ${filter}${res.Success ? '' : ` (${res.ErrorMessage})`}`);
        }
        return id;
    }

    /** A physical-state read (see the file header for when direct SQL is used). */
    public static async Query<T>(ctx: IntegrationCheckContext, sqlStatement: string): Promise<T[]> {
        const res = await FeaturePipelineGateFixtures.RequirePool(ctx).request().query<T>(sqlStatement);
        return res.recordset || [];
    }

    /** Waits until `predicate` holds, polling every 250 ms, up to `ms`. */
    public static async WaitFor(predicate: () => boolean | Promise<boolean>, ms: number, what: string): Promise<void> {
        const until = Date.now() + ms;
        while (Date.now() < until) {
            if (await predicate()) {
                return;
            }
            await Settle(250);
        }
        throw new Error(`Timed out after ${ms} ms waiting for ${what}`);
    }

    /** Adds one fixture person with an active Employee relationship carrying the title (entity layer). */
    public static async AddPerson(ctx: IntegrationCheckContext, n: number, title: string): Promise<string> {
        const id = FeaturePipelineGateFixtures.PersonID(n);
        const employeeTypeID = await FeaturePipelineGateFixtures.LookupID(ctx, 'MJ_BizApps_Common: Relationship Types', `Name = 'Employee'`);
        await FeaturePipelineGateFixtures.SaveBizAppsRow(ctx, 'MJ_BizApps_Common: People',
            { ID: id, FirstName: 'FP Gate', LastName: `Person ${n}`, Status: 'Active' });
        await FeaturePipelineGateFixtures.SaveBizAppsRow(ctx, 'MJ_BizApps_Common: Relationships', {
            ID: `${PREFIX}0000002${String(n).padStart(5, '0')}`, RelationshipTypeID: employeeTypeID, FromPersonID: id,
            ToOrganizationID: FeaturePipelineGateFixtures.ORGANIZATION_ID, Title: title, StartDate: '2026-09-01', Status: 'Active',
        });
        ctx.FeaturePipelineGateFixture?.Inputs.set(id, title);
        return id;
    }

    /** Clones the installed job-title pipeline onto the stub and seeds the 52 golden people (and the 3 forced-invalid ones). */
    public static async Setup(ctx: IntegrationCheckContext, opts: FixtureSetupOptions = {}): Promise<FeaturePipelineGateFixture> {
        await FeaturePipelineGateFixtures.Teardown(ctx);
        const source = await FeaturePipelineGateFixtures.LoadSourcePipeline(ctx);
        const fixture = await FeaturePipelineGateFixtures.CreateStubPipeline(ctx, await FeaturePipelineGateFixtures.CloneOptions(ctx, source));
        await FeaturePipelineGateFixtures.SaveBizAppsRow(ctx, 'MJ_BizApps_Common: Organizations',
            { ID: FeaturePipelineGateFixtures.ORGANIZATION_ID, Name: 'FP Gate Organization', Status: 'Active' });
        let n = 1;
        for (const g of GOLDEN_TITLES) {
            await FeaturePipelineGateFixtures.AddPerson(ctx, n++, g.Title);
        }
        if (opts.ForcedInvalid) {
            await FeaturePipelineGateFixtures.AddPerson(ctx, 901, FORCED_INVALID.Seniority);
            await FeaturePipelineGateFixtures.AddPerson(ctx, 902, FORCED_INVALID.Function);
            await FeaturePipelineGateFixtures.AddPerson(ctx, 903, FORCED_INVALID.Both);
        }
        await FeaturePipelineGateFixtures.ConfigureStub(ctx);
        return fixture;
    }

    /**
     * Creates a stub pipeline: its Feature Pipeline Type, a prompt with one model binding, and an on-demand Infer Record
     * Process. Unattended is off, so the version steward of any MJAPI on this database leaves the fixture alone.
     */
    public static async CreateStubPipeline(ctx: IntegrationCheckContext, opts: StubPipelineOptions): Promise<FeaturePipelineGateFixture> {
        const type = await FeaturePipelineGateFixtures.CreateStubType(ctx, opts.TypeName);
        const prompt = await ctx.Provider.GetEntityObject<MJAIPromptEntityExtended>('MJ: AI Prompts', ctx.User);
        prompt.NewRecord();
        prompt.Name = opts.Name;
        prompt.Description = opts.Description;
        prompt.TypeID = opts.Prompt.TypeID;
        prompt.CategoryID = opts.Prompt.CategoryID;
        prompt.Status = 'Active';
        prompt.ResponseFormat = opts.Prompt.ResponseFormat;
        prompt.Temperature = 0;
        prompt.Seed = 42;
        prompt.TemplateID = await FeaturePipelineGateFixtures.CreateStubTemplate(ctx, opts.Name, opts.Prompt.TemplateText);
        await FeaturePipelineGateFixtures.SaveOrThrow(prompt, 'prompt');
        const pm = await ctx.Provider.GetEntityObject<MJAIPromptModelEntity>('MJ: AI Prompt Models', ctx.User);
        pm.NewRecord();
        pm.PromptID = prompt.ID;
        pm.ModelID = opts.Model.ModelID;
        pm.VendorID = opts.Model.VendorID;
        pm.Priority = 1;
        pm.Status = 'Active';
        await FeaturePipelineGateFixtures.SaveOrThrow(pm, 'prompt model');
        const spec: DataFeatureSpec = { ...opts.Spec, Name: opts.Name, PromptID: prompt.ID, PipelineType: opts.TypeName,
            Unattended: { AutoEvaluate: false, AutoBackfill: false } };
        const rp = await ctx.Provider.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', ctx.User);
        rp.NewRecord();
        rp.Name = opts.Name;
        rp.Description = opts.Description;
        rp.CategoryID = opts.RecordProcess.CategoryID;
        rp.EntityID = opts.EntityID;
        rp.Status = 'Active';
        rp.WorkType = 'Infer';
        rp.PromptID = prompt.ID;
        rp.ScopeType = 'Filter';
        rp.ScopeFilter = opts.RecordProcess.ScopeFilter;
        rp.OnDemandEnabled = true;
        rp.ScheduleEnabled = false;
        rp.OnChangeEnabled = false;
        rp.OutputMapping = opts.RecordProcess.OutputMapping;
        rp.SkipUnchanged = true;
        rp.WatermarkStrategy = opts.RecordProcess.WatermarkStrategy;
        rp.Configuration = JSON.stringify(spec);
        await FeaturePipelineGateFixtures.SaveOrThrow(rp, 'record process');
        const fixture: FeaturePipelineGateFixture = {
            RecordProcessID: rp.ID, PromptID: prompt.ID, PromptModelID: pm.ID, PipelineTypeID: type.ID, EntityID: rp.EntityID,
            Inputs: new Map(), CreatedTestIDs: [],
        };
        ctx.FeaturePipelineGateFixture = fixture;
        await KnowledgeHubMetadataEngine.Instance.Config(true, ctx.User, ctx.Provider);
        await AIEngine.Instance.Config(true, ctx.User, ctx.Provider);
        return fixture;
    }

    /**
     * Creates the stub prompt's template and its one content row, as a prompt save would, but with the content saved
     * without AI actions, so its parameter extraction makes no model call. Returns the template's ID.
     */
    protected static async CreateStubTemplate(ctx: IntegrationCheckContext, name: string, templateText: string): Promise<string> {
        const template = await ctx.Provider.GetEntityObject<MJTemplateEntity>('MJ: Templates', ctx.User);
        template.NewRecord();
        template.Name = name;
        template.Description = `Template for AI Prompt: ${name}`;
        template.UserID = ctx.User.ID;
        template.IsActive = true;
        await FeaturePipelineGateFixtures.SaveOrThrow(template, 'template');
        const content = await ctx.Provider.GetEntityObject<MJTemplateContentEntity>('MJ: Template Contents', ctx.User);
        content.NewRecord();
        content.TemplateID = template.ID;
        content.TypeID = await FeaturePipelineGateFixtures.LookupID(ctx, 'MJ: Template Content Types', `Name = 'Text'`);
        content.TemplateText = templateText;
        content.Priority = 1;
        content.IsActive = true;
        if (!(await content.Save(FixtureQuerySaveOptions()))) {
            throw new Error(`Feature Pipeline gate fixture: saving the template content failed: ${content.LatestResult?.CompleteMessage || 'unknown error'}`);
        }
        return template.ID;
    }

    /**
     * Deletes every stub pipeline whose name starts with `name`, with everything that hangs off it, then the stub type,
     * children first. Returns the failures instead of throwing (best-effort teardown).
     */
    public static async DeleteStubPipeline(ctx: IntegrationCheckContext, name: string, typeName: string): Promise<string[]> {
        const like = `N'${EscapeSQLString(name)}%'`;
        const rps = `(SELECT ID FROM [__mj].[vwRecordProcesses] WHERE Name LIKE ${like})`;
        const prompts = `(SELECT ID FROM [__mj].[vwAIPrompts] WHERE Name LIKE ${like})`;
        const templates = `(SELECT TemplateID FROM [__mj].[vwAIPrompts] WHERE Name LIKE ${like})`;
        return FeaturePipelineGateFixtures.DeleteSteps(ctx, [
            { Entity: 'MJ: Feature Values', Filter: `RecordProcessID IN ${rps}` },
            { Entity: 'MJ: Feature Value Caches', Filter: `RecordProcessID IN ${rps} OR PromptID IN ${prompts}` },
            { Entity: 'MJ: Record Process Watermarks', Filter: `RecordProcessID IN ${rps}` },
            { Entity: 'MJ: Process Run Details', Filter: `ProcessRunID IN (SELECT ID FROM [__mj].[vwProcessRuns] WHERE RecordProcessID IN ${rps})` },
            { Entity: 'MJ: Process Runs', Filter: `RecordProcessID IN ${rps}` },
            { Entity: 'MJ: Feature Pipeline Versions', Filter: `RecordProcessID IN ${rps}` },
            { Entity: 'MJ: Record Processes', Filter: `Name LIKE ${like}` },
            { Entity: 'MJ: AI Prompt Models', Filter: `PromptID IN ${prompts}` },
            { Entity: 'MJ: AI Prompt Runs', Filter: `PromptID IN ${prompts}` },
            { Entity: 'MJ: Template Params', Filter: `TemplateID IN ${templates}` },
            { Entity: 'MJ: Template Contents', Filter: `TemplateID IN ${templates}` },
            { Entity: 'MJ: AI Prompts', Filter: `Name LIKE ${like}` },
            { Entity: 'MJ: Templates', Filter: `Name LIKE ${like}` },
            { Entity: 'MJ: Feature Pipeline Types', Filter: `Name = N'${EscapeSQLString(typeName)}' AND DriverClass = '${STUB_DRIVER_CLASS}'` },
        ]);
    }

    /** Runs a fixture pipeline on demand over the given people (default: every fixture person). */
    public static async Run(ctx: IntegrationCheckContext, opts: FixtureRunOptions = {}): Promise<ProcessRunResult> {
        const fx = FeaturePipelineGateFixtures.Require(ctx);
        return new RecordProcessExecutor().RunByID(opts.RecordProcessID || fx.RecordProcessID, {
            contextUser: ctx.User, provider: ctx.Provider, triggeredBy: opts.Trigger || 'OnDemand', dryRun: opts.DryRun,
            SkipUnchanged: opts.SkipUnchanged, scope: { Kind: 'records', RecordIDs: opts.Records || Array.from(fx.Inputs.keys()) },
        });
    }

    /** The run's FeaturePipelineRunResult, read back from MJ: Process Runs (what the run persisted, not what it returned). */
    public static async Summary(ctx: IntegrationCheckContext, processRunID: string | undefined): Promise<FeaturePipelineRunResult> {
        if (!processRunID) {
            throw new Error('The run returned no ProcessRunID');
        }
        const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ResultSummary: string | null }>({
            EntityName: 'MJ: Process Runs', ExtraFilter: `ID = '${EscapeSQLString(processRunID)}'`, Fields: ['ResultSummary'],
            ResultType: 'simple', BypassCache: true,
        }, ctx.User);
        const text = res.Success ? res.Results?.[0]?.ResultSummary : null;
        const summary = text ? SafeJSONParse<FeaturePipelineRunResult>(text) : null;
        if (!summary) {
            throw new Error(`Process Run ${processRunID} has no readable ResultSummary${res.Success ? '' : `: ${res.ErrorMessage}`}`);
        }
        return summary;
    }

    /** Value checksums of the fixture people, their job functions and the pipeline's own Feature Values (physical read). */
    public static async Checksums(ctx: IntegrationCheckContext): Promise<FixtureChecksums> {
        const fx = FeaturePipelineGateFixtures.Require(ctx);
        const rows = await FeaturePipelineGateFixtures.Query<FixtureChecksums>(ctx, `SELECT
            (SELECT CHECKSUM_AGG(CHECKSUM(ID, SeniorityLevelID)) FROM [__mj_BizAppsCommon].[Person] WHERE ID LIKE '${PREFIX}%') AS People,
            (SELECT CHECKSUM_AGG(CHECKSUM(PersonID, JobFunctionID, Sequence, Source, Confidence)) FROM [__mj_BizAppsCommon].[PersonJobFunction] WHERE PersonID LIKE '${PREFIX}%') AS Functions,
            (SELECT CHECKSUM_AGG(CHECKSUM(ValueKeyHash, ValueText, ValueJSON, Reasoning, Confidence)) FROM [__mj].[FeatureValue] WHERE RecordProcessID='${EscapeSQLString(fx.RecordProcessID)}' AND Source='Pipeline') AS [Values]`);
        return rows[0];
    }

    /** The cases of the installed job-title pipeline's golden-set test. @throws Error when the pipeline, its activation or the test is missing */
    public static async InstalledGoldenCases(ctx: IntegrationCheckContext): Promise<GoldenCase[]> {
        const source = await FeaturePipelineGateFixtures.LoadSourcePipeline(ctx);
        const testID = FeaturePipelineGateFixtures.ParseSpec(source).Activation?.GoldenSetTestID;
        if (!testID) {
            throw new Error(`${PREREQ} (The job-title pipeline has no Activation.GoldenSetTestID.)`);
        }
        const test = await ctx.Provider.GetEntityObject<MJTestEntity>('MJ: Tests', ctx.User);
        if (!(await test.Load(testID))) {
            throw new Error(`${PREREQ} (Golden-set test ${testID} was not found.)`);
        }
        const input = test.InputDefinition ? SafeJSONParse<FeaturePipelineGoldenSetInput>(test.InputDefinition) : null;
        if (!input || !Array.isArray(input.Cases)) {
            throw new Error(`Golden-set test ${testID} has no Cases in its InputDefinition.`);
        }
        return input.Cases;
    }

    /** Deletes everything the fixtures created, children first. Never throws (teardown is best-effort); logs what failed. */
    public static async Teardown(ctx: IntegrationCheckContext): Promise<void> {
        try {
            const problems = [
                ...(await FeaturePipelineGateFixtures.DeleteStubPipeline(ctx, FIXTURE_NAME_PREFIX, STUB_TYPE_NAME)),
                ...(await FeaturePipelineGateFixtures.DeleteCreatedTests(ctx)),
                ...(await FeaturePipelineGateFixtures.DeleteFixturePeople(ctx)),
            ];
            FeaturePipelineGateStubTable.Instance.Clear();
            await AIEngine.Instance.Config(true, ctx.User, ctx.Provider);
            await KnowledgeHubMetadataEngine.Instance.Config(true, ctx.User, ctx.Provider);
            if (problems.length > 0) {
                console.warn(`Feature Pipeline gate fixture teardown: ${problems.join('; ')}`);
            }
        } catch (e) {
            console.warn(`Feature Pipeline gate fixture teardown: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /** Deletes every row of `entityName` matching `filter`, through BaseEntity, in parallel; returns the failures. */
    public static async DeleteWhere(ctx: IntegrationCheckContext, entityName: string, filter: string, options?: EntityDeleteOptions): Promise<string[]> {
        const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<BaseEntity>({
            EntityName: entityName, ExtraFilter: filter, ResultType: 'entity_object', BypassCache: true, IgnoreMaxRows: true,
        }, ctx.User);
        if (!res.Success) {
            return [`${entityName}: ${res.ErrorMessage}`];
        }
        const failures = await Promise.all((res.Results || []).map(async (row) =>
            ((await row.Delete(options)) ? null : `${entityName}: ${row.LatestResult?.CompleteMessage || 'delete failed'}`)));
        return failures.filter((m): m is string => m !== null);
    }

    /** Runs {@link DeleteWhere} for each step, in order; returns every failure. */
    protected static async DeleteSteps(ctx: IntegrationCheckContext, steps: DeleteStep[]): Promise<string[]> {
        const problems: string[] = [];
        for (const step of steps) {
            problems.push(...(await FeaturePipelineGateFixtures.DeleteWhere(ctx, step.Entity, step.Filter, step.Options)));
        }
        return problems;
    }

    /** The `MJ: Tests` rows checks created (and their runs), recorded on the fixture slot. */
    protected static async DeleteCreatedTests(ctx: IntegrationCheckContext): Promise<string[]> {
        const tests = ctx.FeaturePipelineGateFixture?.CreatedTestIDs || [];
        if (tests.length === 0) {
            return [];
        }
        const ids = tests.map((t) => `'${EscapeSQLString(t)}'`).join(',');
        return FeaturePipelineGateFixtures.DeleteSteps(ctx, [
            { Entity: 'MJ: Test Runs', Filter: `TestID IN (${ids})` },
            { Entity: 'MJ: Tests', Filter: `ID IN (${ids})` },
        ]);
    }

    /** The fixture people, their rows and organization, children first (none without bizapps-common); returns the failures. */
    protected static async DeleteFixturePeople(ctx: IntegrationCheckContext): Promise<string[]> {
        if (!ctx.Provider.EntityByName('MJ_BizApps_Common: People')) {
            return [];
        }
        const options = FeaturePipelineGateFixtures.ScratchRowDeleteOptions();
        return FeaturePipelineGateFixtures.DeleteSteps(ctx, [
            { Entity: 'MJ_BizApps_Common: Person Job Functions', Filter: `PersonID LIKE '${PREFIX}%'`, Options: options },
            { Entity: 'MJ_BizApps_Common: Relationships', Filter: `ID LIKE '${PREFIX}%'`, Options: options },
            { Entity: 'MJ_BizApps_Common: People', Filter: `ID LIKE '${PREFIX}%'`, Options: options },
            { Entity: 'MJ_BizApps_Common: Organizations', Filter: `ID LIKE '${PREFIX}%'`, Options: options },
        ]);
    }

    /** The installed job-title pipeline; throws the prerequisite message when bizapps-common is not installed. */
    protected static async LoadSourcePipeline(ctx: IntegrationCheckContext): Promise<MJRecordProcessEntity> {
        if (!ctx.Provider.EntityByName('MJ_BizApps_Common: People')) {
            throw new Error(PREREQ);
        }
        const source = await ctx.Provider.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', ctx.User);
        if (!(await source.Load(JOB_TITLE_RP_ID)) || !source.PromptID) {
            throw new Error(PREREQ);
        }
        return source;
    }

    /**
     * The stub pipeline's spec: the installed one without the activation gate (the checks drive activation) and without
     * `Context.RecordAsUserMessage`, which `ValidateSpec` refuses on a non-LLM pipeline type.
     */
    protected static StubSpec(spec: DataFeatureSpec): StubPipelineOptions['Spec'] {
        return { ...spec, Context: { ...spec.Context, RecordAsUserMessage: false }, Activation: undefined };
    }

    /** A pipeline's spec; throws when its Configuration is not a spec. */
    protected static ParseSpec(rp: MJRecordProcessEntity): DataFeatureSpec {
        const spec = rp.Configuration ? SafeJSONParse<DataFeatureSpec>(rp.Configuration) : null;
        if (!spec) {
            throw new Error(`Record Process ${rp.Name} has no readable DataFeatureSpec in its Configuration.`);
        }
        return spec;
    }

    /** The gate fixture as a clone of the installed job-title pipeline, scoped to the fixture people. */
    protected static async CloneOptions(ctx: IntegrationCheckContext, source: MJRecordProcessEntity): Promise<StubPipelineOptions> {
        await AIEngine.Instance.Config(true, ctx.User, ctx.Provider);
        const sourcePrompt = AIEngine.Instance.Prompts.find((p) => UUIDsEqual(p.ID, source.PromptID));
        if (!sourcePrompt) {
            throw new Error(PREREQ);
        }
        const sourceModel = FeaturePipelinePin.SelectPrimaryModel(AIEngine.Instance.PromptModels.filter((m) => UUIDsEqual(m.PromptID, sourcePrompt.ID)));
        if (!sourceModel) {
            throw new Error('The job-title prompt has no Active model binding.');
        }
        return {
            Name: `${FIXTURE_NAME_PREFIX}Job Function and Seniority`,
            TypeName: STUB_TYPE_NAME,
            Description: 'Gate fixture clone of the job-title Feature Pipeline on the stub driver.',
            EntityID: source.EntityID,
            Prompt: { TypeID: sourcePrompt.TypeID, CategoryID: sourcePrompt.CategoryID, ResponseFormat: sourcePrompt.ResponseFormat,
                TemplateText: sourcePrompt.TemplateText },
            Model: { ModelID: sourceModel.ModelID, VendorID: sourceModel.VendorID },
            Spec: FeaturePipelineGateFixtures.StubSpec(FeaturePipelineGateFixtures.ParseSpec(source)),
            RecordProcess: { CategoryID: source.CategoryID, OutputMapping: source.OutputMapping, WatermarkStrategy: source.WatermarkStrategy,
                ScopeFilter: `(${source.ScopeFilter}) AND [__mj_BizAppsCommon].[vwPeople].[ID] LIKE '${PREFIX}%'` },
        };
    }

    /** A stub pipeline type row. */
    protected static async CreateStubType(ctx: IntegrationCheckContext, typeName: string): Promise<MJFeaturePipelineTypeEntity> {
        const type = await ctx.Provider.GetEntityObject<MJFeaturePipelineTypeEntity>('MJ: Feature Pipeline Types', ctx.User);
        type.NewRecord();
        type.Name = typeName;
        type.Description = 'Gate fixture: answers from a table (no model calls).';
        type.DriverClass = STUB_DRIVER_CLASS;
        type.Status = 'Active';
        await FeaturePipelineGateFixtures.SaveOrThrow(type, 'pipeline type');
        return type;
    }

    /** Builds the stub's answer table from the installed taxonomy rows. */
    protected static async ConfigureStub(ctx: IntegrationCheckContext): Promise<void> {
        const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string; Name: string }>({
            EntityName: 'MJ_BizApps_Common: Job Functions', Fields: ['ID', 'Name'], ResultType: 'simple', IgnoreMaxRows: true,
        }, ctx.User);
        if (!res.Success) {
            throw new Error(`Reading job functions failed: ${res.ErrorMessage}`);
        }
        const functions = res.Results || [];
        const fnID = (name: string): string => {
            const wanted = name.toLowerCase();
            const row = functions.find((f) => f.Name.toLowerCase() === wanted);
            if (!row) {
                throw new Error(`Job function '${name}' is not installed (the companion adds Education & Training).`);
            }
            return row.ID;
        };
        const answer = (seniority: string, functionID: string): StubAnswer => ({
            SeniorityLevel: seniority, SeniorityConfidence: 0.9, Reasoning: 'gate stub',
            Functions: [{ JobFunctionID: functionID, Confidence: 0.9, Sequence: 1 }],
        });
        const table = FeaturePipelineGateStubTable.Instance;
        const keyOf = FeaturePipelineGateStubTable.KeyOf;
        table.Clear();
        for (const g of GOLDEN_TITLES) {
            table.Answers.set(keyOf(g.Title), answer(g.Seniority[0], fnID(g.Functions[0])));
        }
        // Degraded mode: the first 12 titles answered outside every accepted label, so 40/52 = 0.769 score correct.
        for (const g of GOLDEN_TITLES.slice(0, 12)) {
            table.Degraded.set(keyOf(g.Title), answer('Board Member', fnID('Design')));
        }
        table.Answers.set(keyOf(FORCED_INVALID.Seniority), answer('Grand Poobah', fnID('Operations')));
        table.Answers.set(keyOf(FORCED_INVALID.Function), answer('Manager', NON_EXISTENT_FUNCTION_ID));
        table.Answers.set(keyOf(FORCED_INVALID.Both), answer('Grand Poobah', NON_EXISTENT_FUNCTION_ID));
    }

    /** Save options of the fixture's bizapps-common rows: no Entity Actions or AI Actions. */
    protected static ScratchRowSaveOptions(): EntitySaveOptions {
        const options = new EntitySaveOptions();
        options.SkipEntityActions = true;
        options.SkipEntityAIActions = true;
        return options;
    }

    /** Delete options of the fixture's bizapps-common rows: no Entity Actions or AI Actions. */
    protected static ScratchRowDeleteOptions(): EntityDeleteOptions {
        const options = new EntityDeleteOptions();
        options.SkipEntityActions = true;
        options.SkipEntityAIActions = true;
        return options;
    }

    /** Saves a fixture row; throws with the save's CompleteMessage when it fails. */
    protected static async SaveOrThrow(e: BaseEntity, what: string): Promise<void> {
        if (!(await e.Save())) {
            throw new Error(`Feature Pipeline gate fixture: saving the ${what} failed: ${e.LatestResult?.CompleteMessage || 'unknown error'}`);
        }
    }
}
