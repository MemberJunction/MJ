import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EntityInfo, LogStatus, UserInfo } from '@memberjunction/core';
import { DecisionResult, type DecisionAnswer } from '@memberjunction/ai';
import { MJAIAgentRunEntityExtended, MJAIAgentRunStepEntityExtended, type DecisionAnsweringModel } from '@memberjunction/ai-core-plus';
import type { AIDecisionRunResult } from '@memberjunction/ai-prompts';
import { MJAIPromptRunEntity } from '@memberjunction/core-entities';
import { MemoryManagerAgent } from '../memory-manager-agent';
import { AgentDecisionService, type AgentDecisionAskParams } from '../AgentDecisionService';
import * as MemoryNoteGate from '../memory-note-gate';
import { FormatMemoryNoteExcerpt, MEMORY_NOTE_MAX_EXCERPT_CHARS } from '../memory-note-gate';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn()
    };
});

// ─── Fixtures ────────────────────────────────────────────────────────────────────────────────────

/** A candidate note, in the shape the extraction prompt returns it. */
interface NoteShape {
    type: 'Preference' | 'Constraint' | 'Context' | 'Example' | 'Issue';
    content: string;
    confidence: number;
    scopeLevel?: 'global' | 'company' | 'user';
    sourceConversationId?: string;
}

/** A conversation thread, in the shape extraction reads it. */
interface ThreadShape {
    conversationId: string;
    messages: Array<{ id: string; role: string; message: string; createdAt: Date; rating: number | null; ratingComment: string | null }>;
}

const CONVERSATION_A = 'aaaaaaaa-1111-4000-8000-000000000001';
const CONVERSATION_B = 'aaaaaaaa-1111-4000-8000-000000000002';

function thread(conversationId: string, turns: Array<[string, string]>): ThreadShape {
    return {
        conversationId,
        messages: turns.map(([role, message], i) => ({ id: `${conversationId}-${i}`, role, message, createdAt: new Date(0), rating: null, ratingComment: null }))
    };
}

/** An EntityInfo with just the named fields: enough for an entity object to hold them without a database. */
function entityInfo(name: string, fields: string[]): EntityInfo {
    return new EntityInfo({ Name: name, Fields: fields.map(field => ({ Name: field, Type: 'nvarchar', IsPrimaryKey: field === 'ID' })) });
}

const STEP_FIELDS = ['ID', 'AgentRunID', 'StepNumber', 'StepType', 'StepName', 'Status', 'StartedAt', 'CompletedAt', 'Success', 'ErrorMessage', 'TargetID', 'TargetLogID', 'InputData', 'OutputData'];

/** A run step that saves nowhere. */
class UnsavedStep extends MJAIAgentRunStepEntityExtended {
    public override async Save(): Promise<boolean> {
        return true;
    }
}

function agentRun(): MJAIAgentRunEntityExtended {
    const run = new MJAIAgentRunEntityExtended(entityInfo('MJ: AI Agent Runs', ['ID', 'AgentID']));
    run.ID = 'aaaaaaaa-2222-4000-8000-000000000001';
    run.AgentID = 'aaaaaaaa-2222-4000-8000-000000000002';
    return run;
}

/** The decision call's own prompt run, which carries its cost and tokens. */
function decisionPromptRun(): MJAIPromptRunEntity {
    const run = new MJAIPromptRunEntity(entityInfo('MJ: AI Prompt Runs', ['ID', 'TotalCost', 'TokensUsedRollup']));
    run.ID = 'aaaaaaaa-3333-4000-8000-000000000001';
    run.TotalCost = 0.0004;
    run.TokensUsedRollup = 180;
    return run;
}

/** Replies to every decision with `reply`, and records what it was asked. */
class ScriptedDecisionService extends AgentDecisionService {
    public readonly Calls: AgentDecisionAskParams[] = [];

    constructor(private readonly reply: (args: AgentDecisionAskParams) => AIDecisionRunResult) {
        super();
    }

    public override async Ask(args: AgentDecisionAskParams): Promise<AIDecisionRunResult> {
        this.Calls.push(args);
        return this.reply(args);
    }
}

