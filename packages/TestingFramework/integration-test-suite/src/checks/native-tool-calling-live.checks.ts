/**
 * native-tool-calling-live.checks.ts — the 'native-tool-calling-live' bundle (NTC1–NTC4): real Loop
 * agents calling Actions through native tool calling and through the JSON envelope, with
 * `ActionParam.ValueSchema` declaring each param's type.
 *
 * LIVE-MODEL tier (real model calls cost tokens). Each check runs a fixture agent through
 * `AgentRunner` with the model and vendor named by the override, then reads what the framework
 * recorded — never the model's prose:
 *   - `AIPromptRun.ToolCallingMode` of every prompt call, which says which protocol actually ran;
 *   - the `ActionExecutionLog.Params` each Actions step links to, which are the arguments the
 *     Action received after coercion, checked against the params' ValueSchemas.
 *
 *   NTC1: native mode on the agent's OWN prompt (the Loop system prompt is untouched, so the child
 *         prompt layer of the gate is what opens it). Every call runs native, and the fixture
 *         Action receives arguments that match its schemas: `Filters` (ValueType Other) arrives as
 *         an object, `Priority` as an integer, `Recipients` as an array of strings.
 *   NTC2: envelope mode, same agent. Every call runs on the envelope path, and the arguments match
 *         the schemas too — argument coercion applies on both paths.
 *   NTC3: the stock `Create SVG Chart` Action, whose params carry backfilled ValueSchemas, in both
 *         modes: the arguments it receives match them (`Width` an integer, `ShowGrid` a boolean,
 *         `ChartType` and `Palette` from their enums).
 *   NTC4: a native request on a vendor row that declares `LLM.SupportsNativeToolCalling: false`
 *         runs on the envelope path and still completes. Capability beats preference.
 *
 * TARGETS: `NATIVE_TOOLS_IT_MODELS` ("Model Name@DriverClass", comma-separated) or the defaults
 * below. A target is run only when the runner itself finds a credential for it (an MJ credential
 * binding, the vendor's default credential, or `AI_VENDOR_API_KEY__<DRIVER>`); others are logged as
 * skipped, and a check with nothing callable skips loudly. A run that fails because the vendor no
 * longer serves the model (404) or the account has no balance or quota is logged and not counted.
 * A model listed in KNOWN_NATIVE_GAPS is run and logged, not counted, in the native checks.
 *
 * Self-cleaning: the lifecycle creates the agents, prompts and fixture Action; Teardown purges
 * every run (with the execution logs its Actions steps link to) and deletes the fixtures.
 */
import { IndexByUUID, RegisterClass, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { RunView } from '@memberjunction/core';
import { BaseLLM } from '@memberjunction/ai';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, type RunActionParams } from '@memberjunction/actions-base';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AgentRunner } from '@memberjunction/ai-agents';
import { TemplateEngineServer } from '@memberjunction/templates';
import type { MJAIModelEntityExtended, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import type {
    MJActionEntity, MJActionParamEntity, MJAIAgentActionEntity, MJAIAgentEntity, MJAIAgentPromptEntity,
    MJAIModelVendorEntity, MJAIPromptEntity
} from '@memberjunction/core-entities';
import { Assert, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck, NativeToolCallingLiveFixture } from '@memberjunction/testing-integration';
import { AGENT_LIVE_FIXTURE_TAG, AGENT_LIVE_SETTLE_MS, DeleteById, PurgeAgentRun, ResolvePromptRunIdsForAgentRuns, Sleep } from './agent-live-shared';
import {
    CHART_AGENT_INSTRUCTIONS, CHART_REQUEST, REPORT_AGENT_INSTRUCTIONS, REPORT_PARAMS, REPORT_REQUEST,
    ReportParamSchemas, ValidateArguments, type ParamSchema, type ParamSchemaMap
} from './native-tool-calling-shared';

const REPORT_ACTION_NAME = 'IT: Native Params Report Action';
const REPORT_ACTION_DRIVER = 'ITNativeParamsReportAction';
const REPORT_AGENT_NAME = 'IT: Native Params Report Agent';
const CHART_AGENT_NAME = 'IT: Native Params Chart Agent';
const CHART_ACTION_NAME = 'Create SVG Chart';
const LOOP_SYSTEM_PROMPT_NAME = 'Loop Agent Type: System Prompt';

/** Models that work in both modes today, one per driver with tool support. */
const DEFAULT_TARGETS = [
    'Gemini 3.8 Flash@GeminiLLM',
    'Claude Haiku 5.5@AnthropicLLM',
    'Grok 4.3@xAILLM',
    'Qwen 3.6 27B@GroqLLM',
    'GPT-6 Luna@OpenAILLM'
];

/** Preferred NTC4 target: a model that supports tools, on a vendor row whose driver does not. */
const DEFAULT_CAPABILITY_GATE_TARGET = 'Kimi K3 Fast@FireworksLLM';

/**
 * Models whose native calls the vendor rejects today, keyed by API name. The native checks run them
 * and log the outcome without counting it. Remove an entry when the cause is fixed.
 */
const KNOWN_NATIVE_GAPS: Record<string, string> = {
    'gpt-6-luna': "#5844: OpenAI rejects tools on Chat Completions unless reasoning_effort is 'none'"
};

/**
 * Gaps that apply to the stock chart Action only, keyed by API name. Groq validates tool arguments
 * against the declared schema on its side; Qwen 3.6 27B sends `ShowGrid` as the string "true", which
 * the backfilled boolean schema now refuses, so Groq rejects the call before MJ's coercion can run and
 * the turn falls back. The same model passes NTC1, so the gap is scoped to NTC3.
 */
const KNOWN_CHART_NATIVE_GAPS: Record<string, string> = {
    'qwen/qwen3.6-27b': 'Groq refuses ShowGrid sent as a string against the boolean schema before MJ can coerce it'
};

const NATIVE_MODES = new Set(['Native', 'NativeImplicit']);

// ─── Fixture Action ────────────────────────────────────────────────────────────

/** The report fixture's code: succeeds with whatever it receives; the checks read the execution log. */
@RegisterClass(BaseAction, REPORT_ACTION_DRIVER)
export class ITNativeParamsReportAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const result = new ActionResultSimple();
        result.Success = true;
        result.ResultCode = 'SCHEDULED';
        result.Message = `Report scheduled with ${params.Params.filter((p) => p.Type !== 'Output').length} parameters.`;
        return result;
    }
}

