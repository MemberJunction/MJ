/**
 * native-tool-loop-shared.ts — the drivers and fixtures behind the `native-tool-loop` (deterministic)
 * and `native-tool-loop-live` (live-model) bundles.
 *
 * Two LLM drivers, each served by fixture AI Model / AI Vendor / AI Model Vendor rows so that real
 * agents run through `AgentRunner`, the prompt runner and its native tool-calling gate exactly as in
 * production:
 *
 * - {@link ITScriptedToolLLM} answers from a per-check script and records every request it receives.
 *   No network, no credential: it is what makes the deterministic tier possible.
 * - {@link ITRecordingLLM} forwards every request to a real driver (Anthropic, OpenAI, Gemini) and
 *   records the request and the reply. It can stand in for the model on the first turn with a call
 *   to a tool the request did not declare, which forces the loop's generic Retry on a native turn —
 *   the history every later request carries is then exactly the one that used to fail with a 400.
 */
import { RegisterClass, MJGlobal } from '@memberjunction/global';
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import {
    BaseLLM, ChatResult, ModelUsage, GetAIAPIKey, ChatMessageRole,
    type ChatParams, type ChatMessage, type ChatToolCall, type ChatToolChoice, type ChatReasoningBlock,
    type ClassifyParams, type ClassifyResult, type SummarizeParams, type SummarizeResult, type AIErrorInfo
} from '@memberjunction/ai';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import type {
    MJAIAgentActionEntity, MJAIAgentEntity, MJAIAgentPromptEntity, MJAIModelEntity, MJAIModelVendorEntity, MJAIVendorEntity
} from '@memberjunction/core-entities';
import { Assert } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';
import { AGENT_LIVE_FIXTURE_TAG, DeleteById, PurgeAgentRun, ResolvePromptRunIdsForAgentRuns } from './agent-live-shared';

export const SCRIPTED_DRIVER = 'ITScriptedToolLLM';
export const RECORDING_DRIVER = 'ITRecordingLLM';

// ─── Recorded traffic ──────────────────────────────────────────────────────────

/** One request a fixture driver received, frozen at the moment it arrived. */
export interface RecordedRequest {
    Model: string;
    Messages: ChatMessage[];
    Tools: string[];
    ToolChoice: ChatToolChoice | undefined;
    ParallelToolCalls: boolean | undefined;
    EffortLevel: string | undefined;
}

/** One reply the recording driver forwarded back. */
export interface RecordedReply {
    Success: boolean;
    ErrorMessage: string;
    ToolCalls: ChatToolCall[];
    Reasoning: ChatReasoningBlock[];
    Thinking: string;
}

function record(params: ChatParams): RecordedRequest {
    return {
        Model: params.model,
        Messages: JSON.parse(JSON.stringify(params.messages ?? [])) as ChatMessage[],
        Tools: (params.tools ?? []).map((t) => t.name),
        ToolChoice: params.toolChoice,
        ParallelToolCalls: params.parallelToolCalls,
        EffortLevel: params.effortLevel
    };
}

// ─── Replies ───────────────────────────────────────────────────────────────────

/** One scripted model turn: what to answer, given the request it answers. */
export type ScriptedTurn = (request: RecordedRequest, index: number) => ChatResult;

function result(message: ChatResult['data']['choices'][number]['message'], finishReason: string, extra: { finishMessage?: string } = {}): ChatResult {
    const now = new Date();
    const r = new ChatResult(true, now, now);
    r.statusText = 'OK';
    r.data = { choices: [{ message, finish_reason: finishReason, index: 0, ...extra }], usage: new ModelUsage(10, 5) };
    r.errorMessage = '';
    return r;
}

/** A turn that calls tools — ids are generated per turn so every call in a run is unique. */
export function ToolCallTurn(calls: Array<{ name: string; args?: Record<string, unknown> }>, opts: { text?: string; reasoning?: ChatReasoningBlock[] } = {}): ScriptedTurn {
    return (_req, index) => result({
        role: 'assistant',
        content: opts.text ?? '',
        toolCalls: calls.map((c, i) => ({ id: `it_call_${index}_${i}`, name: c.name, arguments: c.args ?? {} })),
        ...(opts.reasoning ? { reasoning: opts.reasoning } : {})
    }, 'tool_calls');
}

