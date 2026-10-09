/**
 * Bound, hidden action parameters (`ExecuteAgentParams.boundActionParams`).
 *
 * Covers the promises: the model is not shown a bound parameter (prose catalog, narrowed catalog,
 * native tool schema, invocation record); the action receives the bound value, marked `Bound`,
 * whatever the model wrote; a call the bindings refuse is locked out before dispatch with a message
 * that names no parameter; a mis-keyed binding fails the run at its start; a bound run is not offered
 * task graphs and refuses one; sub-agent and realtime-delegation runs carry the same bindings. And the
 * negative: with no bindings, what the model is shown and what the action receives are byte-for-byte
 * what they were.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogError, LogErrorEx, LogStatus } from '@memberjunction/core';
import { ActionResult, RunActionParams } from '@memberjunction/actions-base';
import type { MJActionEntityExtended, ActionParam } from '@memberjunction/actions-base';
import type { MJActionParamEntity, MJAIAgentEntityExtended, MJAIAgentRunStepEntityExtended } from '@memberjunction/core-entities';
import type { AIPromptParams, ExecuteAgentParams, AgentSubAgentRequest, BoundActionParams, BaseAgentNextStep, AgentConfiguration } from '@memberjunction/ai-core-plus';
import { BaseAgent, CircuitBreakerActionResult } from '../base-agent';
import { LoopAgentType } from '../agent-types/loop-agent-type';
import { NoCatalogNarrowing } from '../catalog-narrowing';
import { ApplyBoundActionParams, BindingsForAction, IsBoundParamName, UnboundParams } from '../bound-action-params';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn(), LogStatusEx: vi.fn(), LogErrorEx: vi.fn(), IsVerboseLoggingEnabled: vi.fn(() => false) };
});

/** The process-wide base catalog the engine would cache; tests set it per case. */
const catalogHolder = vi.hoisted(() => ({ catalog: undefined as unknown }));
vi.mock('@memberjunction/aiengine', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        AIEngine: {
            Instance: {
                AgentActions: [], Agents: [], AgentRelationships: [], AgentTypes: [],
                GetSubAgents: () => [],
                GetAgentBaseCatalog: () => catalogHolder.catalog,
                SetAgentBaseCatalog: (_id: string, c: unknown) => { catalogHolder.catalog = c; },
                GetAutoActivatableSkillsForAgent: () => [],
                GetClientToolsForAgent: () => []
            }
        }
    };
});

const ACTION_ID = 'aaaaaaaa-0000-4000-8000-00000000000a';
const OTHER_ACTION_ID = 'aaaaaaaa-0000-4000-8000-00000000000b';
const runAction = vi.fn<(params: RunActionParams) => Promise<ActionResult>>();
vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
    ActionEngineServer: { get Instance() { return { RunAction: runAction, Actions: [{ ID: 'aaaaaaaa-0000-4000-8000-00000000000a' }, { ID: 'aaaaaaaa-0000-4000-8000-00000000000b' }], ActionParams: [] }; } },
}));

const runAgent = vi.fn();
vi.mock('../AgentRunner', () => ({ AgentRunner: class { RunAgent = runAgent; } }));

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────────

function param(overrides: Partial<MJActionParamEntity>): MJActionParamEntity {
    return { Name: 'P', Type: 'Input', IsRequired: false, IsArray: false, DefaultValue: null, Description: null, ValueType: 'Scalar', ...overrides } as unknown as MJActionParamEntity;
}

const chapterID = param({ Name: 'ChapterID', IsRequired: true, Description: 'The chapter to list' });
const status = param({ Name: 'Status', Description: 'Member status filter' });
const count = param({ Name: 'Count', Type: 'Output' });
const bothWays = param({ Name: 'Cursor', Type: 'Both' });

function action(id = ACTION_ID, name = 'List Members', params: MJActionParamEntity[] = [chapterID, status, count]): MJActionEntityExtended {
    return { ID: id, Name: name, Description: 'Lists a chapter\'s members', Status: 'Active', Params: { Items: params }, ResultCodes: { Items: [] } } as unknown as MJActionEntityExtended;
}