// ─── Targets ───────────────────────────────────────────────────────────────────

interface NativeTarget {
    Model: MJAIModelEntityExtended;
    ModelVendor: MJAIModelVendorEntity;
    Driver: string;
}

/** AIPromptRunner with its credential check exposed, so a check calls only models it can reach. */
class CredentialProbeRunner extends AIPromptRunner {
    public HasCredentialFor(prompt: MJAIPromptEntityExtended, target: NativeTarget): boolean {
        return this.HasCredentialsAvailable(target.Driver, prompt.ID, target.Model.ID, target.ModelVendor.VendorID);
    }
}

function label(t: NativeTarget): string {
    return `${t.Model.Name} on ${t.ModelVendor.Vendor} (${t.Driver})`;
}

/** The effective `LLM.SupportsNativeToolCalling` for a model, on one vendor row or on none. */
function supportsNative(modelID: string, modelVendorID?: string): boolean {
    return AIEngine.Instance.GetEffectiveModelConfiguration(modelID, modelVendorID)?.LLM?.SupportsNativeToolCalling === true;
}

/** Resolves "Model Name@DriverClass" to an active inference row with a registered driver, or null. */
function resolveTarget(spec: string): NativeTarget | null {
    const [name, driver] = spec.split('@').map((s) => s.trim());
    const engine = AIEngine.Instance;
    // Some databases carry duplicate model rows; prefer the one whose catalog states native capability.
    const models = engine.Models.filter((m) => m.Name === name && m.IsActive)
        .sort((a, b) => Number(supportsNative(b.ID)) - Number(supportsNative(a.ID)));
    const rowsByModel = IndexByUUID(
        engine.ModelVendors.filter((mv) => mv.DriverClass === driver && mv.Status === 'Active' && engine.IsInferenceProvider(mv)),
        (mv) => mv.ModelID
    );
    for (const model of models) {
        const row = rowsByModel.Get(model.ID);
        if (row && MJGlobal.Instance.ClassFactory.GetRegistration(BaseLLM, driver)) {
            return { Model: model, ModelVendor: row, Driver: driver };
        }
    }
    return null;
}

/** The requested targets that resolve, are native-capable and have a credential; the rest are logged. */
function callableNativeTargets(prompt: MJAIPromptEntityExtended): NativeTarget[] {
    const specs = process.env.NATIVE_TOOLS_IT_MODELS?.split(',').map((s) => s.trim()).filter(Boolean) ?? DEFAULT_TARGETS;
    const runner = new CredentialProbeRunner();
    const callable: NativeTarget[] = [];
    for (const spec of specs) {
        const target = resolveTarget(spec);
        if (!target) { console.log(`      ○ skipped ${spec}: no active model with an inference row on that driver`); continue; }
        if (!supportsNative(target.Model.ID, target.ModelVendor.ID)) { console.log(`      ○ skipped ${label(target)}: the catalog does not declare native tool calling`); continue; }
        if (!runner.HasCredentialFor(prompt, target)) { console.log(`      ○ skipped ${label(target)}: no credential (MJ credential binding, vendor default credential, or AI_VENDOR_API_KEY__${target.Driver.toUpperCase()})`); continue; }
        callable.push(target);
    }
    return callable;
}

