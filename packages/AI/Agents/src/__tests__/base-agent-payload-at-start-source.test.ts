/**
 * Tests for how BaseAgent stores a step's start payload. When the start equals the PayloadAtEnd of the
 * latest step in the run that is no longer Running and has an end, and that step's INSERT has landed, the
 * step stores a pointer to it (PayloadAtStartSourceStepID) and no copy (PayloadAtStart null). Also covers
 * the INSERT order, the Rule (a step's PayloadAtEnd must not change after a later step points at it), and
 * that a finalized run leaves the deprecated AIAgentRun.Result unset.
 *
 * Drives the REAL createStepEntity / finalizeStepEntity / prompt / action / sub-agent / ForEach /
 * finalizeAgentRun code on a real BaseAgent. Only the boundaries are stubbed: the metadata provider
 * (GetEntityObject hands out mock step entities that persist the way BaseEntity does), the AIEngine
 * metadata singleton (a module mock, the parallel-subagents pattern), logging, the agent type, prompt
 * assembly and the model call, action execution, and ExecuteSubAgent (it runs a whole child agent).
 */
import { describe, it, expect, vi } from 'vitest';
import { BaseAgent } from '../base-agent';
import { ResolvePayloadAtStart, ResolvePayloadAtEnd, type AgentPayloadChangeRequest, type BaseAgentNextStep, type ForEachOperation } from '@memberjunction/ai-core-plus';
import { IndexByUUID } from '@memberjunction/global';

// ============================================================================
// Module mocks (boundaries only)
// ============================================================================

// Sub-agent rows BaseAgent resolves by name. Read only inside the getter, at test time.
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return {
                Agents: [...CHILD_AGENTS, RELATED_AGENT],
                AgentRelationships: RELATIONSHIPS,
                AgentActions: [],
                GetSubAgents: (agentID: string, status?: string): SubAgentRow[] =>
                    CHILD_AGENTS.filter((a) => a.ParentID === agentID && (!status || a.Status === status)),
            };
        },
    },
}));

// The prompt-error path logs the error; keep the test output clean.
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: vi.fn(), LogErrorEx: vi.fn(), LogStatus: vi.fn(), LogStatusEx: vi.fn() };
});

// ============================================================================
// Fixtures
// ============================================================================

const PARENT_AGENT_ID = 'cccccccc-0000-4000-8000-000000000001';
const RELATED_AGENT_ID = 'cccccccc-0000-4000-8000-000000000002';
const CONTEXT_USER = { ID: 'cccccccc-0000-4000-8000-000000000003' };

/** An agent row as BaseAgent reads it when it resolves and runs a sub-agent. */
interface SubAgentRow {
    ID: string;
    ParentID: string | null;
    Name: string;
    Status: string;
    PayloadDownstreamPaths: string | null;
    PayloadUpstreamPaths: string | null;
    PayloadScope: string | null;
}

/** Six children: one more than the parallel sub-agent concurrency limit (5). */
const CHILD_AGENTS: SubAgentRow[] = [1, 2, 3, 4, 5, 6].map((n) => ({
    ID: `cccccccc-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`,
    ParentID: PARENT_AGENT_ID,
    Name: `ChildAgent${n}`,
    Status: 'Active',
    PayloadDownstreamPaths: null,
    PayloadUpstreamPaths: null,
    PayloadScope: null,
}));

const RELATED_AGENT: SubAgentRow = {
    ID: RELATED_AGENT_ID,
    ParentID: null,
    Name: 'RelatedAgent',
    Status: 'Active',
    PayloadDownstreamPaths: null,
    PayloadUpstreamPaths: null,
    PayloadScope: null,
};

const RELATIONSHIPS = [
    {
        ID: 'cccccccc-0000-4000-8000-000000000201',
        AgentID: PARENT_AGENT_ID,
        SubAgentID: RELATED_AGENT_ID,
        SubAgent: 'RelatedAgent',
        Status: 'Active',
        SubAgentInputMapping: null,
        SubAgentOutputMapping: null,
        SubAgentContextPaths: null,
    },
];

/** An action row as executeActionsStep reads it from the agent's effective actions. */
interface ActionRow {
    ID: string;
    Name: string;
}

const LOOKUP_ACTION: ActionRow = { ID: 'cccccccc-0000-4000-8000-000000000301', Name: 'Lookup Account' };

/** A prompt row as executePromptStep reads it. */
interface PromptRow {
    ID: string;
    Name: string;
}

/** The parts of the agent configuration executePromptStep reads on its failure paths. */
interface PromptConfig {
    childPrompt: PromptRow;
}

const CHILD_PROMPT: PromptRow = { ID: 'cccccccc-0000-4000-8000-000000000401', Name: 'Agent Child Prompt' };
const PROMPT_CONFIG: PromptConfig = { childPrompt: CHILD_PROMPT };

/** The fields BaseAgent persists on a step: what a save writes, and what the row in the database holds. */
type StepRow = Pick<MockStep,
    | 'ID' | 'AgentRunID' | 'StepNumber' | 'StepType' | 'StepName' | 'TargetID' | 'TargetLogID' | 'ParentID'
    | 'Status' | 'StartedAt' | 'CompletedAt' | 'Success' | 'ErrorMessage' | 'InputData' | 'OutputData'
    | 'PayloadAtStart' | 'PayloadAtStartSourceStepID' | 'PayloadAtEnd' | 'PayloadAtEndSourceStepID' | 'Skills'>;

/** How long a step's saves take. */
interface SaveTiming {
    /** The first save, the INSERT. */
    InsertDelayMs: number;
    /** Every later save, an UPDATE. */
    UpdateDelayMs: number;
}