/** Jev at the version the memory-note calibration was fitted on. */
const JEV: DecisionAnsweringModel = { ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.13-20260917' };

/**
 * A successful decision answering each question key with its probability, from the given model: the
 * MJ decision model on `modelInfo`, the model its driver resolved on `DecisionResult`.
 */
function answered(model: DecisionAnsweringModel, probabilities: Record<string, number>, promptRun?: MJAIPromptRunEntity): AIDecisionRunResult {
    const Answers: Record<string, DecisionAnswer> = {};
    for (const [key, probability] of Object.entries(probabilities)) {
        Answers[key] = { Kind: 'Likelihood', Probability: probability };
    }
    const driverResult = new DecisionResult(true, new Date(0), new Date(1));
    driverResult.Answers = Answers;
    driverResult.ResolvedModel = model.ResolvedModel ?? undefined;
    const modelName = model.ModelName ?? undefined;
    return { success: true, Answers, modelInfo: modelName ? { modelId: `model-${modelName}`, modelName } : undefined, DecisionResult: driverResult, promptRun };
}

/** The Memory Manager's log lines that name `text`. */
function loggedLines(text: string): string[] {
    return vi.mocked(LogStatus).mock.calls.map(call => String(call[0])).filter(line => line.includes(text));
}

/** The Memory Manager, with its run, its run steps and its decision service standing in for the database. */
class TestMemoryManagerAgent extends MemoryManagerAgent {
    public Run: MJAIAgentRunEntityExtended | null = null;
    public readonly CreatedSteps: MJAIAgentRunStepEntityExtended[] = [];

    public override get AgentRun(): MJAIAgentRunEntityExtended | null {
        return this.Run;
    }

    public SetDecisionService(service: AgentDecisionService): void {
        this._agentDecisionService = service;
    }

    public RunGate(notes: NoteShape[], threads: ThreadShape[], user: UserInfo, gateApplies: boolean = true): Promise<NoteShape[]> {
        return this.filterCandidateNotes(notes, threads, user, gateApplies);
    }

    /** As production: no step without a run. */
    protected override async createRunStep(stepType: 'Prompt' | 'Decision' | 'Validation', stepName: string): Promise<MJAIAgentRunStepEntityExtended | null> {
        if (!this.Run) {
            return null;
        }
        const step = new UnsavedStep(entityInfo('MJ: AI Agent Run Steps', STEP_FIELDS));
        step.ID = `aaaaaaaa-4444-4000-8000-${String(this.CreatedSteps.length + 1).padStart(12, '0')}`;
        step.AgentRunID = this.Run.ID;
        step.StepType = stepType;
        step.StepName = stepName;
        this.CreatedSteps.push(step);
        return step;
    }
}

/** The conversation excerpt of the state a decision was asked about. */
function excerptOf(call: AgentDecisionAskParams): string | undefined {
    const state = call.State;
    if (typeof state === 'string' || !('notes' in state)) {
        throw new Error('The gate asks about a note state');
    }
    const excerpt = state.conversationExcerpt;
    return typeof excerpt === 'string' ? excerpt : undefined;
}

// ─── Specs ───────────────────────────────────────────────────────────────────────────────────────

describe('MemoryManagerAgent - Decision Gate Integration', () => {
    const user = new UserInfo(null, { ID: 'aaaaaaaa-5555-4000-8000-000000000001', Email: 'test@example.com' });
    const oneThread = [thread(CONVERSATION_A, [['user', 'I prefer dark mode'], ['assistant', 'Understood']])];

    const sampleNotes: NoteShape[] = [
        { type: 'Preference', content: 'Prefers dark mode theme', confidence: 95 },
        { type: 'Constraint', content: 'Do not touch production DB', confidence: 85 },
        { type: 'Context', content: 'Short', confidence: 90 }, // content length < 10
        { type: 'Issue', content: 'Build failed on missing module', confidence: 70 }
    ];

    let agent: TestMemoryManagerAgent;

    beforeEach(() => {
        agent = new TestMemoryManagerAgent();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('has EnableDecisionGate false by default', () => {
        expect(agent.EnableDecisionGate).toBe(false);
    });

    it('allows toggling EnableDecisionGate via property setter', () => {
        agent.EnableDecisionGate = true;
        expect(agent.EnableDecisionGate).toBe(true);
        agent.EnableDecisionGate = false;
        expect(agent.EnableDecisionGate).toBe(false);
    });

    it('filters by self-confidence and length when EnableDecisionGate is false (default)', async () => {
        const decisions = new ScriptedDecisionService(() => answered(JEV, {}));
        agent.SetDecisionService(decisions);

        const filtered = await agent.RunGate(sampleNotes, oneThread, user);

        // Kept: 95 and 85 (length >= 10). Dropped: "Short" by length, 70 by confidence (< 80).
        expect(filtered.map(n => n.content)).toEqual(['Prefers dark mode theme', 'Do not touch production DB']);
        expect(decisions.Calls).toEqual([]);
    });

    it("never gates a failed run's corrective notes, which the gate was not measured on", async () => {
        agent.EnableDecisionGate = true;
        const decisions = new ScriptedDecisionService(() => answered(JEV, { n1: 0.01, n2: 0.01, n3: 0.99 }));
        agent.SetDecisionService(decisions);

        const filtered = await agent.RunGate(sampleNotes, oneThread, user, false);

        expect(filtered.map(n => n.content)).toEqual(['Prefers dark mode theme', 'Do not touch production DB']);
        expect(decisions.Calls).toEqual([]);
    });

    it('falls back to the self-confidence filter when the decision call fails', async () => {
        agent.EnableDecisionGate = true;
        const decisions = new ScriptedDecisionService(() => ({ success: false, errorMessage: 'Rate limit exceeded', Answers: {} }));
        agent.SetDecisionService(decisions);

        const filtered = await agent.RunGate(sampleNotes, oneThread, user);

        expect(decisions.Calls).toHaveLength(1);
        expect(filtered.map(n => n.content)).toEqual(['Prefers dark mode theme', 'Do not touch production DB']);
    });

    it.each<[string, DecisionAnsweringModel]>([
        ['a model with no calibration', { ModelName: 'uncalibrated-model-v1', ResolvedModel: 'vendor/uncalibrated-model-v1' }],
        ['Jev at another version', { ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.14-20261101' }],
        ['Jev with no resolved model reported', { ModelName: 'Jev' }],
        ['a model named constructor', { ModelName: 'constructor', ResolvedModel: 'constructor' }]
    ])('falls back to the confidence filter when %s answers', async (_label, model) => {
        agent.EnableDecisionGate = true;
        // Raw answers that would clear Jev's calibrated threshold for every note, n3 (self 70) included.
        const decisions = new ScriptedDecisionService(() => answered(model, { n1: 0.99, n2: 0.95, n3: 0.99 }));
        agent.SetDecisionService(decisions);

        const filtered = await agent.RunGate(sampleNotes, oneThread, user);

        expect(decisions.Calls).toHaveLength(1);
        // An uncalibrated model hasn't been shown to beat the self-reported confidence, so its
        // batch is filtered as it would be with the gate off: confidence >= 80 and length >= 10.
        expect(filtered.map(n => n.content)).toEqual(['Prefers dark mode theme', 'Do not touch production DB']);
    });

    it('logs an uncalibrated answering model once, however many batches and runs it answers', async () => {
        // One note per call: the three notes that pass the length check make three batches per run.
        vi.spyOn(MemoryNoteGate, 'MemoryNotePromptQuestionCap').mockReturnValue(1);
        const model: DecisionAnsweringModel = { ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.13-logged-once' };
        const decisions = new ScriptedDecisionService(() => answered(model, { n1: 0.99 }));
        const secondRun = new TestMemoryManagerAgent();
        for (const run of [agent, secondRun]) {
            run.EnableDecisionGate = true;
            run.SetDecisionService(decisions);
        }

        await agent.RunGate(sampleNotes, oneThread, user);
        await agent.RunGate(sampleNotes, oneThread, user);
        await secondRun.RunGate(sampleNotes, oneThread, user);

        expect(decisions.Calls).toHaveLength(9);
        expect(loggedLines('typesafe/jev-1.13-logged-once')).toEqual([
            'Memory Manager: Jev (typesafe/jev-1.13-logged-once) has no memory-note calibration (MEMORY_NOTE_DECISION_CALIBRATION), so the decision gate falls back to the confidence filter for its batches'
        ]);
    });

    it('keeps the notes whose calibrated probability reaches the threshold when a calibrated model answers', async () => {
        agent.EnableDecisionGate = true;
        // After the length check: n1 "Prefers dark mode theme" (self 95), n2 "Do not touch production DB"
        // (self 85), n3 "Build failed on missing module" (self 70). Jev's raw 0.95 and 0.9 calibrate
        // above the threshold, its raw 0.6 well below it, so the gate overrides the self-report both ways.
        agent.SetDecisionService(new ScriptedDecisionService(() => answered(JEV, { n1: 0.95, n2: 0.6, n3: 0.9 })));

        const filtered = await agent.RunGate(sampleNotes, oneThread, user);

        expect(filtered.map(n => n.content)).toEqual(['Prefers dark mode theme', 'Build failed on missing module']);
    });

    it("cuts at Jev's shipped operating point: raw 0.85 is kept, raw 0.835 is not, whatever the self-report", async () => {
        agent.EnableDecisionGate = true;
        // Jev (A 3.6391, B -5.7059) reaches a calibrated 0.6 at a raw 0.8428: raw 0.85 calibrates to
        // 0.647 and raw 0.835 to 0.549. The self-report would have kept the second and dropped the first.
        const notes: NoteShape[] = [
            { type: 'Preference', content: 'Prefers weekly summaries', confidence: 70 },
            { type: 'Preference', content: 'Prefers metric units', confidence: 95 }
        ];
        agent.SetDecisionService(new ScriptedDecisionService(() => answered(JEV, { n1: 0.85, n2: 0.835 })));

        const filtered = await agent.RunGate(notes, oneThread, user);

        expect(filtered.map(n => n.content)).toEqual(['Prefers weekly summaries']);
    });

    it('keeps the self-reported rule for a note the calibrated model gave no usable answer for', async () => {
        agent.EnableDecisionGate = true;
        const notes: NoteShape[] = [
            { type: 'Preference', content: 'Prefers weekly summaries', confidence: 70 },
            { type: 'Preference', content: 'Prefers metric units', confidence: 95 },
            { type: 'Context', content: 'Works on the billing team', confidence: 70 }
        ];
        agent.SetDecisionService(new ScriptedDecisionService(() => answered(JEV, { n1: 0.95 })));

        const filtered = await agent.RunGate(notes, oneThread, user);

        // n1 by the gate; n2 and n3 unanswered, so the self-report keeps n2 (95) and drops n3 (70).
        expect(filtered.map(n => n.content)).toEqual(['Prefers weekly summaries', 'Prefers metric units']);
    });

    describe("the gate's cost counts toward the agent run", () => {
        it("adds the decision's step to the run's steps, carrying the decision's prompt run", async () => {
            agent.EnableDecisionGate = true;
            agent.Run = agentRun();
            const promptRun = decisionPromptRun();
            agent.SetDecisionService(new ScriptedDecisionService(() => answered(JEV, { n1: 0.95, n2: 0.9, n3: 0.2 }, promptRun)));

            await agent.RunGate(sampleNotes, oneThread, user);

            // BaseAgent sums a Decision step's PromptRun over the run's Steps for its totals and its
            // MaxCostPerRun / MaxTokensPerRun checks, so the step must be there, with the prompt run on it.
            const decisionSteps = agent.Run.Steps.filter(s => s.StepType === 'Decision');
            expect(decisionSteps).toHaveLength(1);
            expect(decisionSteps[0]).toBe(agent.CreatedSteps[0]);
            expect(decisionSteps[0].PromptRun).toBe(promptRun);
            expect(decisionSteps[0].TargetLogID).toBe(promptRun.ID);
            expect(decisionSteps[0].Status).toBe('Completed');
        });

        it('adds one step per decision call, a failed one included', async () => {
            agent.EnableDecisionGate = true;
            agent.Run = agentRun();
            vi.spyOn(MemoryNoteGate, 'MemoryNotePromptQuestionCap').mockReturnValue(2);
            agent.SetDecisionService(new ScriptedDecisionService(() => ({ success: false, errorMessage: 'down', Answers: {} })));

            await agent.RunGate(sampleNotes, oneThread, user);

            expect(agent.Run.Steps.map(s => [s.StepType, s.Status])).toEqual([['Decision', 'Failed'], ['Decision', 'Failed']]);
        });
    });

    describe('each note is judged against its own conversation', () => {
        // The review's probe: A is a long conversation, B a short one that states the preference.
        const longA = thread(CONVERSATION_A, Array.from({ length: 30 }, (_, i): [string, string] => [
            i % 2 === 0 ? 'user' : 'assistant',
            `Turn ${i} about the quarterly revenue report: its columns, its filters, its export options and who reads it, discussed at length.`
        ]));
        const shortB = thread(CONVERSATION_B, [['user', 'Please always answer me in Spanish from now on.'], ['assistant', 'Entendido.']]);
        const fromA: NoteShape = { type: 'Context', content: 'Works on the quarterly revenue report', confidence: 90, sourceConversationId: CONVERSATION_A };
        const fromB: NoteShape = { type: 'Preference', content: 'User wants all answers in Spanish', confidence: 90, sourceConversationId: CONVERSATION_B.toUpperCase() };

        it('asks about each conversation separately, with only that conversation as the excerpt', async () => {
            agent.EnableDecisionGate = true;
            const decisions = new ScriptedDecisionService(args => answered(JEV, Object.fromEntries(Object.keys(args.Questions).map(k => [k, 0.95]))));
            agent.SetDecisionService(decisions);

            const filtered = await agent.RunGate([fromA, fromB], [longA, shortB], user);

            expect(filtered).toEqual([fromA, fromB]);
            expect(decisions.Calls).toHaveLength(2);
            const askedAboutB = decisions.Calls.find(call => Object.values(call.Questions).some(q => q.Instructions.includes('Spanish')));
            const askedAboutA = decisions.Calls.find(call => call !== askedAboutB);
            if (!askedAboutA || !askedAboutB) {
                throw new Error('Expected one call per conversation');
            }
            const excerptB = excerptOf(askedAboutB) ?? '';
            const excerptA = excerptOf(askedAboutA) ?? '';
            expect(Object.keys(askedAboutB.Questions)).toEqual(['n1']);
            expect(excerptB).toContain('always answer me in Spanish');
            expect(excerptB).not.toContain('quarterly revenue');
            expect(excerptA).not.toContain('Spanish');
            expect(excerptA.length).toBe(MEMORY_NOTE_MAX_EXCERPT_CHARS);
        });

        it("quotes the conversation exactly as the measurement's corpus did", async () => {
            agent.EnableDecisionGate = true;
            const decisions = new ScriptedDecisionService(() => answered(JEV, { n1: 0.95 }));
            agent.SetDecisionService(decisions);

            await agent.RunGate([fromB], [longA, shortB], user);

            expect(excerptOf(decisions.Calls[0])).toBe(
                FormatMemoryNoteExcerpt(shortB.messages.map(m => ({ role: m.role, text: m.message })))
            );
            expect(excerptOf(decisions.Calls[0])).toBe('[user]: Please always answer me in Spanish from now on.\n[assistant]: Entendido.');
        });

        it('never judges a note against another conversation when it names none of them', async () => {
            agent.EnableDecisionGate = true;
            const decisions = new ScriptedDecisionService(() => answered(JEV, { n1: 0.01 }));
            agent.SetDecisionService(decisions);
            const unnamed: NoteShape = { type: 'Preference', content: 'Prefers concise replies', confidence: 90 };

            const filtered = await agent.RunGate([unnamed], [longA, shortB], user);

            expect(decisions.Calls).toEqual([]);
            expect(filtered).toEqual([unnamed]);
        });
    });

    it('batches decision calls when a conversation has more notes than the prompt question cap', async () => {
        agent.EnableDecisionGate = true;
        vi.spyOn(MemoryNoteGate, 'MemoryNotePromptQuestionCap').mockReturnValue(2);
        const manyNotes: NoteShape[] = ['one', 'two', 'three', 'four', 'five'].map(n => ({
            type: 'Preference',
            content: `Long note ${n} for candidate testing`,
            confidence: 90
        }));
        // Every call fails, so each batch falls back to the confidence filter and every note is kept.
        const decisions = new ScriptedDecisionService(() => ({ success: false, errorMessage: 'Simulated failover test', Answers: {} }));
        agent.SetDecisionService(decisions);

        const filtered = await agent.RunGate(manyNotes, oneThread, user);

        expect(decisions.Calls.map(c => Object.keys(c.Questions).length)).toEqual([2, 2, 1]);
        expect(filtered).toEqual(manyNotes);
    });
});