/** Rows where the model supports native tools but this vendor row turns them off. */
function capabilityGateCandidates(): NativeTarget[] {
    const preferred = resolveTarget(DEFAULT_CAPABILITY_GATE_TARGET);
    const engine = AIEngine.Instance;
    const modelsByID = IndexByUUID(engine.Models);
    const others = engine.ModelVendors
        .filter((mv) => mv.Status === 'Active' && engine.IsInferenceProvider(mv) && !!mv.DriverClass
            && !!MJGlobal.Instance.ClassFactory.GetRegistration(BaseLLM, mv.DriverClass))
        .map((mv) => ({ ModelVendor: mv, Model: modelsByID.Get(mv.ModelID) }))
        .filter((r): r is { ModelVendor: MJAIModelVendorEntity; Model: MJAIModelEntityExtended } =>
            !!r.Model && r.Model.IsActive && r.Model.AIModelType?.trim().toLowerCase() === 'llm')
        .filter((r) => supportsNative(r.Model.ID) && !supportsNative(r.Model.ID, r.ModelVendor.ID))
        .map((r) => ({ ...r, Driver: r.ModelVendor.DriverClass as string }));
    return preferred ? [preferred, ...others.filter((o) => !UUIDsEqual(o.ModelVendor.ID, preferred.ModelVendor.ID))] : others;
}

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function fixture(ctx: IntegrationCheckContext): NativeToolCallingLiveFixture {
    if (!ctx.NativeToolCallingLiveFixture) {
        throw new Error('NativeToolCallingLiveFixture not initialized — the native-tool-calling-live lifecycle Setup must run first.');
    }
    return ctx.NativeToolCallingLiveFixture;
}

async function saveOrThrow(entity: { Save(): Promise<boolean>; LatestResult?: { CompleteMessage?: string } | null }, what: string): Promise<void> {
    Assert(await entity.Save(), `${what} save failed: ${entity.LatestResult?.CompleteMessage ?? '(no message)'}`);
}

async function lookupID(ctx: IntegrationCheckContext, entity: string, filter: string): Promise<string> {
    const r = await new RunView().RunView<{ ID: string }>({ EntityName: entity, ExtraFilter: filter, Fields: ['ID'], ResultType: 'simple' }, ctx.User);
    Assert(r.Success && r.Results.length > 0, `${entity} where ${filter} not found`);
    return r.Results[0].ID;
}

async function createReportAction(ctx: IntegrationCheckContext, fx: NativeToolCallingLiveFixture): Promise<string> {
    const action = await ctx.Provider.GetEntityObject<MJActionEntity>('MJ: Actions', ctx.User);
    action.NewRecord();
    action.Name = REPORT_ACTION_NAME;
    action.Description = `Schedules a report for delivery. ${AGENT_LIVE_FIXTURE_TAG}`;
    action.Type = 'Custom';
    action.DriverClass = REPORT_ACTION_DRIVER;
    action.Status = 'Active';
    action.CodeApprovalStatus = 'Approved';
    await saveOrThrow(action, REPORT_ACTION_NAME);
    fx.CreatedRecords.push({ Entity: 'MJ: Actions', ID: action.ID });
    for (const def of REPORT_PARAMS) {
        const param = await ctx.Provider.GetEntityObject<MJActionParamEntity>('MJ: Action Params', ctx.User);
        param.NewRecord();
        param.ActionID = action.ID;
        param.Name = def.Name;
        param.Type = 'Input';
        param.ValueType = def.ValueType;
        param.IsArray = def.IsArray;
        param.IsRequired = def.IsRequired;
        param.Description = def.Description;
        param.ValueSchemaObject = def.Schema;
        await saveOrThrow(param, `${REPORT_ACTION_NAME}.${def.Name}`);
        fx.CreatedRecords.push({ Entity: 'MJ: Action Params', ID: param.ID });
    }
    return action.ID;
}