/** Resolves after `ms` milliseconds, or on the next microtask when `ms` is 0. */
function wait(ms: number): Promise<void> {
    return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/**
 * Structural stand-in for MJAIAgentRunStepEntityExtended that persists the way BaseEntity does:
 * - Save() writes the values the step holds when the save starts. When the save lands, the step reloads the
 *   written row (BaseEntity.finalizeSave), which reverts any field set while the save was in flight.
 * - Save() called while a save is in flight returns that save's result (BaseEntity debounces Save).
 * - IsSaved turns true when the INSERT lands.
 *
 * It also checks the Rule. Once a later step points at this step, every PayloadAtEnd that BaseAgent sets and
 * every save that starts afterwards must keep the end that the later step compared. A save that was already
 * in flight can still reload an older end; ExpectRuleHolds checks the end the database is left with.
 */
class MockStep {
    public ID = '';
    public AgentRunID = '';
    public StepNumber = 0;
    public StepType = '';
    public StepName = '';
    public TargetID: string | null = null;
    public TargetLogID: string | null = null;
    public ParentID: string | null = null;
    public Status = '';
    public StartedAt: Date = new Date(0);
    public CompletedAt: Date | null = null;
    public Success: boolean | null = null;
    public ErrorMessage: string | null = null;
    public InputData: string | null = null;
    public OutputData: string | null = null;
    public PayloadAtStart: string | null = null;
    public Skills: string | null = null;

    /** True once the INSERT has landed (BaseEntity.IsSaved). */
    public IsSaved = false;
    /** The row in the database: what the latest landed save wrote, or null until the INSERT lands. */
    public SavedRow: StepRow | null = null;
    /** The PayloadAtEnd a later step compared when it pointed at this step; undefined until a step does. */
    public ComparedEnd: string | null | undefined = undefined;
    /** Rule breaks seen on this step. */
    public readonly RuleViolations: string[] = [];
    /** Names the step in the save log and in Rule violations. */
    public readonly Label: string;

    private payloadAtEnd: string | null = null;
    private payloadAtStartSourceStepID: string | null = null;
    private payloadAtEndSourceStepID: string | null = null;
    private pendingSave: Promise<boolean> | null = null;
    private reloading = false;
    private saveCount = 0;
    private readonly idSuffix: string;

    /**
     * @param seq Creation order; gives the step its label and its client-generated ID.
     * @param saveLog Shared log of `<label>:<save number>:start|end` entries.
     * @param timing How long this step's saves take. A slow save is what lets other work overtake it.
     * @param onPointer Called when this step is given a PayloadAtStartSourceStepID or PayloadAtEndSourceStepID.
     */
    constructor(
        seq: number,
        private readonly saveLog: string[],
        private readonly timing: SaveTiming,
        private readonly onPointer: (sourceId: string, pointerStepId: string) => void,
    ) {
        this.Label = `step${seq}`;
        this.idSuffix = String(seq).padStart(12, '0');
    }

    public get PayloadAtEnd(): string | null {
        return this.payloadAtEnd;
    }

    public set PayloadAtEnd(value: string | null) {
        if (!this.reloading && this.ComparedEnd !== undefined && value !== this.ComparedEnd) {
            this.RuleViolations.push(`${this.Label}: PayloadAtEnd set to ${value} after a later step pointed at it with ${this.ComparedEnd}`);
        }
        this.payloadAtEnd = value;
    }

    public get PayloadAtStartSourceStepID(): string | null {
        return this.payloadAtStartSourceStepID;
    }

    public set PayloadAtStartSourceStepID(value: string | null) {
        this.payloadAtStartSourceStepID = value;
        if (value && !this.reloading) {
            this.onPointer(value, this.ID);
        }
    }

    public get PayloadAtEndSourceStepID(): string | null {
        return this.payloadAtEndSourceStepID;
    }

    public set PayloadAtEndSourceStepID(value: string | null) {
        this.payloadAtEndSourceStepID = value;
        if (value && !this.reloading) {
            this.onPointer(value, this.ID);
        }
    }

    /** Records that a later step points at this step: it compared the current PayloadAtEnd. */
    public MarkPointedAt(): void {
        if (this.ComparedEnd === undefined) {
            this.ComparedEnd = this.payloadAtEnd;
        }
    }

    public NewRecord(): void {
        this.ID = `cccccccc-1111-4000-8000-${this.idSuffix}`;
    }

    public Save(): Promise<boolean> {
        if (!this.pendingSave) {
            this.pendingSave = this.write().finally(() => {
                this.pendingSave = null;
            });
        }
        return this.pendingSave;
    }

    /** One INSERT or UPDATE: writes the current values, then reloads them when it lands. */
    private async write(): Promise<boolean> {
        const row = this.toRow();
        const n = ++this.saveCount;
        this.saveLog.push(`${this.Label}:${n}:start`);
        if (this.ComparedEnd !== undefined && row.PayloadAtEnd !== this.ComparedEnd) {
            this.RuleViolations.push(`${this.Label}: save ${n} wrote PayloadAtEnd ${row.PayloadAtEnd} after a later step pointed at it with ${this.ComparedEnd}`);
        }
        await wait(this.IsSaved ? this.timing.UpdateDelayMs : this.timing.InsertDelayMs);
        this.saveLog.push(`${this.Label}:${n}:end`);
        this.SavedRow = row;
        this.reloading = true;
        Object.assign(this, row);
        this.reloading = false;
        this.IsSaved = true;
        return true;
    }

    private toRow(): StepRow {
        return {
            ID: this.ID,
            AgentRunID: this.AgentRunID,
            StepNumber: this.StepNumber,
            StepType: this.StepType,
            StepName: this.StepName,
            TargetID: this.TargetID,
            TargetLogID: this.TargetLogID,
            ParentID: this.ParentID,
            Status: this.Status,
            StartedAt: this.StartedAt,
            CompletedAt: this.CompletedAt,
            Success: this.Success,
            ErrorMessage: this.ErrorMessage,
            InputData: this.InputData,
            OutputData: this.OutputData,
            PayloadAtStart: this.PayloadAtStart,
            PayloadAtStartSourceStepID: this.PayloadAtStartSourceStepID,
            PayloadAtEnd: this.PayloadAtEnd,
            PayloadAtEndSourceStepID: this.PayloadAtEndSourceStepID,
            Skills: this.Skills,
        };
    }
}

/** Stand-in for the run entity during a run: createStepEntity reads and appends to its Steps. */
class FakeRun {
    public ID = 'cccccccc-2222-4000-8000-000000000001';
    public AgentID = PARENT_AGENT_ID;
    public Steps: MockStep[] = [];
    public FinalPayloadObject: unknown = undefined;
    public TotalPromptIterations = 0;
}

/** Stand-in for the run entity at finalize: the payload fields this suite reads, plus Save(). */
class FinalizedRun {
    public ID = 'cccccccc-2222-4000-8000-000000000002';
    public Steps: MockStep[] = [];
    public ErrorMessage: string | null = null;
    public Result: string | null = null;
    public FinalPayload: string | null = null;

    public async Save(): Promise<boolean> {
        return true;
    }
}

/** The parts of ExecuteAgentParams these flows read. */
interface FlowParams {
    agent: { ID: string; Name: string };
    contextUser: { ID: string };
    conversationMessages: Array<{ role: string; content: unknown }>;
}

/** The createStepEntity inputs this suite passes. */
interface CreateStepInput {
    stepType: string;
    stepName: string;
    contextUser: { ID: string };
    payloadAtStart?: unknown;
    payloadAtEnd?: unknown;
    parentId?: string;
}

/** What the scripted ExecuteSubAgent returns: a child run's outcome without the run record. */
interface ScriptedSubAgentResult {
    success: boolean;
    payload: Record<string, unknown>;
}

/** What the scripted ExecuteSingleAction returns: the ActionResult fields executeActionsStep reads. */
interface ScriptedActionResult {
    Success: boolean;
    Message: string;
    Params: Array<{ Name: string; Value: unknown; Type: 'Input' | 'Output' | 'Both' }>;
    Result: { ResultCode: string } | null;
    LogEntry: { ID: string } | null;
}

const ACTION_SUCCEEDED: ScriptedActionResult = { Success: true, Message: 'Found the account', Params: [], Result: { ResultCode: 'SUCCESS' }, LogEntry: null };

/** What the scripted model call returns on failure: the AIPromptRunResult fields the failure path reads. */
interface ScriptedPromptResult {
    success: boolean;
    errorMessage?: string;
}

/** The agent-type hooks these flows call. */
interface AgentTypeStub {
    InjectLoopResultsAsMessage?: boolean;
    GetPromptForStep?: () => Promise<PromptRow>;
    PreProcessActionStep?: () => Promise<void>;
    PostProcessActionStep?: () => Promise<AgentPayloadChangeRequest | null>;
}

type FlushResult = { failures: number; rejections: number };

/** Structural view of the BaseAgent private members these tests touch. */
interface AgentInternals {
    _activeProvider: { GetEntityObject: () => Promise<MockStep> };
    _agentRun: FakeRun;
    _agentTypeInstance: AgentTypeStub;
    _effectiveActions: ActionRow[];
    _stepSaveQueue: { Flush(): Promise<FlushResult> };
    ExecuteSubAgent: (params: FlowParams, request: { name: string }, subAgent: SubAgentRow, step: MockStep, payload?: unknown) => Promise<ScriptedSubAgentResult>;
    ExecuteSingleAction: () => Promise<ScriptedActionResult>;
    preparePromptParams: () => Promise<Record<string, unknown>>;
    executePrompt: () => Promise<ScriptedPromptResult>;
    createStepEntity(input: CreateStepInput): Promise<MockStep>;
    finalizeStepEntity(step: MockStep, success: boolean): Promise<void>;
    processSubAgentStep(params: FlowParams, decision: BaseAgentNextStep): Promise<BaseAgentNextStep>;
    executeForEachLoop(params: FlowParams, config: object, decision: BaseAgentNextStep): Promise<BaseAgentNextStep>;
    executeActionsStep(params: FlowParams, decision: BaseAgentNextStep): Promise<BaseAgentNextStep>;
    executePromptStep(params: FlowParams, config: PromptConfig, decision: BaseAgentNextStep): Promise<BaseAgentNextStep>;
}

/** Structural view of the members finalizeAgentRun reads (base-agent-step-save pattern). */
interface FinalizeInternals {
    _agentRun: FinalizedRun;
    _stepSaveQueue: { Flush(): Promise<FlushResult> };
    _depth: number;
    _injectedMemory: { notes: unknown[]; examples: unknown[] };
    _mediaOutputs: unknown[];
    _fileOutputs: unknown[];
    finalizeAgentRun(finalStep: BaseAgentNextStep, payload: unknown, contextUser: { ID: string }): Promise<{ success: boolean }>;
}

/** A real BaseAgent wired to mock step entities. */
class Harness {
    public readonly Internals: AgentInternals;
    /** Every step entity handed out, in creation order. */
    public readonly Steps: MockStep[] = [];
    public readonly SaveLog: string[] = [];
    /** INSERT duration for the steps created from now on. */
    public InsertDelayMs = 0;
    /** UPDATE duration for the steps created from now on. */
    public UpdateDelayMs = 0;

    constructor(agent: BaseAgent = new BaseAgent()) {
        this.Internals = agent as unknown as AgentInternals;
        this.Internals._activeProvider = {
            GetEntityObject: async () => {
                const timing: SaveTiming = { InsertDelayMs: this.InsertDelayMs, UpdateDelayMs: this.UpdateDelayMs };
                const step = new MockStep(this.Steps.length + 1, this.SaveLog, timing, (sourceId, pointerStepId) => this.markPointedAt(sourceId, pointerStepId));
                this.Steps.push(step);
                return step;
            },
        };
        this.Internals._agentRun = new FakeRun();
    }

    /** Creates a step the way BaseAgent does mid-run; it stays Running. */
    public Create(input: Partial<CreateStepInput>): Promise<MockStep> {
        return this.Internals.createStepEntity({ stepType: 'Actions', stepName: 'Execute Action: Test', contextUser: CONTEXT_USER, ...input });
    }

    /** Creates a step, finalizes it and waits for its saves, so it is finished and saved. */
    public async CreateFinished(input: Partial<CreateStepInput>): Promise<MockStep> {
        const step = await this.Create(input);
        await this.Internals.finalizeStepEntity(step, true);
        await this.Flush();
        return step;
    }

    /** Awaits every queued step save. */
    public Flush(): Promise<FlushResult> {
        return this.Internals._stepSaveQueue.Flush();
    }

    /** The one step of the given type. */
    public Only(stepType: string): MockStep {
        const matches = this.Steps.filter((s) => s.StepType === stepType);
        expect(matches).toHaveLength(1);
        return matches[0];
    }

    /** Position of a save-log entry, e.g. `SaveIndex(step, 1, 'end')` for the end of its INSERT. */
    public SaveIndex(step: MockStep, saveNumber: number, edge: 'start' | 'end'): number {
        const index = this.SaveLog.indexOf(`${step.Label}:${saveNumber}:${edge}`);
        expect(index).toBeGreaterThanOrEqual(0);
        return index;
    }

    /** Every Rule break seen so far. */
    public RuleViolations(): string[] {
        return this.Steps.flatMap((s) => s.RuleViolations);
    }

    /** Waits for every save, then checks the Rule: no end changed after it was compared, and each saved end is the compared end. */
    public async ExpectRuleHolds(): Promise<void> {
        await this.Flush();
        expect(this.RuleViolations()).toEqual([]);
        for (const source of this.Steps.filter((s) => s.ComparedEnd !== undefined)) {
            expect(source.SavedRow?.PayloadAtEnd, `saved end of ${source.Label}`).toBe(source.ComparedEnd);
        }
    }

    /** A step's start payload as a reader resolves it from the saved rows: the stored copy, or the source row's end. */
    public SavedStart(step: MockStep): string | null {
        const rows = this.Steps.flatMap((s) => (s.SavedRow ? [s.SavedRow] : []));
        const rowsById = IndexByUUID(rows);
        expect(step.SavedRow).not.toBeNull();
        return step.SavedRow ? ResolvePayloadAtStart(step.SavedRow, rowsById) : null;
    }

    /** A step's end payload as a reader resolves it from the saved rows: the stored copy, or the source row's start/end. */
    public SavedEnd(step: MockStep): string | null {
        const rows = this.Steps.flatMap((s) => (s.SavedRow ? [s.SavedRow] : []));
        const rowsById = IndexByUUID(rows);
        expect(step.SavedRow).not.toBeNull();
        return step.SavedRow ? ResolvePayloadAtEnd(step.SavedRow, rowsById) : null;
    }

    private markPointedAt(sourceId: string, pointerStepId: string): void {
        if (sourceId === pointerStepId) {
            return; // Self-pointer (PayloadAtEndSourceStepID === step.ID) points to the step's own PayloadAtStart
        }
        this.Steps.find((s) => s.ID === sourceId)?.MarkPointedAt();
    }
}

function parentParams(): FlowParams {
    return { agent: { ID: PARENT_AGENT_ID, Name: 'Parent Agent' }, contextUser: CONTEXT_USER, conversationMessages: [] };
}

// ============================================================================
// Tests
// ============================================================================

describe('BaseAgent.createStepEntity — a start payload that repeats an earlier end is stored as a pointer', () => {
    it("stores a pointer and no copy when the start equals the latest finished step's PayloadAtEnd", async () => {
        const h = new Harness();
        const previous = await h.CreateFinished({ payloadAtEnd: { customer: 'Acme', items: [1, 2] } });

        const step = await h.Create({ stepType: 'Prompt', stepName: 'Execute Agent Prompt', payloadAtStart: { customer: 'Acme', items: [1, 2] } });

        expect(step.PayloadAtStart).toBeNull();
        expect(step.PayloadAtStartSourceStepID).toBe(previous.ID);
        await h.ExpectRuleHolds();
        expect(h.SavedStart(step)).toBe(JSON.stringify({ customer: 'Acme', items: [1, 2] }));
    });

    it('stores the start and no pointer when the payload changed', async () => {
        const h = new Harness();
        await h.CreateFinished({ payloadAtEnd: { status: 'draft' } });

        const step = await h.Create({ payloadAtStart: { status: 'final' } });

        expect(step.PayloadAtStart).toBe(JSON.stringify({ status: 'final' }));
        expect(step.PayloadAtStartSourceStepID).toBeNull();
    });

    it('stores the start of the first step of a run, which has no earlier step', async () => {
        const h = new Harness();

        const step = await h.Create({ stepType: 'Prompt', stepName: 'Execute Agent Prompt', payloadAtStart: { tasks: ['a'] } });

        expect(step.PayloadAtStart).toBe(JSON.stringify({ tasks: ['a'] }));
        expect(step.PayloadAtStartSourceStepID).toBeNull();
    });

    it('gives a step with no start payload no pointer, even after a finished step with no end payload', async () => {
        const h = new Harness();
        await h.CreateFinished({ stepType: 'Validation', stepName: 'Agent Validation' });

        const step = await h.Create({ stepType: 'Decision', stepName: 'Finish check' });

        expect(step.PayloadAtStart).toBeNull();
        expect(step.PayloadAtStartSourceStepID).toBeNull();
    });

    it('stores the start when a subclass serializes the start and the end differently', async () => {
        /** Writes PayloadAtEnd indented, so it never equals the compact PayloadAtStart. */
        class IndentedEndPayloadAgent extends BaseAgent {
            protected override serializePayloadAtEnd(payload: unknown): string | null {
                return payload ? JSON.stringify(payload, null, 2) : null;
            }
        }
        const h = new Harness(new IndentedEndPayloadAgent());
        const previous = await h.CreateFinished({ payloadAtEnd: { n: 1 } });
        expect(previous.PayloadAtEnd).toBe(JSON.stringify({ n: 1 }, null, 2));

        const step = await h.Create({ payloadAtStart: { n: 1 } });

        expect(step.PayloadAtStart).toBe(JSON.stringify({ n: 1 }));
        expect(step.PayloadAtStartSourceStepID).toBeNull();
    });
});

describe('BaseAgent.createStepEntity — which earlier step is compared', () => {
    it('skips a step that is still Running and compares the latest finished step before it', async () => {
        const h = new Harness();
        const finished = await h.CreateFinished({ payloadAtEnd: { n: 1 } });
        await h.Create({ payloadAtStart: { n: 1 }, payloadAtEnd: { n: 1 } }); // an action step still running, its end already set

        const step = await h.Create({ payloadAtStart: { n: 1 } });

        expect(step.PayloadAtStart).toBeNull();
        expect(step.PayloadAtStartSourceStepID).toBe(finished.ID);
    });

    it('skips a finished step with no end payload and points at the step that produced the payload', async () => {
        const h = new Harness();
        const producer = await h.CreateFinished({ stepType: 'Prompt', stepName: 'Execute Agent Prompt', payloadAtEnd: { n: 1 } });
        await h.CreateFinished({ stepType: 'Tool', stepName: 'Artifact Tool: read' }); // finished, never gets an end

        const step = await h.Create({ payloadAtStart: { n: 1 } });

        expect(step.PayloadAtStart).toBeNull();
        expect(step.PayloadAtStartSourceStepID).toBe(producer.ID);
        await h.ExpectRuleHolds();
    });

    it('compares only the latest finished step with an end: a later Running step and an older matching step are both ignored', async () => {
        const h = new Harness();
        await h.CreateFinished({ payloadAtEnd: { n: 1 } }); // older finished step, same end
        await h.CreateFinished({ payloadAtEnd: { n: 2 } }); // latest finished step, different end
        await h.Create({ payloadAtStart: { n: 2 }, payloadAtEnd: { n: 1 } }); // still Running, same end

        const step = await h.Create({ payloadAtStart: { n: 1 } });

        expect(step.PayloadAtStart).toBe(JSON.stringify({ n: 1 }));
        expect(step.PayloadAtStartSourceStepID).toBeNull();
    });

    it('points at the latest finished step even when its INSERT is still in flight, chaining the new step INSERT after it', async () => {
        const h = new Harness();
        await h.CreateFinished({ payloadAtEnd: { n: 0 } }); // older, saved, earlier payload
        h.InsertDelayMs = 20;
        const unsaved = await h.Create({ payloadAtEnd: { n: 1 } });
        await h.Internals.finalizeStepEntity(unsaved, true); // finished, but its INSERT is still in flight
        h.InsertDelayMs = 0;

        const step = await h.Create({ payloadAtStart: { n: 1 } });

        expect(unsaved.IsSaved).toBe(false);
        expect(step.PayloadAtStart).toBeNull();
        expect(step.PayloadAtStartSourceStepID).toBe(unsaved.ID);
        await h.Flush();

        expect(unsaved.IsSaved).toBe(true);
        expect(h.SaveIndex(step, 1, 'start')).toBeGreaterThan(h.SaveIndex(unsaved, 1, 'end'));
        expect(h.SavedStart(step)).toBe(JSON.stringify({ n: 1 }));
    });

    it('falls back to storing inline PayloadAtStart when the in-flight source step INSERT fails', async () => {
        const h = new Harness();
        h.InsertDelayMs = 20;
        const failingSource = await h.Create({ payloadAtEnd: { n: 1 } });
        // Simulate a failed DB INSERT on failingSource so IsSaved stays false when its queue tail settles:
        failingSource.Save = async () => {
            await wait(20);
            return false;
        };
        await h.Internals.finalizeStepEntity(failingSource, true);
        h.InsertDelayMs = 0;

        const step = await h.Create({ payloadAtStart: { n: 1 } });
        expect(step.PayloadAtStartSourceStepID).toBe(failingSource.ID);

        await h.Flush();

        expect(failingSource.IsSaved).toBe(false);
        expect(step.SavedRow?.PayloadAtStart).toBe(JSON.stringify({ n: 1 }));
        expect(step.SavedRow?.PayloadAtStartSourceStepID).toBeNull();
    });
});

describe('BaseAgent sub-agent steps — pointers survive the sub-agent run', () => {
    it('parallel sub-agent siblings all point at the step before the group, never at each other', async () => {
        const h = new Harness();
        const payload = { topic: 'renewals' };
        const before = await h.CreateFinished({ stepType: 'Prompt', stepName: 'Execute Agent Prompt', payloadAtEnd: payload });
        h.Internals.ExecuteSubAgent = async (_params, request) => ({ success: true, payload: { [`${request.name}Result`]: 'done' } });
        const requests = CHILD_AGENTS.map((a) => ({ name: a.Name, message: `Job for ${a.Name}`, terminateAfter: false }));

        await h.Internals.processSubAgentStep(parentParams(), { step: 'Sub-Agent', terminate: false, newPayload: payload, subAgents: requests });
        await h.ExpectRuleHolds();

        const siblings = h.Steps.filter((s) => s.StepType === 'Sub-Agent');
        expect(siblings).toHaveLength(CHILD_AGENTS.length);
        for (const sibling of siblings) {
            expect(sibling.PayloadAtStart).toBeNull();
            expect(sibling.PayloadAtStartSourceStepID).toBe(before.ID);
        }
        // Each sibling ends with its own sub-agent's result, written when the group merges...
        expect(siblings.map((s) => JSON.parse(s.SavedRow?.PayloadAtEnd ?? 'null'))).toEqual(
            CHILD_AGENTS.map((a) => ({ [`${a.Name}Result`]: 'done' }))
        );
        // ...and every sibling's saved start still resolves to the payload the group started from.
        for (const sibling of siblings) {
            expect(h.SavedStart(sibling)).toBe(JSON.stringify(payload));
        }
    });

    it.each([
        ['child', 'ChildAgent1'],
        ['related', 'RelatedAgent'],
    ])('a single %s sub-agent step keeps its pointer after the sub-agent runs', async (_kind, name) => {
        const h = new Harness();
        const payload = { topic: 'renewals' };
        const before = await h.CreateFinished({ stepType: 'Prompt', stepName: 'Execute Agent Prompt', payloadAtEnd: payload });
        h.Internals.ExecuteSubAgent = async () => ({ success: true, payload: { summary: 'done' } });

        const result = await h.Internals.processSubAgentStep(parentParams(), {
            step: 'Sub-Agent',
            terminate: false,
            previousPayload: payload,
            newPayload: payload,
            subAgent: { name, message: 'Summarize the renewals', terminateAfter: false },
        });
        await h.ExpectRuleHolds();

        expect(result.step).toBe('Success');
        const step = h.Only('Sub-Agent');
        expect(step.SavedRow?.Status).toBe('Completed');
        expect(step.PayloadAtStart).toBeNull();
        expect(step.PayloadAtStartSourceStepID).toBe(before.ID);
    });
});

describe('BaseAgent ForEach — children never point at the running loop step', () => {
    it('points the loop step and its first child at the step before the loop, and each later child at the child before it', async () => {
        const h = new Harness();
        h.Internals._agentTypeInstance = { InjectLoopResultsAsMessage: false };
        const payload = { items: ['a', 'b'] };
        const before = await h.CreateFinished({ stepType: 'Prompt', stepName: 'Execute Agent Prompt', payloadAtEnd: payload });
        // Each item's sub-agent adds one key, so every step ends with a different payload. The sub-agent runs
        // longer than its step's INSERT, as a real one does.
        h.Internals.ExecuteSubAgent = async (_params, _request, _subAgent, _step, item) => {
            await h.Flush();
            return { success: true, payload: { [`handled_${String(item)}`]: true } };
        };
        const forEach: ForEachOperation = { collectionPath: 'payload.items', itemVariable: 'item', subAgent: { name: 'ChildAgent1', message: 'Handle the item' } };

        const result = await h.Internals.executeForEachLoop(parentParams(), {}, {
            step: 'ForEach',
            terminate: false,
            previousPayload: payload,
            newPayload: payload,
            forEach,
        });
        await h.ExpectRuleHolds();

        expect(result.step).toBe('Retry'); // the loop completed
        const [loopStep, child1, child2] = h.Steps.slice(1);
        expect(loopStep.StepType).toBe('ForEach');
        expect([child1.ParentID, child2.ParentID]).toEqual([loopStep.ID, loopStep.ID]);

        expect(loopStep.PayloadAtStartSourceStepID).toBe(before.ID);
        expect(child1.PayloadAtStartSourceStepID).toBe(before.ID); // the loop step was still Running
        expect(child2.PayloadAtStartSourceStepID).toBe(child1.ID);
        expect(h.Steps.filter((s) => s.PayloadAtStartSourceStepID === loopStep.ID)).toEqual([]);
        expect(h.Steps.slice(1).map((s) => s.PayloadAtStart)).toEqual([null, null, null]);

        // The loop step wrote its end after its children. Every saved start still resolves to what the step started from.
        const afterA = { items: ['a', 'b'], handled_a: true };
        const afterB = { items: ['a', 'b'], handled_a: true, handled_b: true };
        expect(JSON.parse(loopStep.SavedRow?.PayloadAtEnd ?? 'null')).toEqual(afterB);
        expect(JSON.parse(h.SavedStart(loopStep) ?? 'null')).toEqual(payload);
        expect(JSON.parse(h.SavedStart(child1) ?? 'null')).toEqual(payload);
        expect(JSON.parse(h.SavedStart(child2) ?? 'null')).toEqual(afterA);
    });
});

describe('BaseAgent.createStepEntity — INSERT order', () => {
    it('does not hold a step\'s INSERT behind the saves of the step it points at', async () => {
        const h = new Harness();
        h.UpdateDelayMs = 20;
        const source = await h.Create({ payloadAtEnd: { n: 1 } });
        h.UpdateDelayMs = 0;
        await h.Flush(); // the source's INSERT has landed
        await h.Internals.finalizeStepEntity(source, true); // the source's finalize UPDATE takes 20 ms

        const step = await h.Create({ payloadAtStart: { n: 1 } });
        await h.Flush();

        expect(step.PayloadAtStartSourceStepID).toBe(source.ID);
        expect(h.SaveIndex(step, 1, 'start')).toBeLessThan(h.SaveIndex(source, 2, 'end'));
    });

    it('holds a step\'s INSERT behind the INSERT of its parent step', async () => {
        const h = new Harness();
        h.InsertDelayMs = 20;
        const loopStep = await h.Create({ stepType: 'ForEach', stepName: 'ForEach: payload.items (2 items)', payloadAtStart: { n: 0 } });
        h.InsertDelayMs = 0;

        const child = await h.Create({ parentId: loopStep.ID, payloadAtStart: { n: 0 } });
        await h.Flush();

        expect(child.ParentID).toBe(loopStep.ID);
        expect(h.SaveIndex(child, 1, 'start')).toBeGreaterThan(h.SaveIndex(loopStep, 1, 'end'));
    });

    it('holds a loop child\'s INSERT behind its loop step only, not behind the earlier child it points at', async () => {
        const h = new Harness();
        const loopStep = await h.Create({ stepType: 'ForEach', stepName: 'ForEach: payload.items (2 items)', payloadAtStart: { n: 0 } });
        h.UpdateDelayMs = 20;
        const child1 = await h.Create({ parentId: loopStep.ID, payloadAtStart: { n: 0 }, payloadAtEnd: { n: 1 } });
        h.UpdateDelayMs = 0;
        await h.Flush(); // the INSERTs of the loop step and child 1 have landed
        await h.Internals.finalizeStepEntity(child1, true); // child 1's finalize UPDATE takes 20 ms

        const child2 = await h.Create({ parentId: loopStep.ID, payloadAtStart: { n: 1 } });
        await h.Flush();

        expect(child2.PayloadAtStartSourceStepID).toBe(child1.ID);
        expect(h.SaveIndex(child2, 1, 'start')).toBeLessThan(h.SaveIndex(child1, 2, 'end'));
    });
});

/** The ways a model call can fail: it returns an error, or it throws. */
const PROMPT_FAILURES: Array<[string, () => Promise<ScriptedPromptResult>]> = [
    ['returns an error', async () => ({ success: false, errorMessage: 'The model is overloaded' })],
    ['throws', async () => { throw new Error('socket hang up'); }],
];

describe("BaseAgent — the Rule: a step's PayloadAtEnd does not change after a later step points at it", () => {
    it('the Rule check reports an end that changes after a later step points at it', async () => {
        const h = new Harness();
        const source = await h.CreateFinished({ payloadAtEnd: { n: 1 } });
        const step = await h.Create({ payloadAtStart: { n: 1 } });
        expect(step.PayloadAtStartSourceStepID).toBe(source.ID);

        source.PayloadAtEnd = JSON.stringify({ n: 2 });

        expect(h.RuleViolations()).toEqual([`${source.Label}: PayloadAtEnd set to {"n":2} after a later step pointed at it with {"n":1}`]);
    });

    it('action post-processing: the rewritten end is the end that is saved, so the next step points at it', async () => {
        const h = new Harness();
        const start = { account: 'ACME' };
        const rewritten = { account: 'ACME', owner: 'Dana' };
        await h.CreateFinished({ stepType: 'Prompt', stepName: 'Execute Agent Prompt', payloadAtEnd: start });
        h.Internals._agentTypeInstance = {
            PreProcessActionStep: async () => undefined,
            PostProcessActionStep: async () => ({ newElements: { owner: 'Dana' } }),
        };
        h.Internals._effectiveActions = [LOOKUP_ACTION];
        h.Internals.ExecuteSingleAction = async () => ACTION_SUCCEEDED;
        h.InsertDelayMs = 20; // the action step's INSERT lands after the step has finished

        const result = await h.Internals.executeActionsStep(parentParams(), {
            step: 'Actions',
            terminate: false,
            newPayload: start,
            actions: [{ name: LOOKUP_ACTION.Name, params: {} }],
        });
        expect(result.newPayload).toEqual(rewritten);
        await h.Flush();
        h.InsertDelayMs = 0;
        const next = await h.Create({ stepType: 'Prompt', stepName: 'Execute Agent Prompt', payloadAtStart: result.newPayload });

        const actionStep = h.Only('Actions');
        expect(actionStep.SavedRow?.PayloadAtEnd).toBe(JSON.stringify(rewritten));
        expect(next.PayloadAtStartSourceStepID).toBe(actionStep.ID);
        await h.ExpectRuleHolds();
        expect(h.SavedStart(next)).toBe(JSON.stringify(rewritten));
    });

    it("action post-processing while the step's finalize UPDATE is still in flight: the rewrite is saved after it", async () => {
        const h = new Harness();
        const start = { account: 'ACME' };
        const rewritten = { account: 'ACME', owner: 'Dana' };
        await h.CreateFinished({ stepType: 'Prompt', stepName: 'Execute Agent Prompt', payloadAtEnd: start });
        h.Internals._agentTypeInstance = {
            PreProcessActionStep: async () => undefined,
            PostProcessActionStep: async () => ({ newElements: { owner: 'Dana' } }),
        };
        h.Internals._effectiveActions = [LOOKUP_ACTION];
        // The action runs longer than its step's INSERT, as a real one does.
        h.Internals.ExecuteSingleAction = async () => {
            await h.Flush();
            return ACTION_SUCCEEDED;
        };
        h.UpdateDelayMs = 20; // the action step's finalize UPDATE is still in flight when post-processing rewrites the end

        const result = await h.Internals.executeActionsStep(parentParams(), {
            step: 'Actions',
            terminate: false,
            newPayload: start,
            actions: [{ name: LOOKUP_ACTION.Name, params: {} }],
        });
        h.UpdateDelayMs = 0;
        const next = await h.Create({ stepType: 'Prompt', stepName: 'Execute Agent Prompt', payloadAtStart: result.newPayload });

        const actionStep = h.Only('Actions');
        expect(next.PayloadAtStartSourceStepID).toBe(actionStep.ID);
        await h.ExpectRuleHolds();
        expect(actionStep.SavedRow?.PayloadAtEnd).toBe(JSON.stringify(rewritten));
        expect(h.SavedStart(next)).toBe(JSON.stringify(rewritten));
    });

    it.each(PROMPT_FAILURES)('prompt failure (the model call %s): the end set on the failed step is the end that is saved, and retry deduplicates both start and end via PayloadAtStartSourceStepID/PayloadAtEndSourceStepID', async (_kind, executePrompt) => {
        const h = new Harness();
        const payload = { question: 'Which renewals are due?' };
        h.Internals._agentTypeInstance = { GetPromptForStep: async () => CHILD_PROMPT };
        h.Internals.preparePromptParams = async () => ({});
        h.Internals.executePrompt = executePrompt;
        h.InsertDelayMs = 20; // the failed step's INSERT lands after the step has finished

        const failed = await h.Internals.executePromptStep(parentParams(), PROMPT_CONFIG, { step: 'Retry', terminate: false, newPayload: payload });
        expect(failed.step).toBe('Failed');
        await h.Flush();
        h.InsertDelayMs = 0;
        await h.Internals.executePromptStep(parentParams(), PROMPT_CONFIG, failed); // the retry
        await h.Flush();

        const [failedStep, retryStep] = h.Steps;
        expect(failedStep.SavedRow?.PayloadAtEnd).toBe(JSON.stringify(payload));
        expect(failedStep.SavedRow?.PayloadAtEndSourceStepID).toBeNull();
        expect(retryStep.PayloadAtStart).toBeNull();
        expect(retryStep.PayloadAtStartSourceStepID).toBe(failedStep.ID);
        expect(retryStep.SavedRow?.PayloadAtEnd).toBeNull();
        expect(retryStep.SavedRow?.PayloadAtEndSourceStepID).toBe(failedStep.ID);
        await h.ExpectRuleHolds();
        expect(h.SavedStart(retryStep)).toBe(JSON.stringify(payload));
        expect(h.SavedEnd(retryStep)).toBe(JSON.stringify(payload));
    });

    it('child sub-agent: the merged end is the end that is saved, so the next step points at it', async () => {
        const h = new Harness();
        const payload = { topic: 'renewals' };
        await h.CreateFinished({ stepType: 'Prompt', stepName: 'Execute Agent Prompt', payloadAtEnd: payload });
        // No run record comes back, so the step's end is set only from the merged payload.
        h.Internals.ExecuteSubAgent = async () => ({ success: true, payload: { summary: 'done' } });
        h.InsertDelayMs = 20; // the sub-agent step's INSERT lands after the step has finished

        const result = await h.Internals.processSubAgentStep(parentParams(), {
            step: 'Sub-Agent',
            terminate: false,
            previousPayload: payload,
            newPayload: payload,
            subAgent: { name: 'ChildAgent1', message: 'Summarize the renewals', terminateAfter: false },
        });
        await h.Flush();
        h.InsertDelayMs = 0;
        const next = await h.Create({ stepType: 'Prompt', stepName: 'Execute Agent Prompt', payloadAtStart: result.newPayload });

        const subAgentStep = h.Only('Sub-Agent');
        expect(subAgentStep.SavedRow?.PayloadAtEnd).toBe(JSON.stringify(result.newPayload));
        expect(next.PayloadAtStartSourceStepID).toBe(subAgentStep.ID);
        await h.ExpectRuleHolds();
    });
});

describe('BaseAgent.finalizeStepEntity — PayloadAtEndSourceStepID deduplicates unchanged end payloads', () => {
    it('stores the canonical PayloadAtEnd on the first step and a 1-hop pointer (PayloadAtEndSourceStepID === step1.ID) on subsequent steps that leave the payload unchanged', async () => {
        const h = new Harness();
        const payload = { customer: 'Acme', status: 'open' };

        const step1 = await h.CreateFinished({
            stepType: 'Prompt',
            stepName: 'Execute Agent Prompt',
            payloadAtStart: payload,
            payloadAtEnd: payload,
        });
        const step2 = await h.CreateFinished({
            stepType: 'Actions',
            stepName: 'Execute Action: Lookup Account',
            payloadAtStart: payload,
            payloadAtEnd: payload,
        });
        const step3 = await h.CreateFinished({
            stepType: 'Prompt',
            stepName: 'Execute Agent Prompt',
            payloadAtStart: payload,
            payloadAtEnd: payload,
        });

        expect(step1.SavedRow?.PayloadAtStart).toBe(JSON.stringify(payload));
        expect(step1.SavedRow?.PayloadAtEnd).toBe(JSON.stringify(payload));
        expect(step1.SavedRow?.PayloadAtEndSourceStepID).toBeNull();

        for (const laterStep of [step2, step3]) {
            expect(laterStep.SavedRow?.PayloadAtStart).toBeNull();
            expect(laterStep.SavedRow?.PayloadAtStartSourceStepID).toBe(step1.ID);
            expect(laterStep.SavedRow?.PayloadAtEnd).toBeNull();
            expect(laterStep.SavedRow?.PayloadAtEndSourceStepID).toBe(step1.ID);
            expect(h.SavedStart(laterStep)).toBe(JSON.stringify(payload));
            expect(h.SavedEnd(laterStep)).toBe(JSON.stringify(payload));
        }
        expect(BaseAgent.LastStepPayload(h.Steps.map(s => s.SavedRow!))).toBe(JSON.stringify(payload));
    });
});

describe('BaseAgent InputData deduplication — Prompt step delta messages & Sub-Agent omission', () => {
    it('strips volatile <mj-runtime-state> messages and stores only per-turn deltas on subsequent Prompt steps', async () => {
        const h = new Harness();
        const payload = { query: 'status' };
        h.Internals._agentTypeInstance = { GetPromptForStep: async () => CHILD_PROMPT };
        h.Internals.preparePromptParams = async () => ({});
        h.Internals.executePrompt = async () => ({ success: false, errorMessage: 'Simulated failure' });

        const msg1 = { role: 'user', content: 'Hello agent' };
        const volatileMsg = { role: 'user', content: '<mj-runtime-state>{"turn":1}</mj-runtime-state>', metadata: { volatileState: true } };
        const msg2 = { role: 'assistant', content: 'Checking account...' };
        const params = {
            agent: { ID: PARENT_AGENT_ID, Name: 'Parent Agent' },
            contextUser: CONTEXT_USER,
            conversationMessages: [msg1, volatileMsg],
        };

        await h.Internals.executePromptStep(params, PROMPT_CONFIG, { step: 'Retry', terminate: false, newPayload: payload });
        params.conversationMessages.push(msg2);
        await h.Internals.executePromptStep(params, PROMPT_CONFIG, { step: 'Retry', terminate: false, newPayload: payload });
        await h.Flush();

        const [promptStep1, promptStep2] = h.Steps;
        const input1 = JSON.parse(promptStep1.SavedRow?.InputData ?? '{}');
        const input2 = JSON.parse(promptStep2.SavedRow?.InputData ?? '{}');

        // First prompt step stores non-volatile initial messages without volatileMsg
        expect(input1.conversationMessages).toEqual([msg1]);
        expect(input1.conversationMessagesDelta).toBeUndefined();

        // Second prompt step stores only the newly appended msg2 with conversationMessagesDelta: true
        expect(input2.conversationMessages).toEqual([msg2]);
        expect(input2.conversationMessagesDelta).toBe(true);
    });

    it('omits conversationMessages from Sub-Agent step InputData', async () => {
        const h = new Harness();
        const payload = { topic: 'renewals' };
        await h.CreateFinished({ stepType: 'Prompt', stepName: 'Execute Agent Prompt', payloadAtEnd: payload });
        h.Internals.ExecuteSubAgent = async () => ({ success: true, payload: { summary: 'done' } });

        const params = {
            agent: { ID: PARENT_AGENT_ID, Name: 'Parent Agent' },
            contextUser: CONTEXT_USER,
            conversationMessages: [{ role: 'user', content: 'Long conversation history' }],
        };
        await h.Internals.processSubAgentStep(params, {
            step: 'Sub-Agent',
            terminate: false,
            previousPayload: payload,
            newPayload: payload,
            subAgent: { name: 'ChildAgent1', message: 'Summarize the renewals', terminateAfter: false },
        });
        await h.Flush();

        const subAgentStep = h.Only('Sub-Agent');
        const subInput = JSON.parse(subAgentStep.SavedRow?.InputData ?? '{}');
        expect(subInput.conversationMessages).toBeUndefined();
        expect(subInput.subAgentName).toBe('ChildAgent1');
    });
});

describe('BaseAgent.finalizeAgentRun — the final payload', () => {
    it('sets FinalPayload and leaves the deprecated Result unset', async () => {
        const agent = new BaseAgent();
        const run = new FinalizedRun();
        const internals = agent as unknown as FinalizeInternals;
        internals._agentRun = run;
        internals._stepSaveQueue = { Flush: async () => ({ failures: 0, rejections: 0 }) };
        internals._depth = 0;
        internals._injectedMemory = { notes: [], examples: [] };
        internals._mediaOutputs = [];
        internals._fileOutputs = [];

        const result = await internals.finalizeAgentRun({ step: 'Success', terminate: true, message: 'done' }, { answer: 42 }, CONTEXT_USER);

        expect(result.success).toBe(true);
        expect(run.FinalPayload).toBe(JSON.stringify({ answer: 42 }));
        expect(run.Result).toBeNull();
    });
});