/** A plain-text turn — under implicit control flow, the run's answer. */
export function TextTurn(text: string): ScriptedTurn {
    return () => result({ role: 'assistant', content: text }, 'stop');
}

/** A turn on which the provider rejected the model's tool call (malformed or unexpected). */
export function RejectedCallTurn(finishReason: string, finishMessage: string): ScriptedTurn {
    return () => result({ role: 'assistant', content: '' }, finishReason, { finishMessage });
}

/** A failed request, as a provider error the error analyzer has classified. */
export function FailedTurn(message: string, errorType: AIErrorInfo['errorType']): ScriptedTurn {
    return () => {
        const now = new Date();
        const r = new ChatResult(false, now, now);
        r.statusText = 'error';
        r.errorMessage = message;
        r.data = { choices: [], usage: new ModelUsage(0, 0) };
        r.errorInfo = { errorType, severity: 'Fatal', canFailover: false, httpStatusCode: 400, context: {}, error: new Error(message) };
        return r;
    };
}

// ─── The scripted driver ───────────────────────────────────────────────────────

/** What the scripted driver answers next and what it has received. Reset per check with {@link ResetScript}. */
export const ScriptState: { Turns: ScriptedTurn[]; Requests: RecordedRequest[] } = { Turns: [], Requests: [] };

/** Starts a check's script; a request past its end is answered "Done." in plain text. */
export function ResetScript(turns: ScriptedTurn[]): void {
    ScriptState.Turns = turns;
    ScriptState.Requests = [];
}

@RegisterClass(BaseLLM, SCRIPTED_DRIVER)
export class ITScriptedToolLLM extends BaseLLM {
    public override get SupportsTools(): boolean {
        return true;
    }

    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        const request = record(params);
        ScriptState.Requests.push(request);
        const index = ScriptState.Requests.length - 1;
        const turn = ScriptState.Turns[index] ?? TextTurn('Done.');
        return turn(request, index);
    }

    public async ClassifyText(_params: ClassifyParams): Promise<ClassifyResult> {
        throw new Error(`${SCRIPTED_DRIVER} does not classify`);
    }

    public async SummarizeText(_params: SummarizeParams): Promise<SummarizeResult> {
        throw new Error(`${SCRIPTED_DRIVER} does not summarize`);
    }

    protected async createStreamingRequest(_params: ChatParams): Promise<never> {
        throw new Error(`${SCRIPTED_DRIVER} does not stream`);
    }

    protected processStreamingChunk(_chunk: unknown): { content: string } {
        return { content: '' };
    }

    protected finalizeStreamingResponse(): ChatResult {
        throw new Error(`${SCRIPTED_DRIVER} does not stream`);
    }
}

// ─── The recording driver ──────────────────────────────────────────────────────

/** Per check: which real driver serves each API name, whether to inject, and what went by. */
export const RecordingState: {
    RealDriverByAPIName: Map<string, string>;
    InjectUndeclaredCallOnFirstTurn: boolean;
    Requests: RecordedRequest[];
    Replies: RecordedReply[];
} = { RealDriverByAPIName: new Map(), InjectUndeclaredCallOnFirstTurn: false, Requests: [], Replies: [] };

/** The tool the recording driver pretends the model called on the first turn. */
export const UNDECLARED_TOOL = 'it_lookup_quarterly_totals';

export function ResetRecording(injectUndeclaredCall: boolean): void {
    RecordingState.InjectUndeclaredCallOnFirstTurn = injectUndeclaredCall;
    RecordingState.Requests = [];
    RecordingState.Replies = [];
}

@RegisterClass(BaseLLM, RECORDING_DRIVER)
export class ITRecordingLLM extends BaseLLM {
    private readonly inner = new Map<string, BaseLLM>();