/** Creates an agent prompt; records its auto-created Template and contents before it, so reverse deletion is FK-safe. */
async function createPrompt(ctx: IntegrationCheckContext, fx: NativeToolCallingLiveFixture, name: string, text: string): Promise<string> {
    const prompt = await ctx.Provider.GetEntityObject<MJAIPromptEntityExtended>('MJ: AI Prompts', ctx.User);
    prompt.NewRecord();
    prompt.Name = name;
    prompt.Description = AGENT_LIVE_FIXTURE_TAG;
    prompt.TypeID = await lookupID(ctx, 'MJ: AI Prompt Types', `Name='Chat'`);
    prompt.TemplateText = text;
    prompt.Status = 'Active';
    prompt.PromptRole = 'System';
    prompt.PromptPosition = 'First';
    prompt.OutputType = 'string';
    prompt.ValidationBehavior = 'Warn';
    await saveOrThrow(prompt, name);
    if (prompt.TemplateID) {
        fx.CreatedRecords.push({ Entity: 'MJ: Templates', ID: prompt.TemplateID });
        const contents = await new RunView().RunView<{ ID: string }>({
            EntityName: 'MJ: Template Contents', ExtraFilter: `TemplateID='${prompt.TemplateID}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true
        }, ctx.User);
        for (const c of contents.Results ?? []) fx.CreatedRecords.push({ Entity: 'MJ: Template Contents', ID: c.ID });
    }
    fx.CreatedRecords.push({ Entity: 'MJ: AI Prompts', ID: prompt.ID });
    return prompt.ID;
}

async function createAgent(ctx: IntegrationCheckContext, fx: NativeToolCallingLiveFixture, name: string, promptID: string, actionID: string): Promise<string> {
    const agent = await ctx.Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', ctx.User);
    agent.NewRecord();
    agent.Name = name;
    agent.Description = `Calls one Action, in native or envelope mode. ${AGENT_LIVE_FIXTURE_TAG}`;
    agent.TypeID = await lookupID(ctx, 'MJ: AI Agent Types', `Name='Loop'`);
    agent.Status = 'Active';
    agent.ExposeAsAction = false;
    agent.ModelSelectionMode = 'Agent';
    agent.ArtifactCreationMode = 'Never';
    agent.InjectNotes = false;
    agent.InjectExamples = false;
    agent.MaxIterationsPerRun = 6;
    await saveOrThrow(agent, name);
    fx.CreatedRecords.push({ Entity: 'MJ: AI Agents', ID: agent.ID });

    const link = await ctx.Provider.GetEntityObject<MJAIAgentPromptEntity>('MJ: AI Agent Prompts', ctx.User);
    link.NewRecord();
    link.AgentID = agent.ID;
    link.PromptID = promptID;
    link.ExecutionOrder = 0;
    link.Status = 'Active';
    await saveOrThrow(link, `${name} prompt link`);
    fx.CreatedRecords.push({ Entity: 'MJ: AI Agent Prompts', ID: link.ID });

    const agentAction = await ctx.Provider.GetEntityObject<MJAIAgentActionEntity>('MJ: AI Agent Actions', ctx.User);
    agentAction.NewRecord();
    agentAction.AgentID = agent.ID;
    agentAction.ActionID = actionID;
    agentAction.Status = 'Active';
    await saveOrThrow(agentAction, `${name} action link`);
    fx.CreatedRecords.push({ Entity: 'MJ: AI Agent Actions', ID: agentAction.ID });
    return agent.ID;
}

async function idsWhere(ctx: IntegrationCheckContext, entity: string, filter: string): Promise<string[]> {
    const r = await new RunView().RunView<{ ID: string }>({ EntityName: entity, ExtraFilter: filter, Fields: ['ID'], ResultType: 'simple', BypassCache: true }, ctx.User);
    return (r.Results ?? []).map((row) => row.ID);
}

async function deleteWhere(ctx: IntegrationCheckContext, entity: string, filter: string): Promise<void> {
    for (const id of await idsWhere(ctx, entity, filter)) await DeleteById(entity, id, ctx.Provider, ctx.User);
}

/** Removes one leftover fixture agent: its runs (with their action logs), leftovers, links and prompt. */
async function removeStaleAgent(ctx: IntegrationCheckContext, agentID: string): Promise<void> {
    for (const runID of await idsWhere(ctx, 'MJ: AI Agent Runs', `AgentID='${agentID}'`)) {
        for (const logID of await actionLogIDsForRun(ctx, runID)) await DeleteById('MJ: Action Execution Logs', logID, ctx.Provider, ctx.User);
        await PurgeAgentRun(runID, ctx.Provider, ctx.User);
    }
    await deleteAgentLeftovers(ctx, agentID);
    await deleteWhere(ctx, 'MJ: AI Agent Actions', `AgentID='${agentID}'`);
    await deleteWhere(ctx, 'MJ: AI Agent Prompts', `AgentID='${agentID}'`);
    await DeleteById('MJ: AI Agents', agentID, ctx.Provider, ctx.User);
}

/**
 * Removes fixtures an interrupted earlier run left behind (a killed process never reaches Teardown),
 * found by their names. Without this the next Setup collides on the names.
 */
async function removeStaleFixtures(ctx: IntegrationCheckContext): Promise<void> {
    for (const name of [REPORT_AGENT_NAME, CHART_AGENT_NAME]) {
        for (const agentID of await idsWhere(ctx, 'MJ: AI Agents', `Name='${name}'`)) await removeStaleAgent(ctx, agentID);
        await deleteWhere(ctx, 'MJ: AI Prompts', `Name='${name} - Prompt'`);
        for (const templateID of await idsWhere(ctx, 'MJ: Templates', `Name='${name} - Prompt'`)) {
            await deleteWhere(ctx, 'MJ: Template Contents', `TemplateID='${templateID}'`);
            await DeleteById('MJ: Templates', templateID, ctx.Provider, ctx.User);
        }
    }
    for (const actionID of await idsWhere(ctx, 'MJ: Actions', `Name='${REPORT_ACTION_NAME}'`)) {
        await deleteWhere(ctx, 'MJ: Action Execution Logs', `ActionID='${actionID}'`);
        await deleteWhere(ctx, 'MJ: Action Params', `ActionID='${actionID}'`);
        await DeleteById('MJ: Actions', actionID, ctx.Provider, ctx.User);
    }
}

async function setup(ctx: IntegrationCheckContext): Promise<void> {
    const fx: NativeToolCallingLiveFixture = {
        ReportAgentID: '', ChartAgentID: '', ReportActionID: '', ReportPromptID: '', ChartPromptID: '', CreatedRecords: [], RunIds: []
    };
    ctx.NativeToolCallingLiveFixture = fx;
    await removeStaleFixtures(ctx);
    const chartActionID = await lookupID(ctx, 'MJ: Actions', `Name='${CHART_ACTION_NAME}'`);
    fx.ReportActionID = await createReportAction(ctx, fx);
    fx.ReportPromptID = await createPrompt(ctx, fx, `${REPORT_AGENT_NAME} - Prompt`, REPORT_AGENT_INSTRUCTIONS);
    fx.ReportAgentID = await createAgent(ctx, fx, REPORT_AGENT_NAME, fx.ReportPromptID, fx.ReportActionID);
    fx.ChartPromptID = await createPrompt(ctx, fx, `${CHART_AGENT_NAME} - Prompt`, CHART_AGENT_INSTRUCTIONS);
    fx.ChartAgentID = await createAgent(ctx, fx, CHART_AGENT_NAME, fx.ChartPromptID, chartActionID);
    // The prompt runner renders through the template engine's cache, which holds the templates this
    // setup just created only after a refresh.
    await TemplateEngineServer.Instance.Config(true, ctx.User, ctx.Provider);
    await AIEngine.Instance.Config(true, ctx.User);
}

/** The execution logs a run's Actions steps link to. */
async function actionLogIDsForRun(ctx: IntegrationCheckContext, runID: string): Promise<string[]> {
    const steps = await new RunView().RunView<{ TargetLogID: string | null }>({
        EntityName: 'MJ: AI Agent Run Steps', ExtraFilter: `AgentRunID='${runID}' AND StepType='Actions'`,
        Fields: ['TargetLogID'], ResultType: 'simple', BypassCache: true
    }, ctx.User);
    return (steps.Results ?? []).map((s) => s.TargetLogID).filter((id): id is string => !!id);
}

/**
 * Rows a run can leave that reference the agent directly: AI Agent Requests (a model that asked the
 * user something) and any prompt run the step-based purge did not reach. Deleted before the agent,
 * because spDeleteAIAgent's cascade into AI Agent Requests fails the delete.
 */
async function deleteAgentLeftovers(ctx: IntegrationCheckContext, agentID: string): Promise<void> {
    for (const entity of ['MJ: AI Agent Requests', 'MJ: AI Prompt Runs']) {
        const rows = await new RunView().RunView<{ ID: string }>({
            EntityName: entity, ExtraFilter: `AgentID='${agentID}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true
        }, ctx.User).catch(() => null);
        for (const row of rows?.Results ?? []) await DeleteById(entity, row.ID, ctx.Provider, ctx.User);
    }
}