function agentParams(overrides: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams {
    return { agent: { ID: 'agent-1', Name: 'Space Agent' } as unknown as MJAIAgentEntityExtended, conversationMessages: [], ...overrides };
}

const bindChapter = (value: unknown = 'chapter-7', id = ACTION_ID): BoundActionParams => ({ [id]: { ChapterID: value } });

/** The private members the tests reach through a typed view, never through `any`. */
interface AgentInternals {
    _depth: number;
    _catalogNarrowing: unknown;
    _fatalActionFailures: Set<string>;
    formatActionDetails(actions: MJActionEntityExtended[], bound?: BoundActionParams): string;
    gatherPromptTemplateData(agent: MJAIAgentEntityExtended, user?: unknown, extra?: unknown, actionChanges?: unknown, subAgentChanges?: unknown, bound?: BoundActionParams): Promise<{ actionDetails: string; agentTypePromptParams?: Record<string, unknown> }>;
    _agentTypePromptParams: Record<string, unknown>;
    boundActionParamsError(params: ExecuteAgentParams): string | null;
    shownActionParamEntries(params: ExecuteAgentParams, aa: { name: string; params: Record<string, unknown> }): [string, unknown][];
    ensureCatalogNarrowing: () => Promise<void>;
    availableSkills: () => Promise<unknown[]>;
    buildClientToolPromptSection: () => string;
    buildAppContextSection: () => string;
    formatSkillsCatalog: () => string;
    resolveRealtimeTargetAgent: () => MJAIAgentEntityExtended;
    parseDelegateRequestText: () => string;
    delegateRealtimeToTarget(params: ExecuteAgentParams, config: AgentConfiguration, request: { CallID: string; Arguments: string }): Promise<unknown>;
}

/** Exposes the protected seams and stubs the private ones a catalog render needs. */
class Probe extends BaseAgent {
    public normalizedWith: unknown[] = [];
    constructor(private readonly actions: MJActionEntityExtended[] = [action()]) {
        super();
        (this as unknown as { _agentTypeInstance: unknown })._agentTypeInstance = new LoopAgentType();
    }
    public get Internals(): AgentInternals { return this as unknown as AgentInternals; }
    public Tools(promptParams: AIPromptParams, params: ExecuteAgentParams): void { this.applyNativeTools(promptParams, params); }
    public SubAgent(params: ExecuteAgentParams, request: AgentSubAgentRequest, subAgent: MJAIAgentEntityExtended, step: MJAIAgentRunStepEntityExtended) {
        return this.ExecuteSubAgent(params, request, subAgent, step);
    }
    public Tasks(params: ExecuteAgentParams, decision: BaseAgentNextStep): Promise<BaseAgentNextStep> { return this.executeTasksStep(params, decision); }
    protected override getEffectiveActionsForValidation(): MJActionEntityExtended[] { return this.actions; }
    protected override getEffectiveSubAgentsForValidation(): never[] { return []; }
    protected override normalizeActionParams(params: Record<string, unknown> | null | undefined): string {
        this.normalizedWith.push(params);
        return super.normalizeActionParams(params);
    }
    /** Stubs for the parts of a catalog render that need a database or a decision model. */
    public StubCatalogRender(): this {
        const i = this.Internals;
        i._depth = 0;
        i.ensureCatalogNarrowing = async () => undefined;
        i.availableSkills = async () => [];
        i.buildClientToolPromptSection = () => '';
        i.buildAppContextSection = () => '';
        i.formatSkillsCatalog = () => '';
        return this;
    }
}

function okResult(entity: MJActionEntityExtended): ActionResult {
    const result = new ActionResult();
    result.Success = true;
    result.RunParams = new RunActionParams();
    result.RunParams.Action = entity;
    return result;
}

/** A cached base catalog for `actions`, shaped like `buildAgentBaseCatalog`'s. */
function seedCatalog(probe: Probe, actions: MJActionEntityExtended[], promptParams: Record<string, unknown> = {}): Record<string, unknown> {
    const base = { uniqueActiveSubAgents: [], subAgentCount: 0, subAgentDetails: '', baseActionsRaw: actions, activeActions: actions, actionDetails: probe.Internals.formatActionDetails(actions), baseAgentTypePromptParams: promptParams };
    catalogHolder.catalog = base;
    return base;
}

const AGENT = { ID: 'agent-1', Name: 'Space Agent' } as unknown as MJAIAgentEntityExtended;

beforeEach(() => {
    vi.clearAllMocks();
    catalogHolder.catalog = undefined;
    runAction.mockImplementation(async (p) => okResult(p.Action));
    runAgent.mockResolvedValue({ success: true, agentRun: { ID: 'child-run' }, payload: {} });
});

// ── The pure rules ───────────────────────────────────────────────────────────────────────────────

describe('BindingsForAction', () => {
    it('matches the action ID as a UUID, whatever the casing', () => {
        expect(BindingsForAction({ [ACTION_ID.toUpperCase()]: { ChapterID: 'c' } }, ACTION_ID)).toEqual({ ChapterID: 'c' });
    });
    it('is undefined with no bindings, for an unbound action, and for an empty entry', () => {
        expect(BindingsForAction(undefined, ACTION_ID)).toBeUndefined();
        expect(BindingsForAction(bindChapter(), OTHER_ACTION_ID)).toBeUndefined();
        expect(BindingsForAction({ [ACTION_ID]: {} }, ACTION_ID)).toBeUndefined();
    });
});

describe('UnboundParams', () => {
    it('returns the very same array when nothing is bound', () => {
        const items = [chapterID, status];
        expect(UnboundParams(items, undefined)).toBe(items);
    });
    it('hides a bound parameter, matching its name case-insensitively', () => {
        expect(UnboundParams([chapterID, status, count], { chapterid: 'c' }).map((p) => p.Name)).toEqual(['Status', 'Count']);
    });
});

describe('IsBoundParamName', () => {
    it('is false with no bindings and true for a bound name in any casing', () => {
        expect(IsBoundParamName('Cursor', undefined)).toBe(false);
        expect(IsBoundParamName('cursor', { Cursor: 'fixed' })).toBe(true);
        expect(IsBoundParamName('Count', { Cursor: 'fixed' })).toBe(false);
    });
});

describe('ApplyBoundActionParams', () => {
    const defs = [chapterID, status, count, bothWays];

    it('with no bindings hands back the model\'s object untouched and says so', () => {
        const sent = { ChapterID: 'model-pick', Status: 'Active' };
        const r = ApplyBoundActionParams(sent, undefined, defs, 'List Members');
        expect(r.Params).toBe(sent);
        expect(r).toMatchObject({ Bound: [], Overridden: [], Refusal: null, HasBindings: false });
    });
    it('replaces the model\'s value with the bound one and records the override', () => {
        const r = ApplyBoundActionParams({ chapterid: 'model-pick', Status: 'Active' }, { ChapterID: 'chapter-7' }, defs, 'List Members');
        expect(r.Params).toEqual({ Status: 'Active', ChapterID: 'chapter-7' });
        expect(r).toMatchObject({ Bound: ['ChapterID'], Overridden: ['chapterid'], Refusal: null, HasBindings: true });
    });
    it('dispatches a bound value under the action\'s own spelling of the name', () => {
        expect(Object.keys(ApplyBoundActionParams({}, { CHAPTERID: 'chapter-7' }, defs, 'List Members').Params)).toEqual(['ChapterID']);
    });
    it('binds a Both parameter like an input', () => {
        expect(ApplyBoundActionParams({ Cursor: 'model' }, { Cursor: 'fixed' }, defs, 'List Members').Params).toEqual({ Cursor: 'fixed' });
    });
    it('leaves an optional parameter bound to nothing out of the dispatch, still hidden', () => {
        const r = ApplyBoundActionParams({ Status: 'model-pick' }, { Status: null }, defs, 'List Members');
        expect(r.Params).toEqual({});
        expect(r.Overridden).toEqual(['Status']);
        expect(r.Refusal).toBeNull();
    });
    it('refuses a required parameter bound to null or undefined', () => {
        expect(ApplyBoundActionParams({}, { ChapterID: null }, defs, 'List Members').Refusal).toMatch(/required parameter 'ChapterID' is bound to no value/);
        expect(ApplyBoundActionParams({}, { ChapterID: undefined }, defs, 'List Members').Refusal).toMatch(/bound to no value/);
    });
    it('refuses a binding that names no input parameter of the action, including an output', () => {
        expect(ApplyBoundActionParams({}, { ChapterId_: 'x' }, defs, 'List Members').Refusal).toMatch(/'ChapterId_' is not one of its input parameters/);
        expect(ApplyBoundActionParams({}, { Count: 1 }, defs, 'List Members').Refusal).toMatch(/'Count' is not one of its input parameters/);
    });
    it('a refusal leaves the model\'s parameters as they were and binds nothing', () => {
        const sent = { Status: 'Active' };
        const r = ApplyBoundActionParams(sent, { ChapterID: null }, defs, 'List Members');
        expect(r.Params).toBe(sent);
        expect(r).toMatchObject({ Bound: [], HasBindings: true });
    });
});

// ── What the model is shown ──────────────────────────────────────────────────────────────────────

describe('the prose catalog', () => {
    it('leaves a bound parameter out of the action\'s Input line', () => {
        const text = new Probe().Internals.formatActionDetails([action()], bindChapter());
        expect(text).not.toContain('ChapterID');
        expect(text).toContain('`Status`');
        expect(text).toContain('**Output:** `Count`');
    });
    it('is byte-for-byte the unbound catalog when the run binds nothing, or binds another action', () => {
        const i = new Probe().Internals;
        const plain = i.formatActionDetails([action()]);
        expect(plain).toBe('### List Members\nLists a chapter\'s members\n**Input:** `ChapterID`\\* — The chapter to list, `Status` — Member status filter\n**Output:** `Count`');
        expect(i.formatActionDetails([action()], undefined)).toBe(plain);
        expect(i.formatActionDetails([action()], bindChapter('c', OTHER_ACTION_ID))).toBe(plain);
    });
});

describe('the catalog the prompt is built from (gatherPromptTemplateData)', () => {
    const render = async (probe: Probe, bound?: BoundActionParams) => probe.Internals.gatherPromptTemplateData(AGENT, undefined, undefined, undefined, undefined, bound);

    it('hides the bound parameter while the cached catalog text is left as it was', async () => {
        const probe = new Probe().StubCatalogRender();
        const base = seedCatalog(probe, [action(), action(OTHER_ACTION_ID, 'Other')]);
        const data = await render(probe, bindChapter());
        expect(data.actionDetails.split('### Other')[0]).not.toContain('ChapterID');
        expect(data.actionDetails).toContain('### Other');
        expect(base.actionDetails).toContain('ChapterID');
    });
    it('hides it in a NARROWED catalog too, where the shown actions are rendered again', async () => {
        const probe = new Probe().StubCatalogRender();
        seedCatalog(probe, [action(), action(OTHER_ACTION_ID, 'Other')]);
        const narrowing = NoCatalogNarrowing();
        (narrowing.Hidden.action as Set<string>).add(OTHER_ACTION_ID.toLowerCase());
        probe.Internals._catalogNarrowing = narrowing;
        const data = await render(probe, bindChapter());
        expect(data.actionDetails).toContain('### List Members');
        expect(data.actionDetails).not.toContain('### Other');
        expect(data.actionDetails).not.toContain('ChapterID');
    });
    it('renders the cached text itself when the run binds nothing', async () => {
        const probe = new Probe().StubCatalogRender();
        const base = seedCatalog(probe, [action()]);
        expect((await render(probe)).actionDetails).toBe(base.actionDetails);
    });
    it('withholds task graphs from a bound run without writing to the cached prompt params', async () => {
        const probe = new Probe().StubCatalogRender();
        const cached = { enableTaskGraphs: true, includeResponseTypeDefinition: { tasks: true, decisions: true } };
        seedCatalog(probe, [action()], cached);
        await render(probe, bindChapter());
        const effective = probe.Internals._agentTypePromptParams;
        expect(effective.enableTaskGraphs).toBe(false);
        expect(effective.includeResponseTypeDefinition).toEqual({ tasks: false, decisions: true });
        expect(cached).toEqual({ enableTaskGraphs: true, includeResponseTypeDefinition: { tasks: true, decisions: true } });
        await render(probe);
        expect(probe.Internals._agentTypePromptParams).toEqual(cached);
    });
});

describe('the native tool schema', () => {
    const schemaFor = (bound?: BoundActionParams) => {
        const promptParams = {} as AIPromptParams;
        new Probe([action()]).Tools(promptParams, agentParams({ boundActionParams: bound }));
        return promptParams.tools?.find((t) => t.name === 'list_members')?.inputSchema as { properties: Record<string, unknown>; required?: string[] };
    };
    it('has no property and no required entry for a bound parameter', () => {
        const schema = schemaFor(bindChapter());
        expect(Object.keys(schema.properties)).toEqual(['Status']);
        expect(schema.required).toBeUndefined();
    });
    it('is unchanged when the run binds nothing', () => {
        const schema = schemaFor(undefined);
        expect(Object.keys(schema.properties)).toEqual(['ChapterID', 'Status']);
        expect(schema.required).toEqual(['ChapterID']);
        expect(schemaFor({})).toEqual(schema);
    });
});

describe('the invocation record and progress line (shownActionParamEntries)', () => {
    it('drops a bound name the model wrote, and nothing else', () => {
        const i = new Probe([action()]).Internals;
        const aa = { name: 'List Members', params: { ChapterID: 'model-pick', Status: 'Active' } };
        expect(i.shownActionParamEntries(agentParams({ boundActionParams: bindChapter() }), aa)).toEqual([['Status', 'Active']]);
        expect(i.shownActionParamEntries(agentParams(), aa)).toEqual([['ChapterID', 'model-pick'], ['Status', 'Active']]);
        expect(i.shownActionParamEntries(agentParams({ boundActionParams: bindChapter('c', OTHER_ACTION_ID) }), aa)).toHaveLength(2);
    });
});

// ── What the action receives ─────────────────────────────────────────────────────────────────────

describe('ExecuteSingleAction', () => {
    const dispatched = (): ActionParam[] => runAction.mock.calls[0][0].Params;
    const logged = (): string[] => vi.mocked(LogStatus).mock.calls.map((c) => String(c[0]));
    /** Everything written through either error logger, as text. */
    const errorLogText = (): string => [...vi.mocked(LogError).mock.calls, ...vi.mocked(LogErrorEx).mock.calls].map((c) => JSON.stringify(c)).join('\n');

    it('gives the action the bound value, marked Bound, and discards what the model wrote for it', async () => {
        const entity = action();
        const result = await new Probe().ExecuteSingleAction(
            agentParams({ boundActionParams: bindChapter() }),
            { name: entity.Name, params: { ChapterID: 'model-pick', Status: 'Active' } },
            entity, undefined, { StepID: 'step-42' }
        );
        expect(result.Success).toBe(true);
        expect(dispatched()).toEqual([
            { Name: 'Status', Value: 'Active', Type: 'Input' },
            { Name: 'ChapterID', Value: 'chapter-7', Type: 'Input', Bound: true },
        ]);
        expect(dispatched().some((p) => p.Value === 'model-pick')).toBe(false);
        const line = logged().find((l) => l.includes('discarded'));
        expect(line).toContain("'ChapterID'");
        expect(line).toContain('step step-42');
        expect(line).not.toContain('model-pick');
    });
    it('stamps the bindings on the action Context only when the run has any', async () => {
        const entity = action();
        const context: Record<string, unknown> = {};
        await new Probe().ExecuteSingleAction(agentParams({ boundActionParams: bindChapter(), context }), { name: entity.Name, params: {} }, entity);
        expect(context.BoundActionParams).toEqual(bindChapter());
        const plain: Record<string, unknown> = {};
        await new Probe().ExecuteSingleAction(agentParams({ context: plain }), { name: entity.Name, params: {} }, entity);
        expect('BoundActionParams' in plain).toBe(false);
    });
    it('does not log an override when the model left the bound parameter alone', async () => {
        const entity = action();
        await new Probe().ExecuteSingleAction(agentParams({ boundActionParams: bindChapter() }), { name: entity.Name, params: { Status: 'Active' } }, entity);
        expect(dispatched().find((p) => p.Name === 'ChapterID')).toMatchObject({ Value: 'chapter-7', Bound: true });
        expect(logged().some((l) => l.includes('discarded'))).toBe(false);
    });
    it('refuses a required parameter bound to nothing as a fatal block: no dispatch, a generic message, the reason logged, the action locked out', async () => {
        const entity = action();
        const probe = new Probe();
        const result = await probe.ExecuteSingleAction(agentParams({ boundActionParams: bindChapter(null) }), { name: entity.Name, params: {} }, entity, undefined, { StepID: 'step-9' });
        expect(runAction).not.toHaveBeenCalled();
        expect(result).toBeInstanceOf(CircuitBreakerActionResult);
        expect((result as CircuitBreakerActionResult).Reason).toBe('fatal');
        expect(result.Success).toBe(false);
        expect(result.Message).toContain('not available in this run');
        expect(result.Message).not.toContain('ChapterID');
        expect(result.RunParams.Action).toBe(entity);
        const errorText = errorLogText();
        expect(errorText).toContain("required parameter 'ChapterID' is bound to no value");
        expect(errorText).toContain('step-9');
        expect(probe.Internals._fatalActionFailures.has(entity.Name)).toBe(true);
        // The lockout holds even for a later, well-formed call: the breaker short-circuits it.
        const later = await probe.ExecuteSingleAction(agentParams(), { name: entity.Name, params: { ChapterID: 'x' } }, entity);
        expect(runAction).not.toHaveBeenCalled();
        expect((later as CircuitBreakerActionResult).Reason).toBe('fatal');
    });
    it('refuses a binding that names a parameter the action does not have, without naming it to the model', async () => {
        const entity = action();
        const result = await new Probe().ExecuteSingleAction(agentParams({ boundActionParams: { [ACTION_ID]: { Chapter: 'c' } } }), { name: entity.Name, params: {} }, entity);
        expect(runAction).not.toHaveBeenCalled();
        expect(result.Message).not.toContain('Chapter');
        expect(errorLogText()).toContain("'Chapter' is not one of its input parameters");
    });
    it('with no bindings dispatches exactly what the model sent, keys the breaker on the model\'s own object, and marks nothing Bound', async () => {
        const entity = action();
        const probe = new Probe();
        const sent = { ChapterID: 'model-pick', Status: 'Active' };
        await probe.ExecuteSingleAction(agentParams(), { name: entity.Name, params: sent }, entity);
        expect(dispatched()).toEqual([
            { Name: 'ChapterID', Value: 'model-pick', Type: 'Input' },
            { Name: 'Status', Value: 'Active', Type: 'Input' },
        ]);
        expect(dispatched().every((p) => !('Bound' in p))).toBe(true);
        expect(probe.normalizedWith[0]).toBe(sent);
        expect(logged().some((l) => l.includes('🔒'))).toBe(false);
        const noParams = undefined as unknown as Record<string, unknown>;
        await probe.ExecuteSingleAction(agentParams(), { name: entity.Name, params: noParams }, entity);
        expect(probe.normalizedWith[1]).toBeUndefined();
    });
    it('keys the breaker on the dispatched parameters when bindings apply, so varying a bound value does not defeat it', async () => {
        const entity = action();
        const probe = new Probe();
        await probe.ExecuteSingleAction(agentParams({ boundActionParams: bindChapter() }), { name: entity.Name, params: { ChapterID: 'model-pick' } }, entity);
        expect(probe.normalizedWith[0]).toEqual({ ChapterID: 'chapter-7' });
    });
    it('binds by the action\'s ID, so a binding on another action does not touch this one', async () => {
        const entity = action();
        await new Probe().ExecuteSingleAction(agentParams({ boundActionParams: bindChapter('c', OTHER_ACTION_ID) }), { name: entity.Name, params: { ChapterID: 'model-pick' } }, entity);
        expect(dispatched()).toEqual([{ Name: 'ChapterID', Value: 'model-pick', Type: 'Input' }]);
    });
});

// ── The run as a whole ───────────────────────────────────────────────────────────────────────────

describe('a binding keyed by something other than a known Action ID', () => {
    it('is an error at the root run, naming the key, and nothing for known IDs or for a sub-agent', () => {
        const i = new Probe().Internals;
        i._depth = 0;
        expect(i.boundActionParamsError(agentParams({ boundActionParams: { 'List Members': { ChapterID: 'c' } } }))).toMatch(/no known action: 'List Members'/);
        expect(i.boundActionParamsError(agentParams({ boundActionParams: bindChapter() }))).toBeNull();
        expect(i.boundActionParamsError(agentParams({ boundActionParams: { [ACTION_ID.toUpperCase()]: { ChapterID: 'c' } } }))).toBeNull();
        expect(i.boundActionParamsError(agentParams())).toBeNull();
        i._depth = 1;
        expect(i.boundActionParamsError(agentParams({ boundActionParams: { 'List Members': { ChapterID: 'c' } } }))).toBeNull();
    });
});

describe('task graphs under bindings', () => {
    const graphDecision = { step: 'Tasks', taskGraph: { spec: { workflowName: 'w', tasks: [{}] } }, previousPayload: { a: 1 } } as unknown as BaseAgentNextStep;
    it('refuses a graph the model emits anyway, before any step is written', async () => {
        const next = await new Probe().Tasks(agentParams({ boundActionParams: bindChapter() }), graphDecision);
        expect(next.step).toBe('Failed');
        expect(next.terminate).toBe(true);
        expect(next.errorMessage).toMatch(/bound action parameters/);
        expect(next.previousPayload).toEqual({ a: 1 });
    });
});

describe('runs that inherit the bindings', () => {
    const child = { ID: 'child', Name: 'Child', Status: 'Active' } as unknown as MJAIAgentEntityExtended;
    const step = () => ({ ID: 'step-1', TargetLogID: null } as unknown as MJAIAgentRunStepEntityExtended);

    it('a sub-agent run gets the same bindings object', async () => {
        const bound = bindChapter();
        await new Probe().SubAgent(agentParams({ boundActionParams: bound }), { name: 'Child', message: 'go' }, child, step());
        expect(runAgent).toHaveBeenCalledTimes(1);
        expect(runAgent.mock.calls[0][0].boundActionParams).toBe(bound);
    });
    it('a sub-agent run gets nothing when the parent has no bindings', async () => {
        await new Probe().SubAgent(agentParams(), { name: 'Child', message: 'go' }, child, step());
        expect(runAgent.mock.calls[0][0].boundActionParams).toBeUndefined();
    });
    it('a realtime delegation target gets the same bindings object', async () => {
        const probe = new Probe();
        probe.Internals.resolveRealtimeTargetAgent = () => child;
        probe.Internals.parseDelegateRequestText = () => 'do the thing';
        const bound = bindChapter();
        await probe.Internals.delegateRealtimeToTarget(agentParams({ boundActionParams: bound }), {} as AgentConfiguration, { CallID: 'c1', Arguments: '{}' });
        expect(runAgent).toHaveBeenCalledTimes(1);
        expect(runAgent.mock.calls[0][0].boundActionParams).toBe(bound);
    });
});