    public override get SupportsTools(): boolean {
        return true;
    }

    private realDriver(apiName: string): BaseLLM {
        const driver = RecordingState.RealDriverByAPIName.get(apiName);
        if (!driver) throw new Error(`${RECORDING_DRIVER}: no real driver registered for '${apiName}'`);
        let llm = this.inner.get(driver);
        if (!llm) {
            const created = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, driver, GetAIAPIKey(driver));
            if (!created) throw new Error(`${RECORDING_DRIVER}: driver '${driver}' is not registered`);
            llm = created;
            this.inner.set(driver, llm);
        }
        return llm;
    }

    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        const request = record(params);
        RecordingState.Requests.push(request);
        if (RecordingState.InjectUndeclaredCallOnFirstTurn && RecordingState.Requests.length === 1) {
            return ToolCallTurn([{ name: UNDECLARED_TOOL, args: { quarter: 'Q3' } }])(request, 0);
        }
        let reply: ChatResult;
        try {
            reply = await this.realDriver(params.model).ChatCompletion(params);
        } catch (error) {
            // Some SDKs throw a 400 rather than returning a failed result; a rejection either way.
            RecordingState.Replies.push({ Success: false, ErrorMessage: error instanceof Error ? error.message : String(error), ToolCalls: [], Reasoning: [], Thinking: '' });
            throw error;
        }
        const message = reply.data?.choices?.[0]?.message;
        RecordingState.Replies.push({
            Success: reply.success,
            ErrorMessage: reply.errorMessage ?? '',
            ToolCalls: message?.toolCalls ?? [],
            Reasoning: message?.reasoning ?? [],
            Thinking: message?.thinking ?? ''
        });
        return reply;
    }

    public async ClassifyText(_params: ClassifyParams): Promise<ClassifyResult> {
        throw new Error(`${RECORDING_DRIVER} does not classify`);
    }

    public async SummarizeText(_params: SummarizeParams): Promise<SummarizeResult> {
        throw new Error(`${RECORDING_DRIVER} does not summarize`);
    }

    protected async createStreamingRequest(_params: ChatParams): Promise<never> {
        throw new Error(`${RECORDING_DRIVER} does not stream`);
    }

    protected processStreamingChunk(_chunk: unknown): { content: string } {
        return { content: '' };
    }

    protected finalizeStreamingResponse(): ChatResult {
        throw new Error(`${RECORDING_DRIVER} does not stream`);
    }
}

// ─── Reading recorded history ──────────────────────────────────────────────────

/** A tool_result block as the history carries it. */
export interface ResultBlock { type: string; toolCallId?: string; toolName?: string; isError?: boolean; content?: string }

/** The tool_result blocks of a message, or none. */
export function ResultBlocksOf(message: ChatMessage | undefined): ResultBlock[] {
    return Array.isArray(message?.content) ? (message!.content as unknown as ResultBlock[]).filter((b) => b.type === 'tool_result') : [];
}

/** The text of a message, whatever its content shape. */
export function TextOf(message: ChatMessage | undefined): string {
    if (!message) return '';
    return typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
}

/**
 * Every place a request's history breaks the provider contract: an assistant call turn whose calls
 * are not ALL answered by the run of tool turns directly after it (consecutive tool turns are one
 * provider message on every driver). Empty when the history is valid.
 */
export function AdjacencyViolations(messages: ChatMessage[]): string[] {
    const problems: string[] = [];
    messages.forEach((m, i) => {
        if (m.role !== ChatMessageRole.assistant || !m.toolCalls?.length) return;
        // Anthropic takes every result for a call turn from the ONE message after it.
        const next = messages[i + 1];
        const answered = new Set<string>();
        if (next?.role === ChatMessageRole.tool) {
            for (const b of ResultBlocksOf(next)) if (b.toolCallId) answered.add(b.toolCallId);
        }
        for (const call of m.toolCalls) {
            if (!answered.has(call.id)) problems.push(`message ${i}: call ${call.name} (${call.id}) is not answered by the tool turn right after it — next is '${next?.role ?? 'nothing'}'`);
        }
        if (messages[i + 2]?.role === ChatMessageRole.tool) problems.push(`message ${i}: its results are split across more than one tool turn`);
    });
    return problems;
}