async function teardown(ctx: IntegrationCheckContext): Promise<void> {
    const fx = ctx.NativeToolCallingLiveFixture;
    if (!fx) return;
    for (const runID of fx.RunIds) {
        for (const logID of await actionLogIDsForRun(ctx, runID).catch(() => [])) {
            await DeleteById('MJ: Action Execution Logs', logID, ctx.Provider, ctx.User);
        }
        await PurgeAgentRun(runID, ctx.Provider, ctx.User).catch(() => undefined);
    }
    for (const agentID of [fx.ReportAgentID, fx.ChartAgentID].filter(Boolean)) {
        await deleteAgentLeftovers(ctx, agentID);
    }
    for (const record of [...fx.CreatedRecords].reverse()) {
        await DeleteById(record.Entity, record.ID, ctx.Provider, ctx.User);
    }
    await AIEngine.Instance.Config(true, ctx.User).catch(() => undefined);
    ctx.NativeToolCallingLiveFixture = undefined;
}

// ─── Running and observing ─────────────────────────────────────────────────────

/** Sets `LLM.UseNativeToolCalling` on one of the fixture's own prompts and refreshes the engine. */
async function setNativePreference(ctx: IntegrationCheckContext, promptID: string, useNative: boolean): Promise<void> {
    const prompt = await ctx.Provider.GetEntityObject<MJAIPromptEntity>('MJ: AI Prompts', ctx.User);
    Assert(await prompt.Load(promptID), `fixture prompt ${promptID} loads`);
    prompt.PromptConfigurationObject = { LLM: { UseNativeToolCalling: useNative } };
    await saveOrThrow(prompt, `fixture prompt ${promptID}`);
    await AIEngine.Instance.Config(true, ctx.User);
}