// ─── Fixtures ──────────────────────────────────────────────────────────────────

/** Rows a bundle created, deleted in reverse order at teardown, plus the runs to purge. */
export interface NativeLoopFixture {
    CreatedRecords: Array<{ Entity: string; ID: string }>;
    RunIds: string[];
    AgentIds: string[];
}

export function NewFixture(): NativeLoopFixture {
    return { CreatedRecords: [], RunIds: [], AgentIds: [] };
}

async function saveOrThrow(entity: { Save(): Promise<boolean>; LatestResult?: { CompleteMessage?: string } | null }, what: string): Promise<void> {
    Assert(await entity.Save(), `${what} save failed: ${entity.LatestResult?.CompleteMessage ?? '(no message)'}`);
}

export async function LookupID(ctx: IntegrationCheckContext, entity: string, filter: string): Promise<string> {
    const r = await new RunView().RunView<{ ID: string }>({ EntityName: entity, ExtraFilter: filter, Fields: ['ID'], ResultType: 'simple', BypassCache: true }, ctx.User);
    Assert(r.Success && r.Results.length > 0, `${entity} where ${filter} not found`);
    return r.Results[0].ID;
}

export async function IdsWhere(ctx: IntegrationCheckContext, entity: string, filter: string): Promise<string[]> {
    const r = await new RunView().RunView<{ ID: string }>({ EntityName: entity, ExtraFilter: filter, Fields: ['ID'], ResultType: 'simple', BypassCache: true }, ctx.User);
    return (r.Results ?? []).map((row) => row.ID);
}

/** A fixture vendor whose rows the fixture drivers serve. */
export async function CreateVendor(ctx: IntegrationCheckContext, fx: NativeLoopFixture, name: string): Promise<string> {
    const vendor = await ctx.Provider.GetEntityObject<MJAIVendorEntity>('MJ: AI Vendors', ctx.User);
    vendor.NewRecord();
    vendor.Name = name;
    vendor.Description = AGENT_LIVE_FIXTURE_TAG;
    await saveOrThrow(vendor, name);
    fx.CreatedRecords.push({ Entity: 'MJ: AI Vendors', ID: vendor.ID });
    return vendor.ID;
}

/** A fixture LLM model row with the given catalog configuration. */
export async function CreateModel(ctx: IntegrationCheckContext, fx: NativeLoopFixture, name: string, configuration: Record<string, unknown>): Promise<string> {
    const model = await ctx.Provider.GetEntityObject<MJAIModelEntity>('MJ: AI Models', ctx.User);
    model.NewRecord();
    model.Name = name;
    model.Description = AGENT_LIVE_FIXTURE_TAG;
    model.AIModelTypeID = await LookupID(ctx, 'MJ: AI Model Types', `Name='LLM'`);
    model.IsActive = true;
    model.PowerRank = 1;
    model.SpeedRank = 1;
    model.CostRank = 1;
    model.ModelConfiguration = JSON.stringify(configuration);
    await saveOrThrow(model, name);
    fx.CreatedRecords.push({ Entity: 'MJ: AI Models', ID: model.ID });
    return model.ID;
}

export interface ModelVendorRowInput {
    ModelID: string;
    VendorID: string;
    DriverClass: string;
    APIName: string;
    ModelConfiguration?: string | null;
    SupportsEffortLevel?: boolean;
    MaxOutputTokens?: number | null;
    MaxInputTokens?: number | null;
}

/** An inference row for a model on a fixture vendor. */
export async function CreateModelVendor(ctx: IntegrationCheckContext, fx: NativeLoopFixture, input: ModelVendorRowInput): Promise<string> {
    const row = await ctx.Provider.GetEntityObject<MJAIModelVendorEntity>('MJ: AI Model Vendors', ctx.User);
    row.NewRecord();
    row.ModelID = input.ModelID;
    row.VendorID = input.VendorID;
    row.TypeID = await LookupID(ctx, 'MJ: AI Vendor Type Definitions', `Name='Inference Provider'`);
    row.DriverClass = input.DriverClass;
    row.APIName = input.APIName;
    row.Priority = 0;
    row.Status = 'Active';
    row.SupportsStreaming = false;
    row.SupportsEffortLevel = input.SupportsEffortLevel ?? false;
    row.MaxOutputTokens = input.MaxOutputTokens ?? null;
    row.MaxInputTokens = input.MaxInputTokens ?? null;
    row.ModelConfiguration = input.ModelConfiguration ?? null;
    await saveOrThrow(row, `${input.APIName} model vendor row`);
    fx.CreatedRecords.push({ Entity: 'MJ: AI Model Vendors', ID: row.ID });
    return row.ID;
}

/** An agent prompt that opts in to native tool calling; its auto-created template is tracked for teardown. */
export async function CreateNativePrompt(ctx: IntegrationCheckContext, fx: NativeLoopFixture, name: string, text: string): Promise<string> {
    const prompt = await ctx.Provider.GetEntityObject<MJAIPromptEntityExtended>('MJ: AI Prompts', ctx.User);
    prompt.NewRecord();
    prompt.Name = name;
    prompt.Description = AGENT_LIVE_FIXTURE_TAG;
    prompt.TypeID = await LookupID(ctx, 'MJ: AI Prompt Types', `Name='Chat'`);
    prompt.TemplateText = text;
    prompt.Status = 'Active';
    prompt.PromptRole = 'System';
    prompt.PromptPosition = 'First';
    prompt.OutputType = 'string';
    prompt.ValidationBehavior = 'Warn';
    prompt.PromptConfigurationObject = { LLM: { UseNativeToolCalling: true } };
    await saveOrThrow(prompt, name);
    if (prompt.TemplateID) {
        fx.CreatedRecords.push({ Entity: 'MJ: Templates', ID: prompt.TemplateID });
        for (const id of await IdsWhere(ctx, 'MJ: Template Contents', `TemplateID='${prompt.TemplateID}'`)) {
            fx.CreatedRecords.push({ Entity: 'MJ: Template Contents', ID: id });
        }
    }
    fx.CreatedRecords.push({ Entity: 'MJ: AI Prompts', ID: prompt.ID });
    return prompt.ID;
}

export interface AgentInput {
    Name: string;
    PromptID: string;
    ActionNames?: string[];
    DriverClass?: string;
    TypeConfiguration?: Record<string, unknown>;
    MaxIterationsPerRun?: number;
    DefaultPromptEffortLevel?: number;
}