interface RunOutcome {
    RunID: string | null;
    Status: string;
    ErrorMessage: string | null;
    /** `ToolCallingMode` of every prompt call, oldest first. */
    Modes: string[];
    /** The arguments each Action call received, from its execution log. */
    Calls: Array<{ ActionID: string; Args: Record<string, unknown> }>;
}

async function runAgent(ctx: IntegrationCheckContext, agentID: string, request: string, target: NativeTarget): Promise<RunOutcome> {
    const agent = AIEngine.Instance.Agents.find((a) => UUIDsEqual(a.ID, agentID));
    Assert(!!agent, `fixture agent ${agentID} is loaded in AIEngine`);
    const result = await new AgentRunner().RunAgent({
        agent: agent!,
        conversationMessages: [{ role: 'user', content: request }],
        contextUser: ctx.User,
        override: { modelId: target.Model.ID, vendorId: target.ModelVendor.VendorID }
    });
    const runID = result.agentRun?.ID ?? null;
    if (runID) fixture(ctx).RunIds.push(runID);
    await Sleep(AGENT_LIVE_SETTLE_MS);
    return {
        RunID: runID,
        Status: result.agentRun?.Status ?? 'Unknown',
        ErrorMessage: result.agentRun?.ErrorMessage ?? null,
        Modes: runID ? await toolCallingModes(ctx, runID) : [],
        Calls: runID ? await actionCalls(ctx, runID) : []
    };
}

async function toolCallingModes(ctx: IntegrationCheckContext, runID: string): Promise<string[]> {
    // Reached through the run's Prompt steps — the shared helper owns that linkage.
    const promptRunIDs = await ResolvePromptRunIdsForAgentRuns([runID], ctx.User, ctx.Provider, ['Prompt']);
    if (promptRunIDs.length === 0) return [];
    const r = await new RunView().RunView<{ ToolCallingMode: string | null }>({
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `ID IN (${promptRunIDs.map((id) => `'${id}'`).join(',')})`,
        OrderBy: '__mj_CreatedAt ASC', Fields: ['ToolCallingMode'], ResultType: 'simple', BypassCache: true
    }, ctx.User);
    return (r.Results ?? []).map((p) => p.ToolCallingMode ?? 'null');
}

async function actionCalls(ctx: IntegrationCheckContext, runID: string): Promise<RunOutcome['Calls']> {
    const logIDs = await actionLogIDsForRun(ctx, runID);
    if (logIDs.length === 0) return [];
    const logs = await new RunView().RunView<{ ActionID: string; Params: string | null }>({
        EntityName: 'MJ: Action Execution Logs', ExtraFilter: `ID IN (${logIDs.map((id) => `'${id}'`).join(',')})`,
        OrderBy: 'StartedAt ASC', Fields: ['ActionID', 'Params'], ResultType: 'simple', BypassCache: true
    }, ctx.User);
    return (logs.Results ?? []).map((l) => ({ ActionID: l.ActionID, Args: logArguments(l.Params) }));
}

/** The `{Name, Value}` list an execution log stores, as an argument object. */
function logArguments(params: string | null): Record<string, unknown> {
    if (!params) return {};
    const list: Array<{ Name: string; Value: unknown; Type?: string }> = JSON.parse(params);
    return Object.fromEntries(list.filter((p) => p.Type !== 'Output').map((p) => [p.Name, p.Value]));
}

/** Why a failed run says nothing about tool calling (retired model, no balance), or null. */
function unavailableReason(outcome: RunOutcome): string | null {
    if (outcome.Status === 'Completed') return null;
    const message = outcome.ErrorMessage ?? '';
    // Phrased about the MODEL on purpose: a bare "not found" also matches framework errors (a missing
    // template, a missing record), and counting those as unavailability would turn a real failure green.
    if (/\b404\b|model\b[^.\n]{0,80}\b(not found|does not exist|no longer available|not deployed)/i.test(message)) return 'model unavailable at the vendor';
    if (/insufficient balance|insufficient_quota|quota exceeded|recharge/i.test(message)) return 'account has no balance or quota';
    return null;
}

// ─── Judging a run ─────────────────────────────────────────────────────────────

interface Expectation {
    Mode: 'native' | 'envelope';
    ActionID: string;
    Schemas: ParamSchemaMap;
    /** Native gaps that apply to this check only, on top of {@link KNOWN_NATIVE_GAPS}. */
    ExtraNativeGaps?: Record<string, string>;
}