/** A Loop agent with one prompt and, optionally, Actions. */
export async function CreateLoopAgent(ctx: IntegrationCheckContext, fx: NativeLoopFixture, input: AgentInput): Promise<string> {
    const agent = await ctx.Provider.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', ctx.User);
    agent.NewRecord();
    agent.Name = input.Name;
    agent.Description = `Native tool loop fixture. ${AGENT_LIVE_FIXTURE_TAG}`;
    agent.TypeID = await LookupID(ctx, 'MJ: AI Agent Types', `Name='Loop'`);
    agent.Status = 'Active';
    agent.ExposeAsAction = false;
    agent.ModelSelectionMode = 'Agent';
    agent.ArtifactCreationMode = 'Never';
    agent.InjectNotes = false;
    agent.InjectExamples = false;
    agent.MaxIterationsPerRun = input.MaxIterationsPerRun ?? 8;
    if (input.DriverClass) agent.DriverClass = input.DriverClass;
    if (input.TypeConfiguration) agent.TypeConfiguration = JSON.stringify(input.TypeConfiguration);
    if (input.DefaultPromptEffortLevel !== undefined) agent.DefaultPromptEffortLevel = input.DefaultPromptEffortLevel;
    await saveOrThrow(agent, input.Name);
    fx.CreatedRecords.push({ Entity: 'MJ: AI Agents', ID: agent.ID });
    fx.AgentIds.push(agent.ID);

    const link = await ctx.Provider.GetEntityObject<MJAIAgentPromptEntity>('MJ: AI Agent Prompts', ctx.User);
    link.NewRecord();
    link.AgentID = agent.ID;
    link.PromptID = input.PromptID;
    link.ExecutionOrder = 0;
    link.Status = 'Active';
    await saveOrThrow(link, `${input.Name} prompt link`);
    fx.CreatedRecords.push({ Entity: 'MJ: AI Agent Prompts', ID: link.ID });

    for (const actionName of input.ActionNames ?? []) {
        const agentAction = await ctx.Provider.GetEntityObject<MJAIAgentActionEntity>('MJ: AI Agent Actions', ctx.User);
        agentAction.NewRecord();
        agentAction.AgentID = agent.ID;
        agentAction.ActionID = await LookupID(ctx, 'MJ: Actions', `Name='${actionName}'`);
        agentAction.Status = 'Active';
        await saveOrThrow(agentAction, `${input.Name} → ${actionName}`);
        fx.CreatedRecords.push({ Entity: 'MJ: AI Agent Actions', ID: agentAction.ID });
    }
    return agent.ID;
}

/** The execution logs a run's Actions steps link to. */
async function actionLogIDsForRun(ctx: IntegrationCheckContext, runID: string): Promise<string[]> {
    const steps = await new RunView().RunView<{ TargetLogID: string | null }>({
        EntityName: 'MJ: AI Agent Run Steps', ExtraFilter: `AgentRunID='${runID}' AND StepType='Actions'`,
        Fields: ['TargetLogID'], ResultType: 'simple', BypassCache: true
    }, ctx.User);
    return (steps.Results ?? []).map((s) => s.TargetLogID).filter((id): id is string => !!id);
}

/** Deletes one run with the execution logs its Actions steps link to. */
export async function PurgeRun(ctx: IntegrationCheckContext, runID: string): Promise<void> {
    for (const logID of await actionLogIDsForRun(ctx, runID).catch(() => [])) {
        await DeleteById('MJ: Action Execution Logs', logID, ctx.Provider, ctx.User);
    }
    await PurgeAgentRun(runID, ctx.Provider, ctx.User).catch(() => undefined);
}

/** Rows a run leaves that reference the agent directly; deleted before the agent itself. */
async function deleteAgentLeftovers(ctx: IntegrationCheckContext, agentID: string): Promise<void> {
    for (const runID of await IdsWhere(ctx, 'MJ: AI Agent Runs', `AgentID='${agentID}'`).catch(() => [])) await PurgeRun(ctx, runID);
    for (const entity of ['MJ: AI Agent Requests', 'MJ: AI Prompt Runs']) {
        for (const id of await IdsWhere(ctx, entity, `AgentID='${agentID}'`).catch(() => [])) await DeleteById(entity, id, ctx.Provider, ctx.User);
    }
}

/** Purges the fixture's runs and deletes its rows in reverse creation order. Never throws. */
export async function TeardownFixture(ctx: IntegrationCheckContext, fx: NativeLoopFixture | undefined): Promise<void> {
    if (!fx) return;
    for (const runID of fx.RunIds) await PurgeRun(ctx, runID);
    for (const agentID of fx.AgentIds) await deleteAgentLeftovers(ctx, agentID);
    for (const record of [...fx.CreatedRecords].reverse()) {
        await DeleteById(record.Entity, record.ID, ctx.Provider, ctx.User);
    }
}

/**
 * Removes rows an interrupted earlier run left behind (a killed process never reaches Teardown),
 * found by the bundle's name prefix. Without this the next Setup collides on unique names.
 */
export async function RemoveStaleFixtures(ctx: IntegrationCheckContext, prefix: string): Promise<void> {
    const like = `LIKE '${prefix}%'`;
    for (const agentID of await IdsWhere(ctx, 'MJ: AI Agents', `Name ${like}`)) {
        await deleteAgentLeftovers(ctx, agentID);
        for (const entity of ['MJ: AI Agent Actions', 'MJ: AI Agent Prompts']) {
            for (const id of await IdsWhere(ctx, entity, `AgentID='${agentID}'`)) await DeleteById(entity, id, ctx.Provider, ctx.User);
        }
        await DeleteById('MJ: AI Agents', agentID, ctx.Provider, ctx.User);
    }
    for (const promptID of await IdsWhere(ctx, 'MJ: AI Prompts', `Name ${like}`)) {
        for (const id of await IdsWhere(ctx, 'MJ: AI Prompt Runs', `PromptID='${promptID}'`)) await DeleteById('MJ: AI Prompt Runs', id, ctx.Provider, ctx.User);
        await DeleteById('MJ: AI Prompts', promptID, ctx.Provider, ctx.User);
    }
    for (const templateID of await IdsWhere(ctx, 'MJ: Templates', `Name ${like}`)) {
        for (const id of await IdsWhere(ctx, 'MJ: Template Contents', `TemplateID='${templateID}'`)) await DeleteById('MJ: Template Contents', id, ctx.Provider, ctx.User);
        await DeleteById('MJ: Templates', templateID, ctx.Provider, ctx.User);
    }
    for (const modelID of await IdsWhere(ctx, 'MJ: AI Models', `Name ${like}`)) {
        for (const id of await IdsWhere(ctx, 'MJ: AI Model Vendors', `ModelID='${modelID}'`)) await DeleteById('MJ: AI Model Vendors', id, ctx.Provider, ctx.User);
        await DeleteById('MJ: AI Models', modelID, ctx.Provider, ctx.User);
    }
    for (const vendorID of await IdsWhere(ctx, 'MJ: AI Vendors', `Name ${like}`)) {
        for (const id of await IdsWhere(ctx, 'MJ: AI Model Vendors', `VendorID='${vendorID}'`)) await DeleteById('MJ: AI Model Vendors', id, ctx.Provider, ctx.User);
        await DeleteById('MJ: AI Vendors', vendorID, ctx.Provider, ctx.User);
    }
}

/** The steps a run persisted, oldest first. */
export interface StepRow { StepType: string; StepName: string; Success: boolean | null; ErrorMessage: string | null; PayloadAtEnd: string | null }

export async function StepsOf(ctx: IntegrationCheckContext, runID: string): Promise<StepRow[]> {
    const r = await new RunView().RunView<StepRow>({
        EntityName: 'MJ: AI Agent Run Steps', ExtraFilter: `AgentRunID='${runID}'`, OrderBy: 'StepNumber ASC',
        Fields: ['StepType', 'StepName', 'Success', 'ErrorMessage', 'PayloadAtEnd'], ResultType: 'simple', BypassCache: true
    }, ctx.User);
    return r.Results ?? [];
}

/** The `ToolCallingMode` of every prompt run the run's Prompt steps link to, oldest first. */
export async function ToolCallingModesOf(ctx: IntegrationCheckContext, runID: string): Promise<string[]> {
    // Reached through the run's Prompt steps — the shared helper owns that linkage.
    const ids = await ResolvePromptRunIdsForAgentRuns([runID], ctx.User, ctx.Provider, ['Prompt']);
    if (ids.length === 0) return [];
    const r = await new RunView().RunView<{ ToolCallingMode: string | null }>({
        EntityName: 'MJ: AI Prompt Runs', ExtraFilter: `ID IN (${ids.map((id) => `'${id}'`).join(',')})`, OrderBy: '__mj_CreatedAt ASC',
        Fields: ['ToolCallingMode'], ResultType: 'simple', BypassCache: true
    }, ctx.User);
    return (r.Results ?? []).map((p) => p.ToolCallingMode ?? 'null');
}

/** Provider + user, for helpers that only need those. */
export type ProviderAndUser = { Provider: IMetadataProvider; User: UserInfo };