/** The problems with one run against what the check expects; empty when it is right. */
function judge(target: NativeTarget, outcome: RunOutcome, expected: Expectation): string[] {
    const who = label(target);
    if (outcome.Status !== 'Completed') return [`${who}: run ended '${outcome.Status}' — ${outcome.ErrorMessage ?? '(no message)'}`];
    const problems: string[] = [];
    const wrongModes = outcome.Modes.filter((m) => (expected.Mode === 'native' ? !NATIVE_MODES.has(m) : m !== 'Envelope'));
    if (outcome.Modes.length === 0 || wrongModes.length > 0) {
        problems.push(`${who}: expected every call ${expected.Mode}, got ToolCallingMode [${outcome.Modes.join(', ')}]`);
    }
    const call = outcome.Calls.find((c) => UUIDsEqual(c.ActionID, expected.ActionID));
    if (!call) return [...problems, `${who}: model-noncompliance — the Action was never called in ${COMPLIANCE_ATTEMPTS} attempts`];
    problems.push(...ValidateArguments(call.Args, expected.Schemas).map((p) => `${who}: ${p}`));
    return problems;
}

async function runTargets(check: string, targets: NativeTarget[], run: (t: NativeTarget) => Promise<string[]>): Promise<void> {
    if (targets.length === 0) {
        console.warn(`  ⚠ ${check} SKIPPED — no target in scope has a credential in this environment.`);
        return;
    }
    const failures: string[] = [];
    for (const target of targets) failures.push(...await run(target));
    Assert(failures.length === 0, `${check}: ${failures.length} problem(s) across ${targets.length} model(s):\n    ${failures.join('\n    ')}`);
}

/**
 * Attempts per target before model variance (see {@link varianceReason}) counts as a problem. What the
 * model chooses varies run to run; what the framework does with it does not, so a variant run is
 * retried and only the first clean run is judged (the suite's RunWithCompliance convention).
 */
const COMPLIANCE_ATTEMPTS = 3;

/**
 * Why a run reflects the model's variance rather than the framework, or null. Two cases: the run
 * completed without calling the Action, or a native run fell back because the vendor rejected the
 * model's own arguments (Groq validates them against the declared schema, so a model that sends
 * `"true"` for a boolean is refused before MJ's coercion can run). A model that does either on every
 * attempt is still a problem.
 */
function varianceReason(outcome: RunOutcome, expected: Expectation): string | null {
    if (outcome.Status !== 'Completed') return null;
    if (!outcome.Calls.some((c) => UUIDsEqual(c.ActionID, expected.ActionID))) return 'completed without calling the Action';
    if (expected.Mode === 'native' && outcome.Modes.includes('NativeFallback')) return 'a native call was rejected and fell back to the envelope';
    return null;
}

/** Runs one agent on one target and judges it; logs gaps and unavailability instead of counting them. */
async function runAndJudge(ctx: IntegrationCheckContext, target: NativeTarget, agentID: string, request: string, expected: Expectation): Promise<string[]> {
    const apiName = (target.ModelVendor.APIName ?? '').toLowerCase();
    const gap = expected.Mode === 'native' ? (KNOWN_NATIVE_GAPS[apiName] ?? expected.ExtraNativeGaps?.[apiName]) : undefined;
    for (let attempt = 1; attempt <= COMPLIANCE_ATTEMPTS; attempt++) {
        const outcome = await runAgent(ctx, agentID, request, target);
        const reason = unavailableReason(outcome);
        if (reason) { console.log(`      ○ ${label(target)}: ${reason} (${outcome.ErrorMessage}); not counted`); return []; }
        const variance = gap ? null : varianceReason(outcome, expected);
        if (variance && attempt < COMPLIANCE_ATTEMPTS) {
            console.warn(`      ↻ ${label(target)} ${expected.Mode}: attempt ${attempt}/${COMPLIANCE_ATTEMPTS} ${variance}; retrying`);
            continue;
        }
        const problems = judge(target, outcome, expected);
        console.log(`      ● ${label(target)} ${expected.Mode}: ${outcome.Status}; modes [${outcome.Modes.join(', ')}]; ${problems.length === 0 ? 'arguments match the schemas' : problems.join('; ')}${gap ? `; known gap: ${gap}` : ''}`);
        return gap ? [] : problems;
    }
    return [];
}

function reportPrompt(ctx: IntegrationCheckContext): MJAIPromptEntityExtended {
    const prompt = AIEngine.Instance.Prompts.find((p) => UUIDsEqual(p.ID, fixture(ctx).ReportPromptID));
    Assert(!!prompt, 'the report fixture prompt is loaded in AIEngine');
    return prompt!;
}

/** The stock chart Action's backfilled schemas; fails when they never reached this database. */
async function chartSchemas(ctx: IntegrationCheckContext): Promise<{ ActionID: string; Schemas: ParamSchemaMap }> {
    const actionID = await lookupID(ctx, 'MJ: Actions', `Name='${CHART_ACTION_NAME}'`);
    const params = await new RunView().RunView<MJActionParamEntity>({
        EntityName: 'MJ: Action Params', ExtraFilter: `ActionID='${actionID}'`, ResultType: 'entity_object', BypassCache: true
    }, ctx.User);
    const map = new Map<string, { Schema: ParamSchema; IsArray: boolean }>();
    for (const p of params.Results ?? []) {
        const schema = p.ValueSchemaObject;
        if (schema) map.set(p.Name, { Schema: schema, IsArray: p.IsArray });
    }
    Assert(map.size >= 5, `'${CHART_ACTION_NAME}' has ${map.size} params with a ValueSchema; the backfill is missing — run mj sync push --dir=metadata`);
    return { ActionID: actionID, Schemas: map };
}

/** Logs whether the Loop system prompt opts in itself, which would mean NTC1 no longer isolates the child layer. */
function noteParentPreference(): void {
    const parent = AIEngine.Instance.Prompts.find((p) => p.Name === LOOP_SYSTEM_PROMPT_NAME);
    if (parent?.PromptConfigurationObject?.LLM?.UseNativeToolCalling === true) {
        console.log(`      ○ note: '${LOOP_SYSTEM_PROMPT_NAME}' opts in to native itself, so NTC1 does not isolate the agent prompt's layer`);
    }
}

// ─── Checks ────────────────────────────────────────────────────────────────────

export const NativeToolCallingLiveChecks: NamedCheck[] = [
    {
        Id: 'native-tool-calling-live.NTC1',
        Name: "NTC1: native mode set on the agent's own prompt runs every call native, and the Action receives arguments that match its ValueSchemas",
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const fx = fixture(ctx);
            noteParentPreference();
            await setNativePreference(ctx, fx.ReportPromptID, true);
            const expected: Expectation = { Mode: 'native', ActionID: fx.ReportActionID, Schemas: ReportParamSchemas() };
            await runTargets('NTC1', callableNativeTargets(reportPrompt(ctx)), (t) => runAndJudge(ctx, t, fx.ReportAgentID, REPORT_REQUEST, expected));
        }
    },
    {
        Id: 'native-tool-calling-live.NTC2',
        Name: 'NTC2: envelope mode runs every call on the envelope path, and the Action receives arguments that match its ValueSchemas',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const fx = fixture(ctx);
            await setNativePreference(ctx, fx.ReportPromptID, false);
            const expected: Expectation = { Mode: 'envelope', ActionID: fx.ReportActionID, Schemas: ReportParamSchemas() };
            await runTargets('NTC2', callableNativeTargets(reportPrompt(ctx)), (t) => runAndJudge(ctx, t, fx.ReportAgentID, REPORT_REQUEST, expected));
        }
    },
    {
        Id: 'native-tool-calling-live.NTC3',
        Name: "NTC3: the stock Create SVG Chart Action receives arguments that match its backfilled ValueSchemas, in native and envelope mode",
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const fx = fixture(ctx);
            const chart = await chartSchemas(ctx);
            const targets = callableNativeTargets(reportPrompt(ctx));
            await runTargets('NTC3', targets, async (t) => {
                const problems: string[] = [];
                for (const mode of ['native', 'envelope'] as const) {
                    await setNativePreference(ctx, fx.ChartPromptID, mode === 'native');
                    problems.push(...await runAndJudge(ctx, t, fx.ChartAgentID, CHART_REQUEST, { Mode: mode, ActionID: chart.ActionID, Schemas: chart.Schemas, ExtraNativeGaps: KNOWN_CHART_NATIVE_GAPS }));
                }
                return problems;
            });
        }
    },
    {
        Id: 'native-tool-calling-live.NTC4',
        Name: 'NTC4: a native request on a vendor row that declares SupportsNativeToolCalling false runs on the envelope path and completes',
        RequiresLiveModel: true,
        Fn: async (ctx): Promise<void> => {
            const fx = fixture(ctx);
            await setNativePreference(ctx, fx.ReportPromptID, true);
            const runner = new CredentialProbeRunner();
            const target = capabilityGateCandidates().find((t) => runner.HasCredentialFor(reportPrompt(ctx), t));
            const expected: Expectation = { Mode: 'envelope', ActionID: fx.ReportActionID, Schemas: ReportParamSchemas() };
            await runTargets('NTC4', target ? [target] : [], (t) => runAndJudge(ctx, t, fx.ReportAgentID, REPORT_REQUEST, expected));
        }
    }
];

for (const check of NativeToolCallingLiveChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('native-tool-calling-live', {
    Setup: setup,
    Teardown: teardown
});
